import { db } from './db.js';
import { esc, norm } from './util.js';
import { toast, confirmBox } from './ui.js';
import { fetchMass, publishMass, ConflictError } from './shared-mass.js';
import { sundayFor, shiftSunday, sundayLabel, parseDate } from './dates.js';

export function initMass({ getSongs, categoryName, openSong, canEdit=()=>true }) {
  const root=document.querySelector('#view-mass');
  let selected=sundayFor(), autoDate=selected, entries=[], generation=0, saving=false, search='';
  let editing=false, revision=null, online=false, syncMessage='', localPlan=null, syncing=false;
  let readerEntries=[], readerIndex=0, readerDate='';
  const nav=document.querySelector('#mass-reader-nav');
  const refreshReader=document.createElement('button');refreshReader.className='btn secondary block';refreshReader.textContent='Hay cambios · actualizar repertorio';refreshReader.hidden=true;nav.prepend(refreshReader);
  refreshReader.onclick=()=>{if(entries.length)start(0);else toast('La misa compartida está vacía. Vuelve a la lista.');refreshReader.hidden=true;};
  const previous=document.querySelector('#mass-prev'),next=document.querySelector('#mass-next');
  function render() {
    root.innerHTML=`<div class="mass-heading"><span class="eyebrow">TU CELEBRACIÓN</span><h2>Misa del domingo</h2><p>Un mismo repertorio para todos, en el mismo orden.</p></div>
    <div class="mass-date"><button class="icon-btn" data-mass="week-prev" aria-label="Domingo anterior">‹</button>
    <div><label for="mass-date">${esc(sundayLabel(selected))}</label><input id="mass-date" aria-label="Fecha de la misa" type="date" min="2020-01-05" max="2100-12-26" value="${selected}"></div>
    <button class="icon-btn" data-mass="week-next" aria-label="Domingo siguiente">›</button></div>
    ${selected!==sundayFor()?'<button class="link" data-mass="today">Ir al domingo actual o próximo</button>':''}
    <p class="note">${entries.length} ${entries.length===1?'canción preparada':'canciones preparadas'} · ${editing?'Editando · cambios sin publicar':'Compartida con todos'}</p>
    <p id="mass-sync" class="mass-sync" role="status">${esc(syncMessage)}</p>
    <div class="mass-edit-tools">${editing?'<button class="btn primary" data-mass="save">Guardar cambios para todos</button><button class="btn secondary" data-mass="cancel">Cancelar</button>':`<button class="btn secondary" data-mass="edit" ${canEdit()?'':'hidden'} ${online?'':'disabled'}>Editar misa</button><button class="btn ghost" data-mass="refresh">Actualizar</button>`}</div>
    ${editing&&localPlan?.entries?.length&&!entries.length?'<button class="link" data-mass="restore">Usar mi misa guardada en este dispositivo</button>':''}
    <button class="btn primary block big" data-mass="start" ${entries.length?'':'disabled'}>Comenzar misa</button>
    <ol class="mass-order">${entries.map((e,i)=>`<li><span class="mass-number">${i+1}</span><button class="mass-song" data-mass="read" data-index="${i}"><strong>${esc(e.title)}</strong><small>${esc(e.category||'Sin categoría')}</small></button>${editing?`<div class="mass-controls">
    <button class="icon-btn" data-mass="up" data-index="${i}" ${i===0?'disabled':''} aria-label="Subir ${esc(e.title)}">↑</button>
    <button class="icon-btn" data-mass="down" data-index="${i}" ${i===entries.length-1?'disabled':''} aria-label="Bajar ${esc(e.title)}">↓</button>
    <button class="icon-btn" data-mass="remove" data-index="${i}" aria-label="Quitar ${esc(e.title)}">×</button></div>`:''}</li>`).join('')}</ol>
    ${entries.length?'':'<p class="mass-empty">Todavía no hay canciones para este domingo. El repertorio aparecerá aquí cuando se publique la misa.</p>'}
    <div id="mass-add" ${editing?'':'hidden'}><h3>Añadir canciones de mi biblioteca</h3><input id="mass-search" class="mass-search" type="search" placeholder="Buscar en mis letras…" aria-label="Buscar canciones para la misa" value="${esc(search)}"><div id="mass-choices"></div><p class="note">Al guardar la misa se comparten los títulos, las letras y el orden. Las fotos no se suben.</p></div>`;
    renderChoices();
  }
  function renderChoices(){
    const songs=getSongs().filter(s=>norm(s.title+' '+categoryName(s)).includes(norm(search)));
    root.querySelector('#mass-choices').innerHTML=songs.length?songs.map(s=>`<button class="mass-choice" data-mass="add" data-id="${s.id}"><span><strong>${esc(s.title)}</strong><small>${esc(categoryName(s))}</small></span><span aria-hidden="true">＋</span><span class="sr-only">Añadir a misa</span></button>`).join(''):'<p class="note mass-empty">No hay canciones disponibles. Guarda una canción desde «Añadir» para incluirla aquí.</p>';
  }
  function status(message){syncMessage=message;const node=root.querySelector('#mass-sync');if(node)node.textContent=message;}
  async function show(date=selected){
    const token=++generation;selected=date;online=false;
    root.setAttribute('aria-busy','true');root.inert=true;
    try {
      localPlan=await db.masses.get(date);
      const record=await fetchMass(date);if(token!==generation)return;
      revision=record?.revision??null;entries=record?.entries||[];online=true;
      syncMessage=record?'Sincronizada · todos ven este repertorio.':'Aún no se ha publicado esta misa.';
      if(record)await db.masses.put({...record,updatedAt:Date.now()}).catch(()=>{});
      render();
    } catch {
      if(token!==generation)return;
      const cached=localPlan?.revision?localPlan:null;
      revision=cached?.revision??null;entries=cached?.entries||[];
      syncMessage=cached?'Sin conexión · mostrando la última misa descargada.':'Sin conexión. Pulsa Actualizar para cargar la misa compartida.';
      render();
    } finally {if(token===generation){root.removeAttribute('aria-busy');root.inert=false;}}
  }
  async function switchDate(date){
    if(editing&&!await confirmBox({title:'¿Salir de la edición?',message:'Los cambios de esta misa todavía no están publicados.',okLabel:'Salir sin guardar'})){const input=root.querySelector('#mass-date');if(input)input.value=selected;return;}
    editing=false;return show(date);
  }
  function change(mutator){if(!editing||saving||!canEdit())return;mutator();render();}
  async function save(){
    if(!editing||saving||!canEdit())return;saving=true;root.inert=true;status('Guardando para todos…');
    try {
      const record=await publishMass(selected,entries,revision);
      revision=record.revision;entries=record.entries;editing=false;online=true;
      syncMessage='Cambios guardados para todos.';
      await db.masses.put({...record,updatedAt:Date.now()}).catch(()=>{});render();window.dispatchEvent(new Event('cancionero:mass-updated'));toast('Misa compartida actualizada');
    } catch(err) {
      status(err instanceof ConflictError?err.message:err.name==='AbortError'?'La conexión tardó demasiado. Tus cambios siguen aquí; puedes reintentar.':err.message);
      if(err instanceof ConflictError){
        const button=document.createElement('button');button.className='btn secondary';button.textContent='Cargar versión compartida';
        button.onclick=()=>switchDate(selected);root.querySelector('#mass-sync').append(document.createElement('br'),button);
      }
    } finally {saving=false;root.inert=false;}
  }
  async function sync(){
    if(syncing||editing||saving||root.hidden||document.visibilityState!=='visible')return;
    syncing=true;const date=selected,token=generation;
    try{
      const record=await fetchMass(date);if(date!==selected||token!==generation||editing)return;
      const changed=(record?.revision??null)!==revision;online=true;
      if(changed){
        revision=record?.revision??null;entries=record?.entries||[];
        syncMessage='Repertorio actualizado por otro participante.';render();
        if(record)await db.masses.put({...record,updatedAt:Date.now()}).catch(()=>{});
        if(readerEntries.length&&readerDate===date){
          refreshReader.hidden=false;
        }
      }else{status(record?'Sincronizada · todos ven este repertorio.':'Aún no se ha publicado esta misa.');const edit=root.querySelector('[data-mass="edit"]');if(edit)edit.disabled=false;}
    }catch{online=false;status('Sin conexión · mostrando la última misa descargada.');const edit=root.querySelector('[data-mass="edit"]');if(edit)edit.disabled=true;}
    finally{syncing=false;}
  }
  function displayReader(){
    const entry=readerEntries[readerIndex];if(!entry)return;
    openSong(entry);nav.hidden=false;
    document.querySelector('#rd-edit').hidden=true;document.querySelector('#rd-delete').hidden=true;
    document.querySelector('#mass-reader-position').textContent=`${sundayLabel(readerDate)} · ${readerIndex+1} de ${readerEntries.length}`;
    previous.disabled=readerIndex===0;next.disabled=readerIndex===readerEntries.length-1;
    next.textContent=next.disabled?'Última canción':'Siguiente';
  }
  function start(index){refreshReader.hidden=true;readerEntries=structuredClone(entries);readerDate=selected;readerIndex=index;displayReader();}
  function resetReader(){refreshReader.hidden=true;nav.hidden=true;readerEntries=[];document.querySelector('#rd-edit').hidden=!canEdit();document.querySelector('#rd-delete').hidden=!canEdit();}
  previous.onclick=()=>{if(readerIndex>0){readerIndex--;displayReader();}};
  next.onclick=()=>{if(readerIndex<readerEntries.length-1){readerIndex++;displayReader();}};
  root.addEventListener('input',e=>{if(e.target.id==='mass-search'){search=e.target.value;renderChoices();}});
  root.addEventListener('change',e=>{if(e.target.id==='mass-date'){
    const date=parseDate(e.target.value);if(!date){e.target.value=selected;return;}
    const key=sundayFor(date);if(key!==e.target.value)toast('Se seleccionó el domingo correspondiente.');switchDate(key);
  }});
  root.addEventListener('click',async e=>{
    if(saving)return;
    const btn=e.target.closest('[data-mass]');if(!btn)return;
    const action=btn.dataset.mass,i=Number(btn.dataset.index);
    if(action==='week-prev')return switchDate(shiftSunday(selected,-1));
    if(action==='week-next')return switchDate(shiftSunday(selected,1));
    if(action==='today')return switchDate(sundayFor());
    if(action==='refresh')return show();
    if(action==='edit'&&online&&canEdit()){editing=true;render();return;}
    if(action==='save')return save();
    if(action==='cancel')return switchDate(selected);
    if(action==='restore'&&editing){entries=structuredClone(localPlan.entries);render();return;}
    if(action==='start')return start(0);
    if(action==='read')return start(i);
    if(!editing||!canEdit())return;
    if(action==='add'){
      const song=getSongs().find(s=>s.id===Number(btn.dataset.id));if(!song)return;
      await change(()=>entries.push({title:song.title,lyrics:song.lyrics,category:categoryName(song),songId:song.id,key:song.key,chords:song.chords,number:song.number}));
      toast('Canción añadida. Guarda los cambios para compartirla.');return;
    }
    if(!entries[i])return;
    if(action==='remove'){
      if(!await confirmBox({title:'¿Quitar de esta misa?',message:entries[i].title+' seguirá en tu biblioteca.',okLabel:'Quitar'}))return;
      return change(()=>entries.splice(i,1));
    }
    const j=action==='up'?i-1:action==='down'?i+1:-1;
    if(j>=0&&j<entries.length)return change(()=>{[entries[i],entries[j]]=[entries[j],entries[i]];});
  });
  // Roll over only the automatic week; never redirect someone browsing an older plan.
  function rollover(){const today=sundayFor();if(today!==autoDate){const wasAuto=selected===autoDate;autoDate=today;if(wasAuto&&!editing)show(today);}}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){rollover();sync();}});
  setInterval(rollover,60000);
  setInterval(sync,10000);
  window.addEventListener('online',sync);
  window.addEventListener('beforeunload',e=>{if(editing){e.preventDefault();e.returnValue='';}});
  return {show:()=>{rollover();return editing?Promise.resolve():show();},resetReader,isEditing:()=>editing,setCanEdit:value=>{if(!value){editing=false;}if(root.children.length)render();}};
}
