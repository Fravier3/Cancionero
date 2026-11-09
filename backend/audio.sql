alter table public.cancionero_songs add column audio_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('cancionero-audio','cancionero-audio',true,262144,array['audio/mp4','audio/webm','audio/ogg']);
-- Only the existing server-validated editor API can write. Public bucket permits playback.
create function public.cancionero_audio(p_token text,p_id uuid,p_revision integer,p_path text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare auth jsonb; s public.cancionero_songs; old_path text;
begin
 auth:=public.cancionero_auth('verify',p_token);
 if auth->>'ok' is distinct from 'true' then return auth; end if;
 if p_path is not null and p_path !~ ('^'||p_id::text||'/[0-9a-f-]+\.(mp4|webm|ogg)$') then return jsonb_build_object('error','Audio inválido.'); end if;
 select * into s from public.cancionero_songs where id=p_id and deleted_at is null for update;
 if s.id is null or s.revision is distinct from p_revision then return jsonb_build_object('error','La canción cambió. Actualiza antes de guardar el fragmento.','status',409); end if;
 old_path:=s.audio_path;
 update public.cancionero_songs set audio_path=p_path,revision=revision+1,updated_at=now() where id=p_id returning * into s;
 return jsonb_build_object('ok',true,'song',to_jsonb(s),'oldPath',old_path);
end $$;
revoke all on function public.cancionero_audio(text,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.cancionero_audio(text,uuid,integer,text) to service_role;
