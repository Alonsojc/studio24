import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve(process.cwd(), 'supabase-hardening.sql'), 'utf8');

function policy(name: string): string {
  const match = sql.match(new RegExp(`create policy "${name}"[\\s\\S]*?;`, 'i'));
  if (!match) throw new Error(`Policy not found: ${name}`);
  return match[0];
}

describe('supabase-hardening.sql', () => {
  it('mueve helpers RLS al schema privado y revoca helpers públicos', () => {
    expect(sql).toContain('create schema if not exists app_private');
    expect(sql).toContain('create or replace function app_private.current_user_team_id()');
    expect(sql).toContain('create or replace function app_private.current_user_has_role');
    expect(sql).toContain(
      "execute 'revoke execute on function public.current_user_team_id() from public, anon, authenticated'",
    );
    expect(sql).toContain(
      "execute 'revoke execute on function public.current_user_has_role(text[]) from public, anon, authenticated'",
    );
    expect(sql).not.toContain('grant execute on function public.current_user_team_id() to authenticated');
  });

  it('mantiene RLS por rol para producción y finanzas', () => {
    expect(policy('Production roles insert pedidos')).toContain(
      "app_private.current_user_has_role('admin', 'operador')",
    );
    expect(policy('Production roles insert pedidos')).not.toContain("'contador'");

    expect(policy('Finance roles insert ingresos')).toContain("app_private.current_user_has_role('admin', 'contador')");
    expect(policy('Finance roles insert ingresos')).not.toContain("'operador'");

    expect(policy('Admin deletes ingresos')).toContain("app_private.current_user_has_role('admin')");
    expect(policy('Admin deletes ingresos')).not.toContain("'contador'");
  });

  it('usa folios transaccionales con upsert atómico', () => {
    const nextFolio = sql.match(/create or replace function public\.next_folio[\s\S]*?\$\$;/i)?.[0] || '';
    expect(nextFolio).toContain('security invoker');
    expect(nextFolio).toContain('insert into public.folio_counter');
    expect(nextFolio).toContain('on conflict (team_id)');
    expect(nextFolio).toContain('do update set counter = public.folio_counter.counter + 1');
    expect(nextFolio).toContain('returning counter into v_next');
  });

  it('bloquea ingresos duplicados por pedido en el mismo equipo', () => {
    expect(sql).toContain('create unique index if not exists ingresos_team_pedido_unique');
    expect(sql).toContain('on ingresos(team_id, pedido_id)');
    expect(sql).toContain("where coalesce(pedido_id, '') <> ''");
  });

  it('bloquea sobrepagos y totales incorrectos en pedidos', () => {
    expect(sql).toContain('pedidos_payment_not_over_total');
    expect(sql).toContain('check (monto_pagado <= monto_total)');
    expect(sql).toContain('pedidos_total_matches_items');
    expect(sql).toContain('check (abs(monto_total - (piezas * precio_unitario)) <= 0.01)');
  });

  it('mantiene fotos por equipo y limita quién escribe archivos', () => {
    expect(policy('Team views team photos')).toContain('app_private.current_user_team_id()');
    expect(policy('Team views team photos')).not.toContain('auth.uid()::text');
    expect(policy('Team uploads team photos')).toContain("app_private.current_user_has_role('admin', 'operador')");
    expect(policy('Team uploads own facturas')).toContain("app_private.current_user_has_role('admin', 'contador')");
  });

  it('configura límites de buckets y audit log admin-only', () => {
    expect(sql).toContain("'backups', 'backups', false, 5 * 1024 * 1024");
    expect(sql).toContain("'facturas', 'facturas', false, 10 * 1024 * 1024");
    expect(sql).toContain("'photos', 'photos', false, 5 * 1024 * 1024");
    expect(policy('Admins read audit log')).toContain("app_private.current_user_has_role('admin')");
    expect(sql).toContain('create trigger audit_%I after insert or update or delete');
  });
});
