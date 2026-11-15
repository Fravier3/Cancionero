alter table cancionero_private.config add column if not exists pin_hash text;

CREATE OR REPLACE FUNCTION public.cancionero_auth(p_action text, p_token text DEFAULT ''::text, p_password text DEFAULT ''::text, p_ip text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare h text:=encode(extensions.digest(p_token,'sha256'),'hex'); a cancionero_private.attempts; valid boolean; pin_attempt cancionero_private.attempts; using_pin boolean; expiry timestamptz;
begin
 if p_action='login' then
  if length(p_password)>128 or length(p_token)<>64 or length(p_ip)<>64 then return jsonb_build_object('error','Credenciales inválidas.');end if;
  perform 1 from cancionero_private.config where id for update;
  if (select coalesce(sum(attempts),0) from cancionero_private.attempts where window_start>now()-interval '15 minutes' and ip_hash<>'editor-pin-global')>=100 then return jsonb_build_object('error','Acceso temporalmente limitado. Espera 15 minutos.','status',429);end if;
  insert into cancionero_private.attempts(ip_hash) values(p_ip) on conflict do nothing;
  select * into a from cancionero_private.attempts where ip_hash=p_ip for update;
  if a.window_start < now()-interval '15 minutes' then update cancionero_private.attempts set attempts=0,window_start=now() where ip_hash=p_ip; a.attempts:=0;end if;
  if a.attempts>=8 then return jsonb_build_object('error','Demasiados intentos. Espera 15 minutos.','status',429);end if;
  update cancionero_private.attempts set attempts=attempts+1 where ip_hash=p_ip;
  using_pin := left(p_password,4)='pin:' and substring(p_password from 5) ~ '^[0-9]{4}$';
  if using_pin then
   insert into cancionero_private.attempts(ip_hash) values('editor-pin-global') on conflict do nothing;
   select * into pin_attempt from cancionero_private.attempts where ip_hash='editor-pin-global' for update;
   if pin_attempt.window_start < now()-interval '15 minutes' then
    update cancionero_private.attempts set attempts=0,window_start=now() where ip_hash='editor-pin-global';
    pin_attempt.attempts:=0;
   end if;
   if pin_attempt.attempts>=12 then return jsonb_build_object('error','El acceso con PIN está limitado temporalmente. Intenta con la contraseña.','status',429);end if;
   select pin_hash=extensions.crypt(substring(p_password from 5),pin_hash) into valid from cancionero_private.config where id;
  end if;
  if valid is not true then
   select password_hash=extensions.crypt(p_password,password_hash) into valid from cancionero_private.config where id;
  end if;
  if valid is not true then
   if using_pin then
    update cancionero_private.attempts set attempts=attempts+1 where ip_hash='editor-pin-global';
   end if;
   return jsonb_build_object('error',case when using_pin then 'PIN incorrecto.' else 'Contraseña incorrecta.' end,'status',401);
  end if;
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
end;
$function$;
