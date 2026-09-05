-- Nuestras Metas · esquema de Supabase
-- Pegar completo en: Supabase → SQL Editor → New query → Run

-- ---------- tablas ----------
create table if not exists public.hogares (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Nuestro hogar',
  codigo text not null unique,
  creado_por uuid not null references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now()
);

create table if not exists public.miembros (
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  unido_en timestamptz not null default now(),
  primary key (hogar_id, user_id)
);

-- Cada gasto, factura, deuda, reto, meta, foto y el perfil es una fila.
create table if not exists public.items (
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  id text not null,
  tipo text not null,
  data jsonb not null,
  borrado boolean not null default false,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null,
  primary key (hogar_id, id)
);
create index if not exists items_hogar_fecha on public.items (hogar_id, actualizado_en);

alter table public.hogares enable row level security;
alter table public.miembros enable row level security;
alter table public.items enable row level security;

-- ---------- ¿soy miembro de este hogar? ----------
create or replace function public.es_miembro(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.miembros where hogar_id = h and user_id = auth.uid());
$$;

drop policy if exists "miembros ven su hogar" on public.hogares;
create policy "miembros ven su hogar" on public.hogares
  for select using (public.es_miembro(id));

drop policy if exists "miembros ven miembros" on public.miembros;
create policy "miembros ven miembros" on public.miembros
  for select using (public.es_miembro(hogar_id));

drop policy if exists "items del hogar" on public.items;
create policy "items del hogar" on public.items
  for all using (public.es_miembro(hogar_id)) with check (public.es_miembro(hogar_id));

-- ---------- crear hogar (genera código de 6 letras) ----------
create or replace function public.crear_hogar(p_nombre text) returns public.hogares
language plpgsql security definer set search_path = public as $$
declare
  h public.hogares;
  c text;
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if exists (select 1 from public.miembros where user_id = auth.uid()) then
    raise exception 'Ya perteneces a un hogar';
  end if;
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from public.hogares where codigo = c);
  end loop;
  insert into public.hogares (nombre, codigo, creado_por)
    values (coalesce(nullif(trim(p_nombre), ''), 'Nuestro hogar'), c, auth.uid())
    returning * into h;
  insert into public.miembros (hogar_id, user_id) values (h.id, auth.uid());
  return h;
end $$;

-- ---------- unirse con código (máximo dos personas) ----------
create or replace function public.unirse_hogar(p_codigo text) returns public.hogares
language plpgsql security definer set search_path = public as $$
declare h public.hogares;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  select * into h from public.hogares where codigo = upper(trim(p_codigo));
  if h.id is null then raise exception 'Ese código no existe'; end if;
  if exists (select 1 from public.miembros where user_id = auth.uid() and hogar_id <> h.id) then
    raise exception 'Ya perteneces a otro hogar';
  end if;
  if (select count(*) from public.miembros where hogar_id = h.id) >= 2
     and not exists (select 1 from public.miembros where hogar_id = h.id and user_id = auth.uid()) then
    raise exception 'Este hogar ya tiene dos personas';
  end if;
  insert into public.miembros (hogar_id, user_id) values (h.id, auth.uid()) on conflict do nothing;
  return h;
end $$;

-- ---------- mi hogar ----------
create or replace function public.mi_hogar() returns setof public.hogares
language sql stable security definer set search_path = public as $$
  select h.* from public.hogares h
  join public.miembros m on m.hogar_id = h.id
  where m.user_id = auth.uid()
  order by m.unido_en limit 1;
$$;

-- ---------- tiempo real ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'items'
  ) then
    alter publication supabase_realtime add table public.items;
  end if;
end $$;

-- ---------- fotos del muro (Storage) ----------
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false)
  on conflict (id) do nothing;

drop policy if exists "fotos del hogar leer" on storage.objects;
create policy "fotos del hogar leer" on storage.objects for select
  using (bucket_id = 'fotos' and public.es_miembro(((storage.foldername(name))[1])::uuid));

drop policy if exists "fotos del hogar subir" on storage.objects;
create policy "fotos del hogar subir" on storage.objects for insert
  with check (bucket_id = 'fotos' and public.es_miembro(((storage.foldername(name))[1])::uuid));

drop policy if exists "fotos del hogar reemplazar" on storage.objects;
create policy "fotos del hogar reemplazar" on storage.objects for update
  using (bucket_id = 'fotos' and public.es_miembro(((storage.foldername(name))[1])::uuid));

drop policy if exists "fotos del hogar borrar" on storage.objects;
create policy "fotos del hogar borrar" on storage.objects for delete
  using (bucket_id = 'fotos' and public.es_miembro(((storage.foldername(name))[1])::uuid));
