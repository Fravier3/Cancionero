export const URL_BASE=Deno.env.get('SUPABASE_URL')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const MODEL='gpt-5.4-mini-2026-03-17';
export const cors=(req:Request)=>({'Access-Control-Allow-Origin':req.headers.get('origin')==='https://fravier3.github.io'?'https://fravier3.github.io':/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.get('origin')||'')?req.headers.get('origin')!:'https://fravier3.github.io','Access-Control-Allow-Headers':'content-type,apikey,x-editor-session','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'});
export const reply=(req:Request,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors(req)});
export class ApiError extends Error {constructor(message:string,public status=400){super(message);}}
export async function rpc(name:string,data:unknown){
 const response=await fetch(`${URL_BASE}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json'},body:JSON.stringify(data)});
 if(!response.ok){await response.body?.cancel();throw new ApiError('No se pudo completar la operación en el servidor.',502);}
 const result=await response.json();if(result.error)throw new ApiError(result.error,result.status||400);return result;
}
export const tokenOf=(req:Request)=>{const token=req.headers.get('x-editor-session')||'';if(!/^[a-f0-9]{64}$/.test(token))throw new ApiError('Entra como Editor para continuar.',401);return token;};
export const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export async function digest(text:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));}
export async function body(req:Request,max=1600000){
 if(req.method!=='POST')throw new ApiError('Método no permitido.',405);
 if(!req.headers.get('content-type')?.startsWith('application/json'))throw new ApiError('Se requiere JSON.');
 if(Number(req.headers.get('content-length')||0)>max)throw new ApiError('Solicitud demasiado grande.',413);
 const reader=req.body?.getReader();if(!reader)throw new ApiError('Solicitud vacía.');let length=0;const parts:Uint8Array[]=[];
 while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw new ApiError('Solicitud demasiado grande.',413);}parts.push(value);}
 const bytes=new Uint8Array(length);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError('JSON inválido.');}
}
export function validateSong(s:any,clean=false){
 if(!s||typeof s.title!=='string'||!s.title.trim()||s.title.length>200||typeof s.lyrics!=='string'||!s.lyrics.trim()||s.lyrics.length>50000||typeof(s.number||'')!=='string'||(s.number||'').length>30||!Array.isArray(s.chords)||s.chords.length>2000)throw new ApiError('Revisa el título, la letra y los acordes.');
 const lines=s.lyrics.split('\n');
 for(const c of s.chords)if(!Number.isInteger(c.line)||!Number.isInteger(c.offset)||c.line<0||c.line>=lines.length||c.offset<0||c.offset>Array.from(lines[c.line]).length||typeof c.chord!=='string'||!c.chord.trim()||c.chord.length>24)throw new ApiError('Hay posiciones de acordes que necesitan revisión.');
 if(!s.key||!['','Do','Re','Mi','Fa','Sol','La','Si'].includes(s.key.note)||!['','+','-'].includes(s.key.mode)||!['','#','b'].includes(s.key.accidental))throw new ApiError('Tonalidad inválida.');
 if((s.key.note&&!s.key.mode)||(!s.key.note&&s.key.mode))throw new ApiError('Completa la nota y si es mayor o menor.');
 if(clean){s.key={note:s.key.note,mode:s.key.mode,accidental:s.key.accidental};s.chords=s.chords.map((c:any)=>({line:c.line,offset:c.offset,chord:c.chord}));}
}
