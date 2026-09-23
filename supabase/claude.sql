-- Nuestras Metas · conector de Claude
-- Pegar completo en: Supabase → SQL Editor → New query → Run
-- (después de supabase/schema.sql; se puede correr varias veces sin romper nada)

-- ---------- el token que va en el enlace del conector ----------
-- Quien tenga el enlace puede leer y anotar en el hogar: se trata como una contraseña.
create table if not exists public.tokens_claude (
  token text primary key,
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  persona text not null check (persona in ('a', 'b')),
  creado_en timestamptz not null default now()
);
create index if not exists tokens_claude_usuario on public.tokens_claude (user_id);

alter table public.tokens_claude enable row level security;

-- Cada quien ve solo su token. La función del conector lo lee con la llave de servicio.
drop policy if exists "mi token de claude" on public.tokens_claude;
create policy "mi token de claude" on public.tokens_claude
  for select using (user_id = auth.uid());

-- ---------- generar mi token desde Ajustes (reemplaza el anterior) ----------
create or replace function public.crear_token_claude(p_persona text) returns text
language plpgsql security definer set search_path = public as $$
declare
  h uuid;
  t text;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if p_persona not in ('a', 'b') then raise exception 'Persona inválida'; end if;
  select hogar_id into h from public.miembros where user_id = auth.uid() limit 1;
  if h is null then raise exception 'Todavía no tienes hogar'; end if;

  t := encode(sha256((gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text)::bytea), 'hex');
  delete from public.tokens_claude where user_id = auth.uid();
  insert into public.tokens_claude (token, hogar_id, user_id, persona) values (t, h, auth.uid(), p_persona);
  return t;
end $$;

-- ---------- desconectar: el enlace deja de servir ----------
create or replace function public.borrar_token_claude() returns void
language sql security definer set search_path = public as $$
  delete from public.tokens_claude where user_id = auth.uid();
$$;

revoke all on function public.crear_token_claude(text) from public;
revoke all on function public.borrar_token_claude() from public;
grant execute on function public.crear_token_claude(text) to authenticated;
grant execute on function public.borrar_token_claude() to authenticated;
