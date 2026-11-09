import {MOMENTS,slotsFrom,planEntries} from './mass-plan.js';
import {fetchMass,publishMass} from './shared-mass.js';
import {sundayFor,sundayLabel,parseDate} from './dates.js';
import {esc} from './util.js';
import {confirmBox,toast} from './ui.js';
export async function addToMass(song,{canEdit,categoryName}){
 if(!canEdit())return;
 const backdrop=document.createElement('div');backdrop.className='modal-backdrop';
 backdrop.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="Añadir a la misa"><h2>Añadir a la misa</h2><p>${esc(song.title)}</p><label>Fecha de misa<input type="date" value="${sundayFor()}" data-date></label><label>Momento<select data-moment>${MOMENTS.map(m=>`<option>${esc(m)}</option>`).join('')}</select></label><p data-status role="status"></p><div class="modal-actions"><button class="btn ghost" data-cancel>Cancelar</button><button class="btn primary" data-save>Añadir canción</button></div></div>`;
 document.querySelector('#modal-root').append(backdrop);const field=backdrop.querySelector('[data-date]'),moment=backdrop.querySelector('[data-moment]');
 const category=categoryName(song);if(MOMENTS.includes(category))moment.value=category;
 let busy=false;const close=()=>{if(busy)return;document.removeEventListener('keydown',key);backdrop.remove();};const key=e=>{if(e.key==='Escape')close();};document.addEventListener('keydown',key);backdrop.querySelector('[data-cancel]').onclick=close;backdrop.onclick=e=>{if(e.target===backdrop)close();};
 backdrop.querySelector('[data-save]').onclick=async()=>{
  if(busy||!canEdit())return;const date=field.value,target=moment.value;
  if(!parseDate(date)){toast('Escoge una fecha válida.');return;}
  busy=true;backdrop.querySelectorAll('button,input,select').forEach(n=>n.disabled=true);
  try{
   const record=await fetchMass(date),{slots,extras}=slotsFrom(record?.deleted_at?[]:record?.entries||[]),slot=slots.find(s=>s.moment===target);
   if((slot.song||slot.description)&&!await confirmBox({title:'¿Reemplazar este momento?',message:`${sundayLabel(date)} · ${target}: ${slot.song?.title||slot.description}`,okLabel:'Reemplazar'}))return;
   if(!canEdit())throw new Error('Entra como Editor para continuar.');
   Object.assign(slot,{mode:'song',description:'',song:{songId:String(song.id),title:song.title,lyrics:song.lyrics,key:song.key,chords:song.chords||[],number:song.number||'',category:categoryName(song)}});
   await publishMass(date,planEntries(slots,extras),record?.revision??null);busy=false;close();window.dispatchEvent(new Event('cancionero:mass-updated'));toast(`Añadida a ${target} · ${sundayLabel(date)}`,4500);
  }catch(error){backdrop.querySelector('[data-status]').textContent=error.message;}
  finally{busy=false;backdrop.querySelectorAll('button,input,select').forEach(n=>n.disabled=false);}
 };field.focus();
}
