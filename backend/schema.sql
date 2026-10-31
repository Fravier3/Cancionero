-- Cancionero v2. Additive schema; existing device tables are never reset.
create schema if not exists cancionero_private;
revoke all on schema cancionero_private from public, anon, authenticated;
create table cancionero_private.config(id boolean primary key default true check(id), password_hash text not null, daily_ai_limit int not null default 20, lifetime_ai_limit int not null default 60);
create table cancionero_private.sessions(token_hash text primary key, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days', revoked_at timestamptz);
create table cancionero_private.attempts(ip_hash text primary key, attempts int not null default 0, window_start timestamptz not null default now());
create table cancionero_private.ai_jobs(id uuid primary key, session_hash text not null, request_hash text not null, created_at timestamptz not null default now(), status text not null default 'processing', input_tokens int, output_tokens int);
create index on cancionero_private.ai_jobs(created_at);
create table public.cancionero_categories(id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 80), name_key text generated always as (lower(trim(name))) stored unique, revision int not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table public.cancionero_songs(id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 1 and 200), number text not null default '' check(length(number)<=30), lyrics text not null check(length(lyrics) between 1 and 50000), category_id uuid references public.cancionero_categories(id), key jsonb not null default '{"note":"","mode":"","accidental":""}', chords jsonb not null default '[]', fingerprint text generated always as (encode(extensions.digest(lower(trim(title))||'|'||regexp_replace(trim(lyrics),'\s+',' ','g'),'sha256'),'hex')) stored unique, revision int not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table cancionero_private.origins(origin_key text primary key, song_id uuid not null references public.cancionero_songs(id), imported_at timestamptz not null default now());
alter table public.cancionero_songs enable row level security;
alter table public.cancionero_categories enable row level security;
create policy cancionero_song_read on public.cancionero_songs for select to anon,authenticated using(deleted_at is null);
create policy cancionero_category_read on public.cancionero_categories for select to anon,authenticated using(deleted_at is null);
revoke all on public.cancionero_songs,public.cancionero_categories from anon,authenticated;
grant select on public.cancionero_songs,public.cancionero_categories to anon,authenticated;
-- Private tables have no API grants and also enforce RLS as defense in depth.
alter table cancionero_private.config enable row level security;
alter table cancionero_private.sessions enable row level security;
alter table cancionero_private.attempts enable row level security;
alter table cancionero_private.ai_jobs enable row level security;
alter table cancionero_private.origins enable row level security;

create function public.cancionero_auth(p_action text,p_token text default '',p_password text default '',p_ip text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare h text:=encode(extensions.digest(p_token,'sha256'),'hex'); a cancionero_private.attempts; valid boolean; expiry timestamptz;
begin
 if p_action='login' then
  if length(p_password)>128 or length(p_token)<>64 or length(p_ip)<>64 then return jsonb_build_object('error','Credenciales inválidas.');end if;
  insert into cancionero_private.attempts(ip_hash) values(p_ip) on conflict do nothing;
  select * into a from cancionero_private.attempts where ip_hash=p_ip for update;
  if a.window_start < now()-interval '15 minutes' then update cancionero_private.attempts set attempts=0,window_start=now() where ip_hash=p_ip; a.attempts:=0;end if;
  if a.attempts>=8 then return jsonb_build_object('error','Demasiados intentos. Espera 15 minutos.','status',429);end if;
  update cancionero_private.attempts set attempts=attempts+1 where ip_hash=p_ip;
  select (password_hash=extensions.crypt(p_password,password_hash)) into valid from cancionero_private.config where id;
  if valid is not true then return jsonb_build_object('error','Contraseña incorrecta.','status',401);end if;
  insert into cancionero_private.sessions(token_hash) values(h) returning expires_at into expiry;
  update cancionero_private.attempts set attempts=0 where ip_hash=p_ip;
  return jsonb_build_object('ok',true,'expiresAt',expiry);
 end if;
 select expires_at into expiry from cancionero_private.sessions where token_hash=h and revoked_at is null and expires_at>now();
 if expiry is null then return jsonb_build_object('error','Tu sesión de Editor venció. Vuelve a entrar.','status',401);end if;
 if p_action='logout' then update cancionero_private.sessions set revoked_at=now() where token_hash=h;
 elsif p_action='revoke_all' then update cancionero_private.sessions set revoked_at=now() where revoked_at is null;
 elsif p_action<>'verify' then return jsonb_build_object('error','Acción inválida.');end if;
 return jsonb_build_object('ok',true,'expiresAt',expiry);
end $$;
revoke all on function public.cancionero_auth(text,text,text,text) from public,anon,authenticated;
grant execute on function public.cancionero_auth(text,text,text,text) to service_role;

create function cancionero_private.validate_song(d jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare c jsonb; lines text[]; ln int; offst int;
begin
 if jsonb_typeof(d->'title') is distinct from 'string' or length(trim(d->>'title')) not between 1 and 200 or jsonb_typeof(d->'lyrics') is distinct from 'string' or length(d->>'lyrics') not between 1 and 50000 then return false;end if;
 if jsonb_typeof(d->'chords') is distinct from 'array' or jsonb_array_length(d->'chords')>2000 then return false;end if;
 if (d->'key'->>'note') not in ('','Do','Re','Mi','Fa','Sol','La','Si') or (d->'key'->>'mode') not in ('','+','-') or (d->'key'->>'accidental') not in ('','#','b') then return false;end if;
 lines:=string_to_array(d->>'lyrics',E'\n');
 for c in select * from jsonb_array_elements(d->'chords') loop
  ln:=(c->>'line')::int;offst:=(c->>'offset')::int;
  if ln is null or offst is null or ln<0 or ln>=array_length(lines,1) or offst<0 or offst>length(lines[ln+1]) or jsonb_typeof(c->'chord') is distinct from 'string' or length(c->>'chord') not between 1 and 24 then return false;end if;
 end loop;
 return true;
exception when others then return false;
end $$;

create function public.cancionero_command(p_token text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare auth jsonb; s public.cancionero_songs; c public.cancionero_categories; cid uuid; origin text; fp text; out jsonb:='[]'; d jsonb; entry jsonb; old_revision int; result_id uuid;
begin
 auth:=public.cancionero_auth('verify',p_token);if auth->>'ok' is distinct from 'true' then return auth;end if;
 if octet_length(p_data::text)>1500000 then return jsonb_build_object('error','Datos demasiado grandes.');end if;
 if p_action='category_save' then
  if length(trim(p_data->>'name')) not between 1 and 80 then return jsonb_build_object('error','Nombre de categoría inválido.');end if;
  if coalesce(p_data->>'id','')='' then
   insert into public.cancionero_categories(name) values(trim(p_data->>'name')) on conflict(name_key) do update set deleted_at=null returning * into c;
  else
   select * into c from public.cancionero_categories where id=(p_data->>'id')::uuid for update;
   if c.revision is distinct from (p_data->>'revision')::int then return jsonb_build_object('error','La categoría cambió. Actualiza antes de editar.','status',409);end if;
   update public.cancionero_categories set name=trim(p_data->>'name'),revision=revision+1,updated_at=now() where id=c.id returning * into c;
  end if;
  return jsonb_build_object('ok',true,'category',to_jsonb(c));
 elsif p_action='category_delete' then
  select * into c from public.cancionero_categories where id=(p_data->>'id')::uuid for update;
  if c.revision is distinct from (p_data->>'revision')::int then return jsonb_build_object('error','La categoría cambió. Actualiza antes de eliminar.','status',409);end if;
  update public.cancionero_songs set category_id=null,revision=revision+1,updated_at=now() where category_id=c.id;
  update public.cancionero_categories set deleted_at=now(),revision=revision+1,updated_at=now() where id=c.id;
  return jsonb_build_object('ok',true);
 elsif p_action='song_delete' then
  update public.cancionero_songs set deleted_at=now(),revision=revision+1,updated_at=now() where id=(p_data->>'id')::uuid and revision=(p_data->>'revision')::int and deleted_at is null returning id into result_id;
  if result_id is null then return jsonb_build_object('error','La canción cambió. Actualiza antes de eliminar.','status',409);end if;
  return jsonb_build_object('ok',true);
 elsif p_action in ('song_save','migrate') then
  if p_action='migrate' and (jsonb_typeof(p_data->'songs') is distinct from 'array' or jsonb_array_length(p_data->'songs')>20) then return jsonb_build_object('error','Importa hasta 20 canciones por lote.');end if;
  for d in select value from jsonb_array_elements(case when p_action='migrate' then p_data->'songs' else jsonb_build_array(p_data) end) loop
   if not cancionero_private.validate_song(d) then return jsonb_build_object('error','Canción o posiciones de acordes inválidas.');end if;
   origin:=left(coalesce(d->>'origin',''),240);cid:=null;
   if coalesce(d->>'category','')<>'' then
    insert into public.cancionero_categories(name) values(left(trim(d->>'category'),80)) on conflict(name_key) do update set deleted_at=null returning id into cid;
   end if;
   if p_action='migrate' and origin<>'' then
    select song_id into result_id from cancionero_private.origins where origin_key=origin;
    if result_id is not null then select * into s from public.cancionero_songs where id=result_id;out:=out||jsonb_build_array(jsonb_build_object('origin',origin,'song',to_jsonb(s),'existing',true));continue;end if;
   end if;
   if p_action='song_save' and coalesce(d->>'id','')<>'' then
    select * into s from public.cancionero_songs where id=(d->>'id')::uuid for update;
    if s.revision is distinct from (d->>'revision')::int or s.deleted_at is not null then return jsonb_build_object('error','La canción cambió en otro dispositivo. Actualiza y revisa tus cambios.','status',409);end if;
    update public.cancionero_songs set title=trim(d->>'title'),number=coalesce(d->>'number',''),lyrics=d->>'lyrics',category_id=cid,key=d->'key',chords=d->'chords',revision=revision+1,updated_at=now() where id=s.id returning * into s;
   else
    insert into public.cancionero_songs(title,number,lyrics,category_id,key,chords) values(trim(d->>'title'),coalesce(d->>'number',''),d->>'lyrics',cid,d->'key',d->'chords') on conflict(fingerprint) do nothing returning * into s;
    if s.id is null then
     fp:=encode(extensions.digest(lower(trim(d->>'title'))||'|'||regexp_replace(trim(d->>'lyrics'),'\s+',' ','g'),'sha256'),'hex');
     select * into s from public.cancionero_songs where fingerprint=fp;
     if p_action='song_save' then return jsonb_build_object('error','Ya existe esa canción en la biblioteca.','status',409);end if;
    end if;
   end if;
   if p_action='migrate' and origin<>'' then insert into cancionero_private.origins(origin_key,song_id) values(origin,s.id) on conflict do nothing;end if;
   out:=out||jsonb_build_array(jsonb_build_object('origin',origin,'song',to_jsonb(s),'existing',false));
  end loop;
  return jsonb_build_object('ok',true,'results',out);
 elsif p_action='mass_save' then
  if not public.cancionero_valid_entries(p_data->'entries') then return jsonb_build_object('error','Repertorio inválido.');end if;
  if (p_data->>'revision') is null then
   insert into public.cancionero_masses(date,entries) values((p_data->>'date')::date,p_data->'entries');
  else
   update public.cancionero_masses set entries=p_data->'entries' where date=(p_data->>'date')::date and revision=(p_data->>'revision')::int;
   if not found then return jsonb_build_object('error','La misa cambió. Carga la versión compartida antes de guardar.','status',409);end if;
  end if;
  return jsonb_build_object('ok',true,'mass',(select to_jsonb(m) from public.cancionero_masses m where date=(p_data->>'date')::date));
 end if;
 return jsonb_build_object('error','Acción no permitida.');
exception when unique_violation then return jsonb_build_object('error','Ese registro ya existe. Actualiza la biblioteca.','status',409);
end $$;
revoke all on function public.cancionero_command(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.cancionero_command(text,text,jsonb) to service_role;

create function public.cancionero_ai_gate(p_token text,p_id uuid,p_hash text,p_action text default 'claim',p_input int default 0,p_output int default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare auth jsonb; cfg cancionero_private.config; h text:=encode(extensions.digest(p_token,'sha256'),'hex');
begin
 auth:=public.cancionero_auth('verify',p_token);if auth->>'ok' is distinct from 'true' then return auth;end if;
 select * into cfg from cancionero_private.config where id for update;
 if p_action='claim' then
  if exists(select 1 from cancionero_private.ai_jobs where id=p_id or (session_hash=h and request_hash=p_hash and created_at>now()-interval '5 minutes')) then return jsonb_build_object('error','Esa solicitud ya fue procesada o sigue en curso. Revisa el resultado antes de repetirla.','status',409);end if;
  if (select count(*) from cancionero_private.ai_jobs where created_at>current_date)>=cfg.daily_ai_limit or (select count(*) from cancionero_private.ai_jobs)>=cfg.lifetime_ai_limit or (select count(*) from cancionero_private.ai_jobs where session_hash=h and created_at>now()-interval '1 minute')>=2 then return jsonb_build_object('error','Se alcanzó el límite de reconocimiento. Espera o revisa el presupuesto con el administrador.','status',429);end if;
  insert into cancionero_private.ai_jobs(id,session_hash,request_hash) values(p_id,h,p_hash);
 elsif p_action in ('complete','failed') then
  update cancionero_private.ai_jobs set status=p_action,input_tokens=greatest(0,p_input),output_tokens=greatest(0,p_output) where id=p_id and session_hash=h;
 end if;
 return jsonb_build_object('ok',true,'dailyLimit',cfg.daily_ai_limit,'lifetimeLimit',cfg.lifetime_ai_limit);
end $$;
revoke all on function public.cancionero_ai_gate(text,uuid,text,text,int,int) from public,anon,authenticated;
grant execute on function public.cancionero_ai_gate(text,uuid,text,text,int,int) to service_role;
insert into public.cancionero_categories(name) values ('Entrada'),('Piedad'),('Gloria'),('Aleluya'),('Ofertorio'),('Santo'),('Cordero de Dios'),('Comunión'),('Acción de gracias'),('Salida') on conflict do nothing;
