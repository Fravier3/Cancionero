import {MOMENTS,slotsFrom,planEntries} from './mass-plan.js';
import {massMoment} from './quick-mass.js';
import {fetchMass,publishMass} from './shared-mass.js';
import {sundayFor,sundayLabel} from './dates.js';
import {esc} from './util.js';
import {toast} from './ui.js';
let adding=false;
function chooseMoment(song){
 return new Promise(resolve=>{
  const backdrop=document.createElement('div');backdrop.className='modal-backdrop';
  backdrop.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="Momento de misa"><h2>¿En qué momento va?</h2><p>${esc(song.title)}</p><p class="note">Escoge una sección de la misa del domingo.</p><label>Momento<select data-moment><option value="">Seleccionar sección…</option>${MOMENTS.map(m=>`<option>${esc(m)}</option>`).join('')}</select></label><div class="modal-actions"><button class="btn ghost" data-cancel>Cancelar</button><button class="btn primary" data-save disabled>Añadir a la misa</button></div></div>`;
  const previous=document.activeElement,field=backdrop.querySelector('[data-moment]'),save=backdrop.querySelector('[data-save]');
  const close=value=>{document.removeEventListener('keydown',key);backdrop.remove();previous?.focus();resolve(value);};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();close('');}};
  document.addEventListener('keydown',key);document.querySelector('#modal-root').append(backdrop);
  field.onchange=()=>{save.disabled=!field.value;};save.onclick=()=>{if(field.value)close(field.value);};backdrop.querySelector('[data-cancel]').onclick=()=>close('');backdrop.onclick=e=>{if(e.target===backdrop)close('');};field.focus();
 });
}
export async function addToMass(song,{canEdit,categoryName,categoryNames}){
 if(!canEdit()||adding)return;adding=true;
 try{
  const categories=categoryNames?.(song)||categoryName(song).split(' · ');
  const target=massMoment(categories)||await chooseMoment(song);if(!target||!canEdit())return;
  const date=sundayFor();toast('Añadiendo a la misa del domingo…');
  const record=await fetchMass(date),{slots,extras}=slotsFrom(record?.deleted_at?[]:record?.entries||[]),slot=slots.find(s=>s.moment===target);
  if(!canEdit())throw new Error('Entra como Editor para continuar.');
  Object.assign(slot,{mode:'song',description:'',song:{songId:String(song.id),title:song.title,lyrics:song.lyrics,key:song.key,chords:song.chords||[],number:song.number||'',category:categoryName(song)}});
  await publishMass(date,planEntries(slots,extras),record?.revision??null);
  window.dispatchEvent(new Event('cancionero:mass-updated'));toast(`Añadida a ${target} · ${sundayLabel(date)}`,4500);
 }catch(error){toast(error.message,5000);}
 finally{adding=false;}
}
