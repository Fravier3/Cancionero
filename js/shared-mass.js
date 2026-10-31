// Only a public, low-privilege key is shipped. RLS and column grants enforce access.
export const SUPABASE_URL = 'https://syyealdlapxmpeccaary.supabase.co';
const PUBLIC_KEY = 'sb_publishable_t_BJFV9l8tQvcPhZlTnLlg_5fYZJCwB';
const endpoint = `${SUPABASE_URL}/rest/v1/cancionero_masses`;
export class ConflictError extends Error {}
async function request(url, options={}) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try {
    const res=await fetch(url,{...options,cache:'no-store',signal:controller.signal,headers:{apikey:PUBLIC_KEY,'Content-Type':'application/json',Prefer:'return=representation',...options.headers}});
    if(res.status===409)throw new ConflictError('Otra persona publicó cambios. Carga la versión compartida y vuelve a editar.');
    if(!res.ok)throw new Error('No se pudo conectar con la misa compartida. Revisa tu conexión e intenta de nuevo.');
    return await res.json();
  } finally {clearTimeout(timer);}
}
export async function fetchMass(date){
  const rows=await request(`${endpoint}?date=eq.${encodeURIComponent(date)}&select=date,entries,revision,updated_at,deleted_at`);
  return rows[0]||null;
}
export async function publishMass(date,entries,revision){
 const clean=entries.map(e=>({moment:e.moment||'',kind:e.kind||'song',description:e.description||'',title:e.title,lyrics:e.lyrics,category:e.category||'',key:e.key||{note:'',mode:'',accidental:''},chords:e.chords||[],number:e.number||''}));
 try {const {call}=await import('./api.js');const result=await call('mass_save',{date,entries:clean,revision});return result.mass;}
 catch(error){if(error.status===409)throw new ConflictError(error.message);throw error;}
}

export async function deleteMass(date,revision){try{const {call}=await import('./api.js');return (await call('mass_delete',{date,revision})).mass;}catch(error){if(error.status===409)throw new ConflictError(error.message);throw error;}}
