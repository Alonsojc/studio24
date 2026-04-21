/**
 * Supabase Edge Function: fetch-inpc
 *
 * Trae los valores del INPC desde el Banco de Información Económica de INEGI
 * y los persiste en la tabla `inpc`. Pensada para:
 *   - Ejecutarse una vez al mes vía pg_cron (ver supabase-inpc-cron.sql).
 *   - Llamarse manualmente desde la UI (botón "Sincronizar con INEGI") para
 *     rescate si el cron falla o el contador quiere forzar la actualización.
 *
 * Requisitos de configuración (una sola vez, via Supabase CLI):
 *   supabase secrets set INEGI_TOKEN=<tu_token>
 *
 * Obtener token gratuito en:
 *   https://www.inegi.org.mx/app/api/ → "Consulta de datos"
 *
 * Despliegue:
 *   supabase functions deploy fetch-inpc
 */

// @ts-expect-error — Deno runtime globals not typed in Node tsconfig.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error — Supabase client for Deno edge runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Indicador INEGI: INPC general mensual, base 2Q jul 2018 = 100.
const INPC_INDICATOR = '628194';
const INEGI_URL = (token: string) =>
  `https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR/${INPC_INDICATOR}/es/0700/false/BIE/2.0/${token}?type=json`;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface IneghiObservation {
  TIME_PERIOD: string; // "202401" formato YYYYMM
  OBS_VALUE: string; // valor como string
}

interface IneghiResponse {
  Series?: Array<{
    OBSERVATIONS?: IneghiObservation[];
  }>;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // @ts-expect-error Deno env
  const token = Deno.env.get('INEGI_TOKEN');
  if (!token) {
    return jsonResponse(500, { error: 'Falta INEGI_TOKEN en secrets' });
  }

  try {
    const resp = await fetch(INEGI_URL(token));
    if (!resp.ok) {
      return jsonResponse(502, { error: `INEGI respondió ${resp.status}` });
    }
    const data = (await resp.json()) as IneghiResponse;
    const obs = data.Series?.[0]?.OBSERVATIONS || [];
    if (obs.length === 0) {
      return jsonResponse(502, { error: 'INEGI devolvió 0 observaciones' });
    }

    const rows = obs
      .map((o) => {
        const period = o.TIME_PERIOD; // YYYYMM
        if (!period || period.length !== 6) return null;
        const year = parseInt(period.substring(0, 4), 10);
        const month = parseInt(period.substring(4, 6), 10);
        const valor = parseFloat(o.OBS_VALUE);
        if (isNaN(year) || isNaN(month) || isNaN(valor)) return null;
        return { year, month, valor, source: 'inegi', updated_at: new Date().toISOString() };
      })
      .filter((r): r is { year: number; month: number; valor: number; source: string; updated_at: string } => r !== null);

    if (rows.length === 0) {
      return jsonResponse(502, { error: 'No se pudo parsear ninguna observación' });
    }

    // @ts-expect-error Deno env
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-expect-error Deno env
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Upsert: si el valor del mes ya existe con otro source, INEGI gana.
    const { error } = await supabase.from('inpc').upsert(rows, { onConflict: 'year,month' });
    if (error) {
      return jsonResponse(500, { error: error.message });
    }

    return jsonResponse(200, {
      updated: rows.length,
      latest: rows[rows.length - 1],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error desconocido';
    return jsonResponse(500, { error: message });
  }
});
