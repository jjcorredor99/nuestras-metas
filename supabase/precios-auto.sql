-- Nuestras Metas · que el robot de precios corra solo
-- Pegar completo en: Supabase → SQL Editor → New query → Run
-- (después de supabase/precios.sql, y después de desplegar las funciones)
--
-- Antes de correrlo hay que cambiar DOS cosas más abajo: la URL del proyecto y la
-- service role key. No quedan en el repo: van en Vault, que es donde Postgres
-- guarda secretos. Se puede correr varias veces sin romper nada.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- ---------- los dos secretos ----------
-- CAMBIAR ESTOS DOS VALORES. Si ya existen, no se tocan: para reemplazarlos,
-- primero `delete from vault.secrets where name like 'precios_%';`
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'precios_url_proyecto') then
    perform vault.create_secret('https://TU-PROYECTO.supabase.co', 'precios_url_proyecto');
  end if;
  if not exists (select 1 from vault.secrets where name = 'precios_service_key') then
    perform vault.create_secret('PEGAR-AQUI-LA-SERVICE-ROLE-KEY', 'precios_service_key');
  end if;
end $$;

-- Si se pegó el archivo sin cambiarlos, mejor reventar aquí que programar un cron
-- que va a fallar en silencio todos los días contra 'https://TU-PROYECTO...'.
do $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'precios_url_proyecto';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'precios_service_key';
  if v_url like '%TU-PROYECTO%' or v_key like 'PEGAR-AQUI%' then
    raise exception
      'Los secretos quedaron con el texto de ejemplo. Cambia los dos valores de arriba y vuelve a correr el archivo, borrando antes los que quedaron mal: delete from vault.secrets where name like ''precios_%%'';';
  end if;
end $$;

-- ---------- el disparador ----------
create or replace function public.disparar_precios(p_funcion text, p_cuerpo jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_key text;
  v_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'precios_url_proyecto';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'precios_service_key';
  if v_url is null or v_key is null then raise exception 'Faltan los secretos en Vault'; end if;
  select net.http_post(
    url := v_url || '/functions/v1/' || p_funcion,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := p_cuerpo,
    timeout_milliseconds := 150000
  ) into v_id;
  return v_id;
end $$;

-- Sin grants: nadie con la clave publishable puede dispararla.
revoke all on function public.disparar_precios(text, jsonb) from public, anon, authenticated;

-- ---------- el calendario ----------
-- cron corre en UTC y Bogotá es UTC-5 todo el año (no hay horario de verano).
--
--   descubrir  lunes 5:30 a.m.  ← antes de la corrida del lunes, a propósito
--   tiendas    todos los días 6:00 a.m.
--   folletos   lunes 6:30 a.m.
--   limpieza   domingos 3:00 a.m.
--
-- El descubridor va de primero el lunes porque es el que arregla el camino: si
-- una tienda cambió de plataforma el fin de semana, la corrida de las 6:00 ya
-- sale con la estrategia nueva en vez de fallar toda la semana.
do $$ begin
  perform cron.unschedule(jobname) from cron.job
    where jobname in ('precios-descubrir', 'precios-tiendas', 'precios-folletos', 'precios-limpieza');
end $$;

select cron.schedule('precios-descubrir', '30 10 * * 1', $cron$select public.disparar_precios('precios-descubrir')$cron$);
select cron.schedule('precios-tiendas',   '0 11 * * *',  $cron$select public.disparar_precios('precios-tiendas')$cron$);
select cron.schedule('precios-folletos',  '30 11 * * 1', $cron$select public.disparar_precios('precios-folletos')$cron$);
select cron.schedule('precios-limpieza',  '0 8 * * 0',
  $cron$delete from public.precios where dia < current_date - 180$cron$);

-- ---------- para revisar después ----------
-- Qué quedó programado:
--   select jobname, schedule, active from cron.job order by jobname;
--
-- Si algo corrió y falló (las últimas 20 corridas de cron):
--   select j.jobname, r.status, r.return_message, r.start_time
--   from cron.job_run_details r join cron.job j on j.jobid = r.jobid
--   order by r.start_time desc limit 20;
--
-- Qué encontró el robot en cada tienda (esta es la que importa):
--   select tienda_id, funcion, ok, filas, error, iniciado_en
--   from public.precios_corridas order by iniciado_en desc limit 20;
--
-- Y para disparar cualquiera a mano, sin esperar al cron:
--   select public.disparar_precios('precios-descubrir');
