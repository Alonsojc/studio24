/**
 * Supabase Edge Function: fetch-inpc
 *
 * Trae los valores del INPC desde la API de Banxico (SIE) y los persiste
 * en la tabla `inpc`. Banxico es la fuente oficial alternativa a INEGI y
 * su API es más simple (sin áreas geográficas ni fuentes ambiguas).
 *
 * Configuración (una sola vez):
 *   supabase secrets set BANXICO_TOKEN=<tu_token> FETCH_INPC_SECRET=<secreto_largo>
 *
 * Token gratuito (registro rápido):
 *   https://www.banxico.org.mx/SieAPIRest/service/v1/token
 *
 * Despliegue:
 *   supabase functions deploy fetch-inpc --no-verify-jwt
 */

// @ts-expect-error — Deno runtime globals not typed in Node tsconfig.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error — Supabase client for Deno edge runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Serie de Banxico SIE: INPC General Mensual (Índice General, base 2018=100).
// SP1 = "IPC Por objeto del gasto Nacional — Índice General" (cuadro CP151).
// NO usar SP74625 (Subyacente) ni SP74665 (inflación anual %).
const BANXICO_SERIE = 'SP1';
const BANXICO_URL = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${BANXICO_SERIE}/datos`;
const CRON_SECRET_HEADER = 'x-cron-secret';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': `authorization, x-client-info, apikey, content-type, ${CRON_SECRET_HEADER}`,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface BanxicoDato {
  fecha: string; // "dd/mm/yyyy"
  dato: string; // valor numérico como string
}

interface BanxicoResponse {
  bmx?: {
    series?: Array<{
      idSerie?: string;
      titulo?: string;
      datos?: BanxicoDato[];
    }>;
  };
}

/** Parsea una fecha "dd/mm/yyyy" al (year, month) que usamos. */
function parseFechaBanxico(fecha: string): { year: number; month: number } | null {
  const parts = fecha.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (month < 1 || month > 12) return null;
  return { year, month };
}

async function rejectUnauthorized(req: Request, supabase: ReturnType<typeof createClient>): Promise<string | null> {
  // pg_cron calls use a shared secret. Browser/manual calls must be authenticated
  // and limited to users who can manage fiscal data.
  // @ts-expect-error Deno env
  const cronSecret = Deno.env.get('FETCH_INPC_SECRET');
  const providedSecret = req.headers.get(CRON_SECRET_HEADER);
  if (cronSecret && providedSecret && providedSecret === cronSecret) return null;

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return 'No autorizado';

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) return 'No autorizado';

  const { data: member, error: roleError } = await supabase
    .from('team_members')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['admin', 'contador'])
    .limit(1)
    .maybeSingle();
  if (roleError) return 'No se pudo validar el rol';
  if (!member) return 'Permiso insuficiente';
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Método no permitido' });
  }

  // @ts-expect-error Deno env
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  // @ts-expect-error Deno env
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(500, { error: 'Faltan credenciales internas de Supabase' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const unauthorizedReason = await rejectUnauthorized(req, supabase);
  if (unauthorizedReason) {
    return jsonResponse(401, { error: unauthorizedReason });
  }

  // @ts-expect-error Deno env
  const token = Deno.env.get('BANXICO_TOKEN');
  if (!token) {
    console.error('[fetch-inpc] BANXICO_TOKEN missing');
    return jsonResponse(500, { error: 'Falta BANXICO_TOKEN en secrets' });
  }

  try {
    // Banxico acepta el token por header (preferido) o query string.
    const resp = await fetch(BANXICO_URL, {
      headers: { 'Bmx-Token': token, Accept: 'application/json' },
    });
    console.log('[fetch-inpc] Banxico status', resp.status);

    if (!resp.ok) {
      const body = await resp.text();
      console.error('[fetch-inpc] Banxico error body:', body.slice(0, 500));
      return jsonResponse(502, { error: `Banxico respondió ${resp.status}`, body: body.slice(0, 500) });
    }

    const raw = await resp.text();
    let data: BanxicoResponse;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      return jsonResponse(502, { error: 'Banxico devolvió algo que no es JSON', body: raw.slice(0, 300) });
    }

    const datos = data.bmx?.series?.[0]?.datos || [];
    console.log('[fetch-inpc] got', datos.length, 'observations');
    if (datos.length === 0) {
      return jsonResponse(502, { error: 'Banxico devolvió 0 observaciones', body: raw.slice(0, 300) });
    }

    const rows = datos
      .map((o) => {
        const parsed = parseFechaBanxico(o.fecha || '');
        if (!parsed) return null;
        const valor = parseFloat((o.dato || '').replace(/,/g, ''));
        if (isNaN(valor)) return null;
        return {
          year: parsed.year,
          month: parsed.month,
          valor,
          source: 'banxico',
          updated_at: new Date().toISOString(),
        };
      })
      .filter((r): r is { year: number; month: number; valor: number; source: string; updated_at: string } => r !== null);

    console.log('[fetch-inpc] parsed', rows.length, 'valid rows');
    if (rows.length === 0) {
      return jsonResponse(502, { error: 'No se pudo parsear ninguna observación' });
    }

    const { error } = await supabase.from('inpc').upsert(rows, { onConflict: 'year,month' });
    if (error) {
      console.error('[fetch-inpc] supabase upsert error:', error.message);
      return jsonResponse(500, { error: error.message });
    }

    console.log('[fetch-inpc] upsert OK,', rows.length, 'rows');
    return jsonResponse(200, {
      updated: rows.length,
      latest: rows[rows.length - 1],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error desconocido';
    console.error('[fetch-inpc] exception:', message);
    return jsonResponse(500, { error: message });
  }
});
