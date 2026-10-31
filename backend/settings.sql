alter table public.cancionero_categories add column sort_order integer not null default 100000;
with ranked as (select id,row_number() over(order by name_key,id)::int as n from public.cancionero_categories) update public.cancionero_categories c set sort_order=r.n from ranked r where c.id=r.id;
create table public.cancionero_psalm_responses(date date primary key,response text not null check(length(response) between 1 and 500),revision integer not null default 1,updated_at timestamptz not null default now());
alter table public.cancionero_psalm_responses enable row level security;
revoke all on public.cancionero_psalm_responses from anon,authenticated;
grant select on public.cancionero_psalm_responses to anon,authenticated;
create policy cancionero_psalm_public_read on public.cancionero_psalm_responses for select to anon,authenticated using(true);
create function public.cancionero_settings(p_token text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare auth jsonb; item jsonb; n int:=0; total int; current_revision int; response_row public.cancionero_psalm_responses;
begin
 auth:=public.cancionero_auth('verify',p_token);if auth->>'ok' is distinct from 'true' then return auth;end if;
 perform 1 from cancionero_private.config where id for update;
 if p_action='category_order' then
  if jsonb_typeof(p_data->'categories') is distinct from 'array' then return jsonb_build_object('error','Orden inválido.');end if;
  select count(*) into total from public.cancionero_categories where deleted_at is null;
  if jsonb_array_length(p_data->'categories')<>total or (select count(distinct value->>'id') from jsonb_array_elements(p_data->'categories'))<>total then return jsonb_build_object('error','Las categorías cambiaron. Actualiza y vuelve a ordenar.','status',409);end if;
  for item in select value from jsonb_array_elements(p_data->'categories') loop
   select revision into current_revision from public.cancionero_categories where id=(item->>'id')::uuid and deleted_at is null for update;
   if current_revision is distinct from (item->>'revision')::int then return jsonb_build_object('error','Las categorías cambiaron. Actualiza y vuelve a ordenar.','status',409);end if;
  end loop;
  for item in select value from jsonb_array_elements(p_data->'categories') loop
   update public.cancionero_categories set sort_order=n,revision=revision+1,updated_at=now() where id=(item->>'id')::uuid;n:=n+1;
  end loop;
  return jsonb_build_object('ok',true);
 elsif p_action='psalm_response_save' then
  if length(trim(p_data->>'response')) not between 1 and 500 then return jsonb_build_object('error','La respuesta debe tener entre 1 y 500 caracteres.');end if;
  select * into response_row from public.cancionero_psalm_responses where date=(p_data->>'date')::date for update;
  if response_row.revision is distinct from (p_data->>'revision')::int then return jsonb_build_object('error','La respuesta cambió. Actualiza las lecturas y vuelve a editar.','status',409);end if;
  insert into public.cancionero_psalm_responses(date,response) values((p_data->>'date')::date,trim(p_data->>'response')) on conflict(date) do update set response=excluded.response,revision=cancionero_psalm_responses.revision+1,updated_at=now() returning * into response_row;
  return jsonb_build_object('ok',true,'response',to_jsonb(response_row));
 end if;
 return jsonb_build_object('error','Acción inválida.');
exception when invalid_text_representation or datetime_field_overflow then return jsonb_build_object('error','Datos inválidos.');
end $$;
revoke all on function public.cancionero_settings(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.cancionero_settings(text,text,jsonb) to service_role;
