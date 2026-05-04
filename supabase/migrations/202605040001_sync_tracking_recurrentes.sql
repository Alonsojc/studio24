-- Studio 24 sync/versioning, public tracking tokens, and transactional recurrentes.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  tbl text;
  has_created_at boolean;
begin
  foreach tbl in array array[
    'clientes', 'proveedores', 'ingresos', 'egresos', 'pedidos',
    'productos', 'cotizaciones', 'egresos_recurrentes', 'inventario',
    'disenos', 'plantillas', 'config'
  ] loop
    if to_regclass('public.' || tbl) is not null then
      execute format('alter table public.%I add column if not exists updated_at timestamptz default now()', tbl);
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public' and table_name = tbl and column_name = 'created_at'
      )
      into has_created_at;
      if has_created_at then
        execute format('update public.%I set updated_at = coalesce(updated_at, created_at, now()) where updated_at is null', tbl);
      else
        execute format('update public.%I set updated_at = coalesce(updated_at, now()) where updated_at is null', tbl);
      end if;
      execute format('drop trigger if exists set_%I_updated_at on public.%I', tbl, tbl);
      execute format(
        'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
        tbl,
        tbl
      );
    end if;
  end loop;
end $$;

alter table public.pedidos add column if not exists tracking_token text;
update public.pedidos
set tracking_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where tracking_token is null or tracking_token = '';
create unique index if not exists pedidos_tracking_token_key
  on public.pedidos(tracking_token)
  where tracking_token is not null and tracking_token <> '';

alter table public.recurrentes_log add column if not exists recurrente_id text;
alter table public.recurrentes_log add column if not exists yyyy_mm text;
with ranked as (
  select id, row_number() over (partition by team_id, log_key order by created_at, id) as rn
  from public.recurrentes_log
)
delete from public.recurrentes_log r
using ranked
where r.id = ranked.id and ranked.rn > 1;
create unique index if not exists recurrentes_log_team_log_key_idx
  on public.recurrentes_log(team_id, log_key);
create unique index if not exists recurrentes_log_team_recurrente_month_idx
  on public.recurrentes_log(team_id, recurrente_id, yyyy_mm)
  where recurrente_id is not null and yyyy_mm is not null;

create index if not exists ingresos_team_fecha_idx on public.ingresos(team_id, fecha);
create index if not exists egresos_team_fecha_idx on public.egresos(team_id, fecha);
create index if not exists pedidos_team_fecha_pedido_idx on public.pedidos(team_id, fecha_pedido);

create or replace function public.create_recurrente_egreso(
  p_log_key text,
  p_recurrente_id text,
  p_yyyy_mm text,
  p_egreso jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  v_team_id uuid;
  v_inserted_log int;
  v_egreso public.egresos%rowtype;
begin
  v_team_id := app_private.current_user_team_id();
  if auth.uid() is null or v_team_id is null then
    raise exception 'No authenticated team';
  end if;

  if not app_private.current_user_has_role('admin', 'contador') then
    raise exception 'Insufficient role for recurring expenses';
  end if;

  insert into public.recurrentes_log (team_id, user_id, log_key, recurrente_id, yyyy_mm)
  values (v_team_id, auth.uid(), p_log_key, p_recurrente_id, p_yyyy_mm)
  on conflict (team_id, log_key) do nothing;

  get diagnostics v_inserted_log = row_count;
  if v_inserted_log = 0 then
    return jsonb_build_object('created', false);
  end if;

  insert into public.egresos (
    id, team_id, user_id, fecha, descripcion, categoria, subcategoria,
    proveedor_id, monto, iva, monto_total, forma_pago, factura,
    numero_factura, uuid_cfdi, xml_url, pdf_url, solo_fiscal, notas,
    created_at, updated_at
  )
  values (
    coalesce(p_egreso->>'id', gen_random_uuid()::text),
    v_team_id,
    auth.uid(),
    p_egreso->>'fecha',
    p_egreso->>'descripcion',
    p_egreso->>'categoria',
    coalesce(p_egreso->>'subcategoria', ''),
    coalesce(p_egreso->>'proveedor_id', ''),
    coalesce((p_egreso->>'monto')::numeric, 0),
    coalesce((p_egreso->>'iva')::numeric, 0),
    coalesce((p_egreso->>'monto_total')::numeric, 0),
    coalesce(p_egreso->>'forma_pago', 'efectivo'),
    coalesce((p_egreso->>'factura')::boolean, false),
    coalesce(p_egreso->>'numero_factura', ''),
    nullif(p_egreso->>'uuid_cfdi', ''),
    nullif(p_egreso->>'xml_url', ''),
    nullif(p_egreso->>'pdf_url', ''),
    coalesce((p_egreso->>'solo_fiscal')::boolean, false),
    coalesce(p_egreso->>'notas', ''),
    coalesce((p_egreso->>'created_at')::timestamptz, now()),
    now()
  )
  returning * into v_egreso;

  return jsonb_build_object('created', true, 'egreso', to_jsonb(v_egreso));
end;
$$;

grant execute on function public.create_recurrente_egreso(text, text, text, jsonb) to authenticated;

create or replace function public.get_public_pedido_tracking(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pedido', jsonb_build_object(
      'id', p.id,
      'clienteId', p.cliente_id,
      'descripcion', p.descripcion,
      'concepto', p.concepto,
      'piezas', p.piezas,
      'precioUnitario', p.precio_unitario,
      'montoTotal', p.monto_total,
      'costoMateriales', p.costo_materiales,
      'estado', p.estado,
      'estadoPago', p.estado_pago,
      'montoPagado', p.monto_pagado,
      'maquina', p.maquina,
      'archivoDiseno', p.archivo_diseno,
      'fotos', p.fotos,
      'inventarioUsado', coalesce(p.inventario_usado, '[]'::jsonb),
      'pagos', coalesce(p.pagos, '[]'::jsonb),
      'checklist', p.checklist,
      'fechaPedido', p.fecha_pedido,
      'fechaEntrega', p.fecha_entrega,
      'fechaEntregaReal', p.fecha_entrega_real,
      'urgente', p.urgente,
      'notas', '',
      'trackingToken', null,
      'createdAt', p.created_at,
      'updatedAt', p.updated_at
    ),
    'cliente', case when c.id is null then null else jsonb_build_object('nombre', c.nombre) end,
    'config', case when cfg.team_id is null then null else jsonb_build_object(
      'nombreNegocio', cfg.nombre_negocio,
      'telefono', cfg.telefono,
      'email', cfg.email
    ) end
  )
  from public.pedidos p
  left join public.clientes c on c.team_id = p.team_id and c.id = p.cliente_id
  left join public.config cfg on cfg.team_id = p.team_id
  where p.tracking_token = p_token
    and p_token ~ '^[A-Za-z0-9_-]{48,}$'
  limit 1;
$$;

revoke all on function public.get_public_pedido_tracking(text) from public;
grant execute on function public.get_public_pedido_tracking(text) to anon, authenticated;
