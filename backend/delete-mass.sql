alter table public.cancionero_masses add column deleted_at timestamptz;
create or replace function public.cancionero_command(p_token text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare auth jsonb; s public.cancionero_songs; c public.cancionero_categories; cid uuid; cids uuid[]; cat_name text; old_ids uuid[]; origin text; fp text; out jsonb:='[]'; d jsonb; entry jsonb; old_revision int; result_id uuid; already_existing boolean;
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
  update public.cancionero_songs set category_ids=array_remove(category_ids,c.id),category_id=(array_remove(category_ids,c.id))[1],revision=revision+1,updated_at=now() where c.id=any(category_ids) or category_id=c.id;
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
   already_existing:=false;
   origin:=left(coalesce(d->>'origin',''),240);cid:=null;
   cids:='{}';
   if d ? 'categories' and (jsonb_typeof(d->'categories') is distinct from 'array' or jsonb_array_length(d->'categories')>30) then return jsonb_build_object('error','Categorías inválidas.');end if;
   for cat_name in select value from jsonb_array_elements_text(case when d ? 'categories' then d->'categories' else jsonb_build_array(coalesce(d->>'category','')) end) loop
    if trim(cat_name)='' then continue;end if;
    if length(cat_name)>80 then return jsonb_build_object('error','Nombre de categoría demasiado largo.');end if;
    insert into public.cancionero_categories(name) values(trim(cat_name)) on conflict(name_key) do update set deleted_at=null returning id into cid;
    if not cid=any(cids) then cids:=array_append(cids,cid);end if;
   end loop;
   -- Older installed clients send only one category. Preserve existing secondary categories.
   if not d ? 'categories' and coalesce(d->>'id','')<>'' then
    select array_remove(category_ids,category_id) into old_ids from public.cancionero_songs where id=(d->>'id')::uuid;
    for cid in select unnest(coalesce(old_ids,'{}')) loop if not cid=any(cids) then cids:=array_append(cids,cid);end if;end loop;
   end if;
   cid:=cids[1];
   if p_action='migrate' and origin<>'' then
    select song_id into result_id from cancionero_private.origins where origin_key=origin;
    if result_id is not null then select * into s from public.cancionero_songs where id=result_id;out:=out||jsonb_build_array(jsonb_build_object('origin',origin,'song',to_jsonb(s),'existing',true));continue;end if;
   end if;
   if p_action='song_save' and coalesce(d->>'id','')<>'' then
    select * into s from public.cancionero_songs where id=(d->>'id')::uuid for update;
    if s.revision is distinct from (d->>'revision')::int or s.deleted_at is not null then return jsonb_build_object('error','La canción cambió en otro dispositivo. Actualiza y revisa tus cambios.','status',409);end if;
    update public.cancionero_songs set title=trim(d->>'title'),number=coalesce(d->>'number',''),lyrics=d->>'lyrics',category_id=cid,category_ids=cids,key=d->'key',chords=d->'chords',revision=revision+1,updated_at=now() where id=s.id returning * into s;
   else
    insert into public.cancionero_songs(title,number,lyrics,category_id,category_ids,key,chords) values(trim(d->>'title'),coalesce(d->>'number',''),d->>'lyrics',cid,cids,d->'key',d->'chords') on conflict(fingerprint) do nothing returning * into s;
    if s.id is null then
     already_existing:=true;
     fp:=encode(extensions.digest(lower(trim(d->>'title'))||'|'||regexp_replace(trim(d->>'lyrics'),'\s+',' ','g'),'sha256'),'hex');
     select * into s from public.cancionero_songs where fingerprint=fp;
     if p_action='song_save' then return jsonb_build_object('error','Ya existe esa canción en la biblioteca.','status',409);end if;
    end if;
   end if;
   if p_action='migrate' and origin<>'' then insert into cancionero_private.origins(origin_key,song_id) values(origin,s.id) on conflict do nothing;end if;
   out:=out||jsonb_build_array(jsonb_build_object('origin',origin,'song',to_jsonb(s),'existing',already_existing));
  end loop;
  return jsonb_build_object('ok',true,'results',out);
 elsif p_action='mass_save' then
  if not public.cancionero_valid_entries(p_data->'entries') then return jsonb_build_object('error','Repertorio inválido.');end if;
  if (p_data->>'revision') is null then
   insert into public.cancionero_masses(date,entries) values((p_data->>'date')::date,p_data->'entries');
  else
   update public.cancionero_masses set entries=p_data->'entries',deleted_at=null where date=(p_data->>'date')::date and revision=(p_data->>'revision')::int;
   if not found then return jsonb_build_object('error','La misa cambió. Carga la versión compartida antes de guardar.','status',409);end if;
  end if;
  return jsonb_build_object('ok',true,'mass',(select to_jsonb(m) from public.cancionero_masses m where date=(p_data->>'date')::date));
 end if;
 return jsonb_build_object('error','Acción no permitida.');
exception when unique_violation then return jsonb_build_object('error','Ese registro ya existe. Actualiza la biblioteca.','status',409);
end $$;
revoke all on function public.cancionero_command(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.cancionero_command(text,text,jsonb) to service_role;



create function public.cancionero_delete_mass(p_token text,p_date date,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare auth jsonb; m public.cancionero_masses;
begin
 auth:=public.cancionero_auth('verify',p_token);if auth->>'ok' is distinct from 'true' then return auth;end if;
 update public.cancionero_masses set entries='[]'::jsonb,deleted_at=now() where date=p_date and revision=p_revision and deleted_at is null returning * into m;
 if m.date is null then return jsonb_build_object('error','La misa cambió o ya fue borrada. Actualiza antes de continuar.','status',409);end if;
 return jsonb_build_object('ok',true,'mass',to_jsonb(m));
end $$;
revoke all on function public.cancionero_delete_mass(text,date,integer) from public,anon,authenticated;
grant execute on function public.cancionero_delete_mass(text,date,integer) to service_role;
