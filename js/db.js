import {norm} from './util.js';
import {call,publicRows} from './api.js';
export const db=new window.Dexie('cancionero');
db.version(1).stores({songs:'++id, titleKey, categoryId, updatedAt',categories:'++id, &key'});
db.version(2).stores({songs:'++id, titleKey, categoryId, updatedAt',categories:'++id, &key',masses:'&date'});
// Add only new stores. Original songs/categories and the Misa cache are untouched.
db.version(3).stores({cloudSongs:'id,categoryId',cloudCategories:'id',migrationMap:'localId,cloudId',meta:'id'});
export const DEFAULT_CATEGORIES=['Entrada','Piedad','Gloria','Aleluya','Ofertorio','Santo','Cordero de Dios','Comunión','Acción de gracias','Salida'];
db.on('populate',tx=>tx.table('categories').bulkAdd(DEFAULT_CATEGORIES.map((name,order)=>({name,key:norm(name),order}))));
export const cleanLyrics=text=>String(text??'').replace(/\r\n?/g,'\n').replace(/^\n+|\n+$/g,'');
export const emptyKey=()=>({note:'',mode:'',accidental:''});
const adapt=s=>({...s,categoryId:s.category_id??s.categoryId??null,titleKey:norm(s.title),updatedAt:s.updated_at?Date.parse(s.updated_at):s.updatedAt,key:s.key||emptyKey(),chords:s.chords||[],number:s.number||'',remote:true});
let syncing=null;
export let syncState={ok:false,message:'Cargando biblioteca guardada…'};
export function syncLibrary(){
 if(syncing)return syncing;
 syncing=(async()=>{try{
  const [songs,categories]=await Promise.all([publicRows('cancionero_songs'),publicRows('cancionero_categories')]);
  await db.transaction('rw',db.cloudSongs,db.cloudCategories,db.meta,async()=>{await db.cloudSongs.clear();await db.cloudSongs.bulkPut(songs.map(adapt));await db.cloudCategories.clear();await db.cloudCategories.bulkPut(categories);await db.meta.put({id:'lastSync',at:Date.now(),count:songs.length});});
  syncState={ok:true,message:`Biblioteca sincronizada · ${songs.length} canciones`};
 }catch{syncState={ok:false,message:'Sin conexión · mostrando la biblioteca guardada. Actualiza para reintentar.'};}
 finally{syncing=null;window.dispatchEvent(new Event('cancionero:sync'));}return syncState;})();return syncing;
}
async function syncAfterWrite(){if(syncing)await syncing;return syncLibrary();}
export async function pendingLocal(){const [songs,map]=await Promise.all([db.songs.toArray(),db.migrationMap.toArray()]);const done=new Set(map.map(m=>m.localId));return songs.filter(s=>!done.has(s.id));}
export async function listSongs(){const [cloud,local]=await Promise.all([db.cloudSongs.toArray(),pendingLocal()]);return [...cloud,...local.map(s=>({...adapt(s),remote:false,legacy:true}))];}
export async function listCategories(){const [cloud,local,synced,pending]=await Promise.all([db.cloudCategories.toArray(),db.categories.toArray(),db.meta.get('lastSync'),pendingLocal()]);const names=new Set(cloud.map(c=>norm(c.name))),used=new Set(pending.map(s=>s.categoryId));return [...cloud,...local.filter(c=>(!synced||used.has(c.id))&&!names.has(norm(c.name))).map(c=>({...c,legacy:true}))].sort((a,b)=>(a.sort_order??a.order??100000)-(b.sort_order??b.order??100000)||a.name.localeCompare(b.name,'es'));}
export async function reorderCategories(categories){await call('category_order',{categories:categories.filter(c=>!c.legacy).map(c=>({id:c.id,revision:c.revision}))});await syncAfterWrite();}
async function categoryName(id){if(id==null)return '';const cats=await listCategories();return cats.find(c=>String(c.id)===String(id))?.name||'';}
async function deviceId(){let row=await db.meta.get('device');if(!row){row={id:'device',value:crypto.randomUUID()};await db.meta.put(row);}return row.value;}
function normalized(s,category){return {title:s.title.trim(),lyrics:cleanLyrics(s.lyrics),number:s.number||'',key:s.key||emptyKey(),chords:s.chords||[],category,origin:s.origin||''};}
export async function migrateLocal(onProgress=()=>{}){
 const originals=await pendingLocal(),device=await deviceId(),categories=await db.categories.toArray();let verified=0;
 // Immutable, text-only checkpoint before first network write.
 if(originals.length&&!await db.meta.get('legacyBackup'))await db.meta.put({id:'legacyBackup',at:Date.now(),songs:await db.songs.toArray(),categories});
 for(let at=0;at<originals.length;at+=10){const batch=originals.slice(at,at+10);const songs=batch.map(s=>({...normalized(s,categories.find(c=>c.id===s.categoryId)?.name||''),origin:`device:${device}:${s.id}`}));
  const result=await call('migrate',{songs});
  for(const [i,item] of result.results.entries()){
   if(item.song?.deleted_at)continue;
   if(!item.song?.id||item.song.lyrics==null)throw new Error('No se pudo verificar una canción. Los originales siguen en este teléfono.');
   await db.transaction('rw',db.migrationMap,db.cloudSongs,async()=>{await db.migrationMap.put({localId:batch[i].id,cloudId:item.song.id,origin:item.origin,verifiedAt:Date.now()});await db.cloudSongs.put(adapt(item.song));});verified++;
  }onProgress(verified,originals.length);
 }await syncAfterWrite();return {verified,total:originals.length,pending:(await pendingLocal()).length};
}
export async function saveSong(s){
 if(s.legacy||typeof s.id==='number')throw new Error('Migra primero las canciones de este teléfono desde Configuración. El original seguirá guardado.');
 const comparison=norm(s.lyrics);const existing=(await publicRows('cancionero_songs')).find(row=>row.id!==s.id&&norm(row.lyrics)===comparison);if(existing)throw new Error(`Esta letra ya existe como «${existing.title}». Abre esa canción para editarla.`);
 const result=await call('song_save',{...normalized(s,s.categorySuggested||await categoryName(s.categoryId)),id:s.id||'',revision:s.revision||null});const saved=result.results[0].song;await db.cloudSongs.put(adapt(saved));await syncAfterWrite();return saved.id;
}
export async function deleteSong(id){const s=await db.cloudSongs.get(id);if(!s)throw new Error('Migra primero la canción local antes de eliminarla de la biblioteca central.');await call('song_delete',{id,revision:s.revision});await db.cloudSongs.delete(id);await syncAfterWrite();}
export async function addCategory(name){const result=await call('category_save',{name});await db.cloudCategories.put(result.category);return result.category;}
export async function renameCategory(id,name){const c=await db.cloudCategories.get(id);if(!c)throw new Error('Sincroniza o migra primero esta categoría.');const result=await call('category_save',{id,name,revision:c.revision});await db.cloudCategories.put(result.category);await syncAfterWrite();}
export async function deleteCategory(id){const c=await db.cloudCategories.get(id);if(!c)throw new Error('Sincroniza o migra primero esta categoría.');await call('category_delete',{id,revision:c.revision});await syncAfterWrite();}
export async function exportAll(){return {app:'cancionero',version:3,exportedAt:new Date().toISOString(),songs:await listSongs(),categories:await listCategories(),masses:await db.masses.toArray(),legacyOriginals:await db.songs.toArray()};}
export async function importAll(data){
 if(data?.app!=='cancionero'||!Array.isArray(data.songs))throw new Error('El archivo no es un respaldo de Cancionero.');
 const cats=Array.isArray(data.categories)?data.categories:[];let added=0,skipped=0;
 const importId=crypto.randomUUID();
 for(let at=0;at<data.songs.length;at+=10){const result=await call('migrate',{songs:data.songs.slice(at,at+10).map((s,i)=>({...normalized(s,cats.find(c=>String(c.id)===String(s.categoryId??s.category_id))?.name||s.category||''),origin:`import:${importId}:${at+i}`}))});for(const r of result.results){if(r.existing)skipped++;else added++;}}
 let massesAdded=0;for(const m of data.masses||[]){if(/^\d{4}-\d{2}-\d{2}$/.test(m.date)&&Array.isArray(m.entries)&&!await db.masses.get(m.date)){await db.masses.put(m);massesAdded++;}}
 await syncAfterWrite();return {added,skipped,massesAdded};
}
