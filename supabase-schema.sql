-- Studio 24 — Schema para Supabase
-- Ejecutar en SQL Editor de Supabase (una sola vez)

-- Clientes
create table if not exists clientes (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  nombre text not null,
  telefono text default '',
  email text default '',
  direccion text default '',
  logo text default '',
  notas text default '',
  created_at timestamptz default now()
);
alter table clientes enable row level security;
create policy "Users see own clientes" on clientes for all using (auth.uid() = user_id);

-- Proveedores
create table if not exists proveedores (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  nombre text not null,
  contacto text default '',
  telefono text default '',
  email text default '',
  tipo text default '',
  logo text default '',
  notas text default '',
  created_at timestamptz default now()
);
alter table proveedores enable row level security;
create policy "Users see own proveedores" on proveedores for all using (auth.uid() = user_id);

-- Ingresos
create table if not exists ingresos (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  fecha text not null,
  cliente_id text default '',
  pedido_id text default '',
  descripcion text not null,
  concepto text not null,
  monto numeric default 0,
  iva numeric default 0,
  monto_total numeric default 0,
  forma_pago text default 'efectivo',
  factura boolean default false,
  numero_factura text default '',
  notas text default '',
  created_at timestamptz default now()
);
alter table ingresos enable row level security;
create policy "Users see own ingresos" on ingresos for all using (auth.uid() = user_id);

-- Egresos
create table if not exists egresos (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  fecha text not null,
  descripcion text not null,
  categoria text not null,
  subcategoria text default '',
  proveedor_id text default '',
  monto numeric default 0,
  iva numeric default 0,
  monto_total numeric default 0,
  forma_pago text default 'efectivo',
  factura boolean default false,
  numero_factura text default '',
  notas text default '',
  created_at timestamptz default now()
);
alter table egresos enable row level security;
create policy "Users see own egresos" on egresos for all using (auth.uid() = user_id);

-- Pedidos
create table if not exists pedidos (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  cliente_id text default '',
  descripcion text not null,
  concepto text default 'solo_bordado',
  piezas integer default 1,
  precio_unitario numeric default 0,
  monto_total numeric default 0,
  costo_materiales numeric default 0,
  estado text default 'pendiente',
  estado_pago text default 'pendiente',
  monto_pagado numeric default 0,
  maquina text default '',
  archivo_diseno text default '',
  fotos jsonb default '[]',
  checklist jsonb default '{"archivoListo":false,"hilosCargados":false,"aroColocado":false,"estabilizador":false,"pruebaHecha":false}',
  fecha_pedido text not null,
  fecha_entrega text default '',
  fecha_entrega_real text default '',
  urgente boolean default false,
  notas text default '',
  created_at timestamptz default now()
);
alter table pedidos enable row level security;
create policy "Users see own pedidos" on pedidos for all using (auth.uid() = user_id);

-- Productos
create table if not exists productos (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  nombre text not null,
  categoria text default 'bordado',
  precio numeric default 0,
  activo boolean default true,
  created_at timestamptz default now()
);
alter table productos enable row level security;
create policy "Users see own productos" on productos for all using (auth.uid() = user_id);

-- Cotizaciones
create table if not exists cotizaciones (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  folio text not null,
  cliente_nombre text default '',
  cliente_empresa text default '',
  items jsonb default '[]',
  con_iva boolean default false,
  notas text default '',
  subtotal numeric default 0,
  iva numeric default 0,
  total numeric default 0,
  created_at timestamptz default now()
);
alter table cotizaciones enable row level security;
create policy "Users see own cotizaciones" on cotizaciones for all using (auth.uid() = user_id);

-- Egresos Recurrentes
create table if not exists egresos_recurrentes (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  descripcion text not null,
  categoria text not null,
  subcategoria text default '',
  proveedor_id text default '',
  monto numeric default 0,
  forma_pago text default 'tarjeta',
  factura boolean default false,
  dia_del_mes integer default 1,
  activo boolean default true,
  created_at timestamptz default now()
);
alter table egresos_recurrentes enable row level security;
create policy "Users see own egresos_recurrentes" on egresos_recurrentes for all using (auth.uid() = user_id);

-- Inventario
create table if not exists inventario (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  nombre text not null,
  categoria text default 'hilo',
  unidad text default 'conos',
  stock numeric default 0,
  stock_minimo numeric default 5,
  costo numeric default 0,
  color text default '',
  marca text default '',
  ubicacion text default '',
  notas text default '',
  created_at timestamptz default now()
);
alter table inventario enable row level security;
create policy "Users see own inventario" on inventario for all using (auth.uid() = user_id);

-- Diseños
create table if not exists disenos (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  nombre text not null,
  archivo text default '',
  cliente_id text default '',
  puntadas integer default 0,
  colores integer default 1,
  ancho numeric default 0,
  alto numeric default 0,
  tags jsonb default '[]',
  notas text default '',
  created_at timestamptz default now()
);
alter table disenos enable row level security;
create policy "Users see own disenos" on disenos for all using (auth.uid() = user_id);

-- Plantillas WhatsApp
create table if not exists plantillas (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  nombre text not null,
  mensaje text not null,
  created_at timestamptz default now()
);
alter table plantillas enable row level security;
create policy "Users see own plantillas" on plantillas for all using (auth.uid() = user_id);

-- Config del negocio
create table if not exists config (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  nombre_negocio text default '',
  titular text default '',
  banco text default '',
  numero_cuenta text default '',
  clabe text default '',
  telefono text default '',
  email text default '',
  direccion text default '',
  logo_url text default '',
  updated_at timestamptz default now()
);
alter table config enable row level security;
create policy "Users see own config" on config for all using (auth.uid() = user_id);

-- Recurrentes log
create table if not exists recurrentes_log (
  id serial primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  log_key text not null,
  created_at timestamptz default now(),
  unique(user_id, log_key)
);
alter table recurrentes_log enable row level security;
create policy "Users see own recurrentes_log" on recurrentes_log for all using (auth.uid() = user_id);

-- Folio counter
create table if not exists folio_counter (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  counter integer default 0
);
alter table folio_counter enable row level security;
create policy "Users see own folio_counter" on folio_counter for all using (auth.uid() = user_id);

-- Storage bucket para fotos
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
on conflict do nothing;

create policy "Users upload own photos" on storage.objects for insert
  with check (auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users view own photos" on storage.objects for select
  using (auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users delete own photos" on storage.objects for delete
  using (auth.uid()::text = (storage.foldername(name))[1]);
