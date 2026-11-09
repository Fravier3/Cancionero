import {getSession,clearSession} from './session.js';
export const URL_BASE='https://syyealdlapxmpeccaary.supabase.co';
export const PUBLIC_KEY='sb_publishable_t_BJFV9l8tQvcPhZlTnLlg_5fYZJCwB';
export class RequestError extends Error{constructor(message,status){super(message);this.status=status;}}
export async function call(action,data={},options={}){
 const headers={'Content-Type':'application/json',apikey:PUBLIC_KEY};const session=getSession();if(session)headers['x-editor-session']=session.token;
 let response;
 try{response=await fetch(`${URL_BASE}/functions/v1/${options.ai?'cancionero-recognize':options.audio?'cancionero-audio':'cancionero-api'}`,{method:'POST',headers,cache:'no-store',signal:options.signal,body:JSON.stringify(options.ai?data:action==='login'?{action,...data}:{action,data})});}
 catch(e){if(e.name==='AbortError')throw e;throw new RequestError('No hay conexión con el servidor. Tus cambios siguen sin guardar.',0);}
 let result;try{result=await response.json();}catch{throw new RequestError('Respuesta del servidor no válida.',502);}
 if(!response.ok||result.error){if(response.status===401&&action!=='login')await clearSession();throw new RequestError(result.error||'No se pudo completar la operación.',response.status);}
 return result;
}
export async function publicRows(table){
 if(!['cancionero_songs','cancionero_categories'].includes(table))throw new Error('Tabla no permitida');
 const rows=[];for(let offset=0;;offset+=500){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let response;
 try{response=await fetch(`${URL_BASE}/rest/v1/${table}?select=*&order=id&limit=500&offset=${offset}`,{headers:{apikey:PUBLIC_KEY},cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error('No se pudo sincronizar la biblioteca.');const page=await response.json();rows.push(...page);if(page.length<500)break;}finally{clearTimeout(timer);}}
 return rows;
}
