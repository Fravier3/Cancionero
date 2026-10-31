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
  const rows=await request(`${endpoint}?date=eq.${encodeURIComponent(date)}&select=date,entries,revision,updated_at`);
  return rows[0]||null;
}
export async function publishMass(date,entries,revision){
  const clean=entries.map(e=>({title:e.title,lyrics:e.lyrics,category:e.category||''}));
  if(clean.length>100)throw new Error('Puedes incluir hasta 100 canciones por misa.');
  const rows=await request(revision===null?endpoint:`${endpoint}?date=eq.${encodeURIComponent(date)}&revision=eq.${revision}`,{
    method:revision===null?'POST':'PATCH',body:JSON.stringify(revision===null?{date,entries:clean}:{entries:clean})
  });
  if(!rows.length)throw new ConflictError('La misa cambió mientras editabas. Carga la versión compartida y vuelve a editar.');
  return rows[0];
}
