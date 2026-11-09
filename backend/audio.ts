import {ApiError,body,reply,rpc,tokenOf,URL_BASE} from './common.ts';
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers={apikey:SERVICE,Authorization:`Bearer ${SERVICE}`};
async function remove(path:string){const r=await fetch(`${URL_BASE}/storage/v1/object/cancionero-audio`,{method:'DELETE',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})});if(!r.ok)console.error('Audio cleanup failed',r.status);await r.body?.cancel();}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return reply(req,{ok:true});
 let uploaded='';
 try{
  const token=tokenOf(req);await rpc('cancionero_auth',{p_action:'verify',p_token:token});
  const input=await body(req,360000),d=input.data;
  if(!['audio_save','audio_delete'].includes(input.action)||!d||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(d.id)||!Number.isInteger(d.revision))throw new ApiError('Solicitud inválida.');
  if(input.action==='audio_save'){
   const types:Record<string,string>={'audio/mp4':'mp4','audio/webm':'webm','audio/ogg':'ogg'};
   if(!types[d.type]||typeof d.audio!=='string'||d.audio.length>349528||!Number.isFinite(d.duration)||d.duration<0.4||d.duration>9)throw new ApiError('Graba un fragmento de hasta 8 segundos.');
   let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(d.audio),c=>c.charCodeAt(0));}catch{throw new ApiError('Audio inválido.');}
   if(bytes.length<100||bytes.length>262144)throw new ApiError('El fragmento supera el tamaño permitido. Vuelve a grabarlo.');
   const magic=Array.from(bytes.slice(0,4)).map(b=>b.toString(16).padStart(2,'0')).join('');
   if(d.type==='audio/webm'&&magic!=='1a45dfa3'||d.type==='audio/ogg'&&magic!=='4f676753'||d.type==='audio/mp4'&&new TextDecoder().decode(bytes.slice(4,8))!=='ftyp')throw new ApiError('Formato de audio inválido.');
   uploaded=`${d.id}/${crypto.randomUUID()}.${types[d.type]}`;
   const r=await fetch(`${URL_BASE}/storage/v1/object/cancionero-audio/${uploaded}`,{method:'POST',headers:{...headers,'Content-Type':d.type,'Cache-Control':'max-age=31536000'},body:bytes});
   if(!r.ok){await r.body?.cancel();throw new ApiError('No se pudo subir el audio. Intenta otra vez.',502);}await r.body?.cancel();
  }
  const result=await rpc('cancionero_audio',{p_token:token,p_id:d.id,p_revision:d.revision,p_path:uploaded||null});
  uploaded='';if(result.oldPath)await remove(result.oldPath).catch(()=>console.error('Audio cleanup unavailable'));
  return reply(req,{ok:true,song:result.song});
 }catch(error){if(uploaded)await remove(uploaded).catch(()=>{});return reply(req,{error:error instanceof ApiError?error.message:'No se pudo guardar el fragmento.'},error instanceof ApiError?error.status:500);}
});
