import {ApiError,body,reply,rpc,tokenOf,digest,hex} from './common.ts';
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return reply(req,{ok:true});
 try{
  const input=await body(req);const action=input.action;
  if(action==='readings'){
   const date=input.data?.date;if(typeof date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date)))throw new ApiError('Fecha inválida.');
   const code=date.slice(5,7)+date.slice(8,10)+date.slice(2,4),url=`https://bible.usccb.org/es/bible/lecturas/${code}.cfm`;
   const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new ApiError('No se pudo consultar el salmo.',502);
   const html=await response.text();const part=html.split(/<h3[^>]*>\s*Salmo Responsorial\s*<\/h3>/i)[1]?.split(/<h3[\s>]/i)[0];
   const content=part?.match(/<div class="content-body">([\s\S]*?)<\/div>/i)?.[1];
   const reference=part?.match(/<div class="address">([\s\S]*?)<\/div>/i)?.[1]||'';
   if(!content||!content.includes('R.'))throw new ApiError('La fuente no incluyó la respuesta del salmo.',502);
   return reply(req,{date,html:content,reference,url});
  }
  if(action==='login'){
   if(typeof input.password!=='string'||input.password.length>128)throw new ApiError('Contraseña inválida.');
   const token=hex(crypto.getRandomValues(new Uint8Array(32)));
   const ip=(req.headers.get('x-forwarded-for')||req.headers.get('cf-connecting-ip')||'unknown').split(',').at(-1)!.trim();
   const result=await rpc('cancionero_auth',{p_action:'login',p_password:input.password,p_token:token,p_ip:await digest((Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'')+'|'+ip)});
   return reply(req,{...result,token});
  }
  const token=tokenOf(req);
  await rpc('cancionero_auth',{p_action:'verify',p_token:token});
  if(['verify','logout','revoke_all'].includes(action))return reply(req,await rpc('cancionero_auth',{p_action:action,p_token:token}));
  if(['category_order','psalm_response_save'].includes(action))return reply(req,await rpc('cancionero_settings',{p_token:token,p_action:action,p_data:input.data}));
  if(action==='mass_delete'){if(!/^20\d{2}-\d{2}-\d{2}$/.test(input.data?.date||'')||!Number.isInteger(input.data?.revision))throw new ApiError('Misa inválida.');return reply(req,await rpc('cancionero_delete_mass',{p_token:token,p_date:input.data.date,p_revision:input.data.revision}));}
  if(action==='status')return reply(req,{ok:true,aiConfigured:Boolean(Deno.env.get('OPENAI_API_KEY')),model:'gpt-5.4-mini-2026-03-17',dailyLimit:20,lifetimeLimit:60});
  if(!['song_save','song_delete','category_save','category_delete','migrate','mass_save'].includes(action))throw new ApiError('Acción no permitida.');
  if(action==='song_save'||action==='migrate'){
   const {validateSong}=await import('./common.ts');const songs=action==='migrate'?input.data?.songs:[input.data];
   if(!Array.isArray(songs)||songs.length>20)throw new ApiError('Importa hasta 20 canciones por lote.');songs.forEach((song:any)=>validateSong(song,true));
  }
  if(action==='mass_save'){
   if(!Array.isArray(input.data?.entries)||input.data.entries.length>100)throw new ApiError('Repertorio inválido.');
   const {validateSong}=await import('./common.ts');
   input.data.entries=input.data.entries.map((entry:any)=>{const song={title:entry.title,lyrics:entry.lyrics,number:entry.number||'',key:entry.key||{note:'',mode:'',accidental:''},chords:entry.chords||[]};validateSong(song,true);if(!['song','description',undefined].includes(entry.kind)||typeof(entry.description||'')!=='string'||(entry.description||'').length>500||typeof(entry.moment||'')!=='string'||(entry.moment||'').length>80)throw new ApiError('Momento de misa inválido.');return {...song,category:String(entry.category||'').slice(0,80),kind:entry.kind||'song',moment:entry.moment||'',description:entry.description||''};});
  }
  return reply(req,await rpc('cancionero_command',{p_token:token,p_action:action,p_data:input.data}));
 }catch(error){return reply(req,{error:error instanceof ApiError?error.message:'No se pudo completar la solicitud.'},error instanceof ApiError?error.status:500);}
});
