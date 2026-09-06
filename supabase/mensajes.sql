-- Nuestras Metas · gastos desde los mensajes del banco
-- Pegar completo en: Supabase → SQL Editor → New query → Run
-- (después de supabase/schema.sql; se puede correr varias veces sin romper nada)

-- ---------- el token que lleva el Atajo del celular ----------
create table if not exists public.tokens_sms (
  token text primary key,
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  persona text not null check (persona in ('a', 'b')),
  creado_en timestamptz not null default now()
);
create index if not exists tokens_sms_hogar on public.tokens_sms (hogar_id);

-- ---------- bandeja de mensajes crudos ----------
create table if not exists public.entrantes (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  persona text not null check (persona in ('a', 'b')),
  texto text not null check (char_length(texto) between 1 and 600),
  recibido_en timestamptz not null default now(),
  procesado boolean not null default false
);
create index if not exists entrantes_pendientes on public.entrantes (hogar_id, procesado, recibido_en);

-- Identificador del mensaje en el celular (el UUID que da Atajos). Es opcional:
-- si viene, deduplica exacto; si no, se cae al texto.
alter table public.entrantes add column if not exists externo_id text;
create unique index if not exists entrantes_externo on public.entrantes (hogar_id, externo_id)
  where externo_id is not null;

alter table public.tokens_sms enable row level security;
alter table public.entrantes enable row level security;

-- Cada quien ve solo su token; los mensajes son del hogar.
drop policy if exists "mi token" on public.tokens_sms;
create policy "mi token" on public.tokens_sms
  for select using (user_id = auth.uid());

drop policy if exists "entrantes del hogar" on public.entrantes;
create policy "entrantes del hogar" on public.entrantes
  for all using (public.es_miembro(hogar_id)) with check (public.es_miembro(hogar_id));

-- ---------- lo único que toca el Atajo: guarda el texto, no lee nada ----------
-- p_id es opcional: manda el identificador del mensaje y la deduplicación es exacta.
create or replace function public.entrada_sms(p_token text, p_texto text, p_id text default null)
  returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tokens_sms;
  msg text := left(trim(coalesce(p_texto, '')), 600);
  ext text := nullif(trim(coalesce(p_id, '')), '');
begin
  if char_length(msg) < 8 then raise exception 'Mensaje vacío'; end if;
  select * into t from public.tokens_sms where token = p_token;
  if t.token is null then raise exception 'Token inválido'; end if;

  -- Sin identificador, el texto hace de llave. La ventana cubre toda la retención,
  -- para que reenviar mensajes viejos desde el Atajo no duplique gastos.
  if ext is null and exists (
    select 1 from public.entrantes e
    where e.hogar_id = t.hogar_id and e.texto = msg and e.recibido_en > now() - interval '30 days'
  ) then
    return;
  end if;

  -- Con identificador, el índice único se encarga: repetirlo no hace nada.
  insert into public.entrantes (hogar_id, persona, texto, externo_id)
    values (t.hogar_id, t.persona, msg, ext)
    on conflict (hogar_id, externo_id) where externo_id is not null do nothing;

  delete from public.entrantes
    where hogar_id = t.hogar_id and procesado and recibido_en < now() - interval '30 days';
end $$;

-- La versión vieja de dos parámetros estorba: PostgREST no sabría cuál llamar.
drop function if exists public.entrada_sms(text, text);
revoke all on function public.entrada_sms(text, text, text) from public;
grant execute on function public.entrada_sms(text, text, text) to anon, authenticated;

-- ---------- generar mi token desde Ajustes ----------
create or replace function public.crear_token_sms(p_persona text) returns text
language plpgsql security definer set search_path = public as $$
declare
  h uuid;
  t text;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if p_persona not in ('a', 'b') then raise exception 'Persona inválida'; end if;
  select hogar_id into h from public.miembros where user_id = auth.uid() limit 1;
  if h is null then raise exception 'Todavía no tienes hogar'; end if;

  t := substr(encode(sha256((gen_random_uuid()::text || clock_timestamp()::text)::bytea), 'hex'), 1, 32);
  delete from public.tokens_sms where user_id = auth.uid();
  insert into public.tokens_sms (token, hogar_id, user_id, persona) values (t, h, auth.uid(), p_persona);
  return t;
end $$;

grant execute on function public.crear_token_sms(text) to authenticated;

-- ---------- tiempo real: que el otro celular vea el mensaje al instante ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'entrantes'
  ) then
    alter publication supabase_realtime add table public.entrantes;
  end if;
end $$;

-- Así lo llama el Atajo del iPhone (POST):
--   https://TU-PROYECTO.supabase.co/rest/v1/rpc/entrada_sms
--   Headers: apikey: <clave publishable>   ·   Content-Type: application/json
--   Cuerpo:  { "p_token": "<tu token>", "p_texto": "<el mensaje>" }
