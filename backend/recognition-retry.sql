create or replace function public.cancionero_ai_gate(p_token text,p_id uuid,p_hash text,p_action text default 'claim',p_input int default 0,p_output int default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare auth jsonb; cfg cancionero_private.config; h text:=encode(extensions.digest(p_token,'sha256'),'hex');
begin
 auth:=public.cancionero_auth('verify',p_token);if auth->>'ok' is distinct from 'true' then return auth;end if;
 select * into cfg from cancionero_private.config where id for update;
 if p_action='claim' then
  if exists(select 1 from cancionero_private.ai_jobs where id=p_id or (session_hash=h and request_hash=p_hash and status='processing' and created_at>now()-interval '2 minutes')) then return jsonb_build_object('error','Esa solicitud ya fue procesada o sigue en curso. Revisa el resultado antes de repetirla.','status',409);end if;
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
