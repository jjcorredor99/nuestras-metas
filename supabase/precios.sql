-- Nuestras Metas · precios del mercado
-- Pegar completo en: Supabase → SQL Editor → New query → Run
-- (después de supabase/schema.sql; se puede correr varias veces sin romper nada)
--
-- Los precios NO son del hogar: son catálogo público. Por eso viven en sus propias
-- tablas y no en `items`, que es donde va todo lo de ustedes dos.

-- ---------- las cinco tiendas ----------
create table if not exists public.tiendas (
  id text primary key,                        -- 'exito' | 'carulla' | 'makro' | 'd1' | 'ara'
  nombre text not null,
  fuente text not null check (fuente in ('api', 'folleto', 'manual')),
  ciudad text not null default 'Bogotá',
  activa boolean not null default true,
  orden int not null default 0,
  -- dominio, canal de venta, la estrategia que funcionó al descubrir, la URL del folleto
  config jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

insert into public.tiendas (id, nombre, fuente, orden) values
  ('exito',   'Éxito',   'api',     1),
  ('carulla', 'Carulla', 'api',     2),
  ('makro',   'Makro',   'api',     3),
  ('d1',      'D1',      'folleto', 4),
  ('ara',     'Ara',     'folleto', 5)
on conflict (id) do nothing;

-- ---------- los precios, con histórico ----------
-- El histórico sale gratis de la llave: correr el robot dos veces el mismo día
-- actualiza la misma fila; correrlo mañana crea la del día siguiente.
create table if not exists public.precios (
  tienda_id text not null references public.tiendas(id) on delete cascade,
  sku text not null,
  dia date not null default ((now() at time zone 'America/Bogota')::date),
  nombre text not null,
  marca text,
  precio numeric(12,2) not null check (precio > 0),
  precio_lista numeric(12,2),                 -- antes del descuento, si la tienda lo dice
  contenido numeric,                          -- 1.1 = la bolsa de 1.100 ml
  unidad text check (unidad in ('l', 'kg', 'un')),
  promocion text,                             -- '2x1', 'solo con tarjeta'
  vigente_hasta date,                         -- las ofertas de folleto caducan
  url text,
  imagen text,
  fuente text not null check (fuente in ('api', 'folleto', 'manual')),
  capturado_en timestamptz not null default now(),
  primary key (tienda_id, sku, dia)
);
create index if not exists precios_sku on public.precios (sku);
create index if not exists precios_dia on public.precios (dia desc);

-- ---------- bitácora ----------
-- Sin esto, una tienda que empieza a devolver vacío se rompe en silencio.
create table if not exists public.precios_corridas (
  id bigserial primary key,
  tienda_id text not null,
  funcion text not null,
  iniciado_en timestamptz not null default now(),
  terminado_en timestamptz,
  ok boolean,
  filas int not null default 0,
  error text
);
create index if not exists precios_corridas_tienda on public.precios_corridas (tienda_id, iniciado_en desc);

-- ---------- el último precio de cada cosa ----------
-- security_invoker: sin esto la vista correría con los permisos del dueño y se
-- saltaría la RLS de quien consulta.
create or replace view public.precios_ultimos
  with (security_invoker = on) as
  select distinct on (tienda_id, sku) *
  from public.precios
  order by tienda_id, sku, dia desc, capturado_en desc;

-- ---------- permisos ----------
alter table public.tiendas enable row level security;
alter table public.precios enable row level security;
alter table public.precios_corridas enable row level security;

-- Son precios públicos: cualquiera con sesión los lee.
drop policy if exists "tiendas: leer con sesión" on public.tiendas;
create policy "tiendas: leer con sesión" on public.tiendas
  for select to authenticated using (true);

drop policy if exists "precios: leer con sesión" on public.precios;
create policy "precios: leer con sesión" on public.precios
  for select to authenticated using (true);

drop policy if exists "corridas: leer con sesión" on public.precios_corridas;
create policy "corridas: leer con sesión" on public.precios_corridas
  for select to authenticated using (true);

-- No hay política de insert ni de update, y no es un olvido: el service_role se
-- salta la RLS, así que escriben las Edge Functions y nadie más. Lo único que
-- puede escribir la app es la función precio_manual de más abajo.

grant select on public.tiendas, public.precios, public.precios_ultimos, public.precios_corridas to authenticated;

-- ---------- anotar un precio a mano ----------
-- El camino de escritura desde la app, con el mismo patrón de entrada_sms:
-- security definer, valida a mano y no deja tocar nada más.
create or replace function public.precio_manual(
  p_tienda text,
  p_nombre text,
  p_precio numeric,
  p_contenido numeric default null,
  p_unidad text default null,
  p_sku text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  s text;
  n text := left(trim(coalesce(p_nombre, '')), 200);
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if char_length(n) < 2 then raise exception 'Falta el nombre'; end if;
  if p_precio is null or p_precio <= 0 then raise exception 'Precio inválido'; end if;
  if not exists (select 1 from public.tiendas where id = p_tienda) then
    raise exception 'Esa tienda no existe';
  end if;
  if p_unidad is not null and p_unidad not in ('l', 'kg', 'un') then
    raise exception 'Unidad inválida';
  end if;

  -- El sku de un precio a mano lleva prefijo (nunca choca con uno real) y es
  -- determinista: anotar dos veces lo mismo actualiza en vez de duplicar.
  s := coalesce(
    nullif(trim(coalesce(p_sku, '')), ''),
    'manual:' || left(encode(sha256(lower(n)::bytea), 'hex'), 16)
  );

  insert into public.precios (tienda_id, sku, nombre, precio, contenido, unidad, fuente)
    values (p_tienda, s, n, p_precio, p_contenido, p_unidad, 'manual')
  on conflict (tienda_id, sku, dia) do update
    set precio = excluded.precio,
        nombre = excluded.nombre,
        contenido = excluded.contenido,
        unidad = excluded.unidad,
        fuente = 'manual',
        capturado_en = now();

  return s;
end $$;

revoke all on function public.precio_manual(text, text, numeric, numeric, text, text) from public, anon;
grant execute on function public.precio_manual(text, text, numeric, numeric, text, text) to authenticated;

-- ---------- que corra solo ----------
-- Con lo de arriba el Mercado ya funciona: la comparación y la lista sirven con
-- los precios que ustedes anoten a mano.
--
-- Para que los precios lleguen solos hacen falta dos cosas más, en este orden:
--   1. Desplegar las funciones (ver el README).
--   2. Pegar supabase/precios-auto.sql, que programa el cron con pg_cron + pg_net.
--      Las llaves van en Vault, no en este repo.
