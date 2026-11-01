// Mi Cancionero — lógica principal de la interfaz.
import {initZoomGuard} from './zoom.js';
initZoomGuard();
import {searchSongs,matchingSnippet} from './search.js';
import {categoryIds,categoryLabels} from './categories.js';
import { $, $$, esc, norm, debounce, readStorage, writeStorage } from './util.js';
import { icon, hydrateIcons } from './icons.js';
import * as store from './db.js';
import { confirmBox, askText, modal, toast } from './ui.js';
import { cancelOcr } from './ocr.js';
import { initPWA } from './pwa.js';
import { cropImage } from './crop.js';
import { initMass } from './mass.js';
import { initAccess } from './access.js';
import { initGospel } from './gospel.js';
import { fetchMass } from './shared-mass.js';
import { sundayFor } from './dates.js';
import {renderMusic,rebaseChords,keyLabel,blankKey,initMusicEditor} from './music.js';
import {initRecognition,recognizePhoto,clearPhoto,getPhoto,applyEnginePreference} from './recognition.js';
import {call} from './api.js';
import {clearSession} from './session.js';

/* ============================================================
   Estado
   ============================================================ */
const DRAFT_KEY = 'cancionero.draft.v2';
// Older drafts mixed OCR results with persistent text; never restore those captures.
// Keep old draft keys untouched during the upgrade; originals remain recoverable.
const FONT_KEY = 'cancionero.fontsize';
const FONT_STEPS = [18, 20, 22, 24, 26, 28, 32, 36, 40, 46, 52, 58, 64];
const NEW_CATEGORY = '__new__';

const state = {
  localSongs: [], sharedSongs: [],
  songs: [], // letras con campos auxiliares de búsqueda (_t, _l)
  cats: [],
  catById: new Map(),
  q: '',
  cat: 'all', // 'all' | 'none' | id numérico
  addMode: 'editor',
  view: 'library', // 'library' | 'editor' | 'scan'
  editing: false, // true cuando se edita una letra ya guardada
  readerId: null,
  flashId: null,
  returnToReader: null,
};

const emptyDraft = () => ({ title: '', lyrics: '', categoryId: null,categoryIds:[],number:'',key:blankKey(),chords:[] });
const idValue=value=>/^\d+$/.test(String(value))?Number(value):value;

function loadDraft() {
  try {
    const parsed = JSON.parse(readStorage(DRAFT_KEY, 'null'));
    if (parsed && typeof parsed === 'object') {
      return {
        title: String(parsed.title ?? ''),
        lyrics: String(parsed.lyrics ?? ''),
        categoryId: parsed.categoryId ?? null,categoryIds:categoryIds(parsed),number:String(parsed.number||''),key:parsed.key||blankKey(),chords:Array.isArray(parsed.chords)?parsed.chords:[],
      };
    }
  } catch {
    /* borrador dañado: se empieza de cero */
  }
  return emptyDraft();
}

let captureQueue=[],captureTotal=0,captureIndex=0;
const drafts = { fresh: loadDraft(), edit: null };
const currentDraft = () => (state.editing ? drafts.edit : drafts.fresh);
const hasContent = (d) => Boolean(d.title.trim() || d.lyrics.trim());

const persistDraft = debounce(() => {
  writeStorage(DRAFT_KEY, !drafts.fresh.transient && hasContent(drafts.fresh) ? JSON.stringify(drafts.fresh) : null);
}, 350);

/* ============================================================
   Referencias al DOM
   ============================================================ */
const el = {
  subtitle: $('#subtitle'),
  views: { library: $('#view-library'), add: $('#view-add'), mass: $('#view-mass'), gospel: $('#view-gospel') },
  tabs: $$('.tab'),
  q: $('#q'),
  qClear: $('#q-clear'),
  chips: $('#chips'),
  info: $('#results-info'),
  list: $('#list'),
  form: $('#editor'),
  editorTitle: $('#editor-title'),
  editorCancel: $('#editor-cancel'),
  title: $('#f-title'),
  cat: $('#f-cat'),
  lyrics: $('#f-lyrics'),
  save: $('#btn-save'),
  clear: $('#btn-clear'),
  fileCamera: $('#file-camera'),
  fileGallery: $('#file-gallery'),
  fileImport: $('#file-import'),
  reader: $('#reader'),
  rdScroll: $('#rd-scroll'),
  rdTitle: $('#rd-title'),
  rdCat: $('#rd-cat'),
  rdLyrics: $('#rd-lyrics'),
  rdSmaller: $('#rd-smaller'),
  rdBigger: $('#rd-bigger'),
  sheet: $('#sheet'),
  sheetBody: $('#sheet-body'),
  busy: $('#busy'),
  busyImg: $('#busy-img'),
  busyTitle: $('#busy-title'),
  busyBar: $('#busy-bar'),
  busySub: $('#busy-sub'),
};

/* ============================================================
   Datos
   ============================================================ */
async function refresh() {
  const [songs, cats] = await Promise.all([store.listSongs(), store.listCategories()]);
  state.cats = cats;
  state.catById = new Map(cats.map((c) => [c.id, c]));
  state.localSongs = songs;
  mergeSongs();
  if (!['all','none'].includes(state.cat) && !state.catById.has(state.cat)) state.cat = 'all';
  $('#sync-status').textContent=store.syncState.message;
  const pending=await store.pendingLocal();
  const banner=$('#migration-banner');banner.hidden=!pending.length||!access.isEditor();
  banner.innerHTML=`<strong>${pending.length} canciones originales en este teléfono</strong><p>Están a salvo. Migra una copia a la biblioteca compartida para verlas en los demás dispositivos.</p><button type="button" id="migration-start" class="btn primary">Migrar canciones de este teléfono</button>`;
}

function mergeSongs(){
  const unique=new Set(state.localSongs.map(s=>norm(s.title)+'|'+norm(s.lyrics)));
  const seen=new Set();state.songs=[...state.localSongs,...state.sharedSongs.filter(s=>!unique.has(norm(s.title)+'|'+norm(s.lyrics)))].filter(s=>{const key=norm(s.title)+'|'+norm(s.lyrics);if(seen.has(key))return false;seen.add(key);return true;}).map(s=>({...s,_t:norm(s.title),_l:norm(s.lyrics)}));
  state.songs.sort((a,b)=>a._t.localeCompare(b._t,'es'));
}
let sharedLoading=false;
async function syncSharedSongs(){
  if(sharedLoading)return;sharedLoading=true;
  const date=sundayFor();
  try{
    let record;
    try{record=await fetchMass(date);if(record)await store.db.masses.put({...record,updatedAt:Date.now()}).catch(()=>{});}
    catch{const saved=await store.db.masses.get(date);record=saved?.revision?saved:null;}
    if(date!==sundayFor())return;
    state.sharedSongs=(record?.entries||[]).filter(s=>s.kind!=='description').map((s,i)=>({...s,id:`shared:${date}:${i}`,shared:true}));
    mergeSongs();renderLibrary();
  }catch{/* existing local songs remain readable */}
  finally{sharedLoading=false;}
}
const songCategories=s=>categoryIds(s).length?categoryIds(s):state.cats.filter(c=>(s.category||'').split(' · ').some(name=>norm(name)===norm(c.name))).map(c=>c.id);
const catName = song => categoryLabels({...song,categoryIds:songCategories(song)},state.cats).join(' · ')||song.category||'';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ============================================================
   Biblioteca: búsqueda, filtros y lista
   ============================================================ */
const snippetFor=(song,query)=>matchingSnippet(song.lyrics,query);

function visibleSongs() {
  const filtered = state.songs.filter((s) => {
    if (state.cat === 'all') return true;
    if (state.cat === 'none') return !songCategories(s).some(id=>state.catById.has(id));
    return songCategories(s).includes(state.cat);
  });
  return searchSongs(filtered, state.q);
}

function renderSubtitle() {
  const n = state.songs.length;
  el.subtitle.textContent = n ? plural(n, 'canción', 'canciones') : 'Tu biblioteca está vacía';
}

function chipHtml(value, label, count) {
  const pressed = String(state.cat) === String(value);
  return `<button type="button" class="chip" data-cat="${esc(value)}" aria-pressed="${pressed}">${esc(label)} <small>${count}</small></button>`;
}

function renderChips() {
  const counts = new Map();
  let none = 0;
  for (const s of state.songs) {
    const ids=songCategories(s).filter(id=>state.catById.has(id));for(const id of ids)counts.set(id,(counts.get(id)||0)+1);if(!ids.length)none+=1;
  }
  const parts = [chipHtml('all', 'Todas', state.songs.length)];
  for (const c of state.cats) {
    const n = counts.get(c.id) ?? 0;
    if (n > 0 || state.cat === c.id) parts.push(chipHtml(c.id, c.name, n));
  }
  if (none > 0 || state.cat === 'none') parts.push(chipHtml('none', 'Sin categoría', none));
  el.chips.innerHTML = parts.join('');
  el.chips.hidden = state.songs.length === 0;
  el.chips.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function songRowHtml({ s, score }, searching) {
  const snippet = searching ? snippetFor(s, state.q) : '';
  const flash = state.flashId === s.id ? ' flash' : '';
  const cat = catName(s);
  return `<button type="button" class="song${flash}" data-id="${s.id}">
    <span class="song-main">
      <span class="song-title">${esc(s.title)}</span>
      ${snippet ? `<span class="song-snippet">“${esc(snippet)}”</span>` : ''}
    </span>
    ${cat ? `<span class="badge">${esc(cat)}</span>` : ''}
    <span class="song-chevron">${icon('chevron-right', 18)}</span>
  </button>`;
}

function emptyHtml() {
  return `<div class="empty">
      <span class="empty-mark">${icon('music', 34)}</span>
      <h3>Aún no hay canciones</h3>
      <p>${access.isEditor()?'Escribe una canción o toma una foto para añadirla.':'Las canciones de la misa compartida aparecerán aquí cuando se publique el repertorio.'}</p>
      <div class="empty-actions" ${access.isEditor()?'':'hidden'}>
        <button type="button" class="btn primary" data-go="editor">${icon('clipboard-paste', 20)} Escribir una canción</button>
        <button type="button" class="btn secondary" data-go="scan">${icon('camera', 20)} Tomar foto</button>
      </div>
    </div>`;
}

function renderList() {
  const searching = state.q.trim() !== '';
  el.qClear.hidden = state.q === '';
  if (state.songs.length === 0) {
    el.info.textContent = '';
    el.list.innerHTML = emptyHtml();
    hydrateIcons(el.list);
    return;
  }
  const rows = visibleSongs();
  if (searching) el.info.textContent = `${plural(rows.length, 'resultado', 'resultados')} para «${state.q.trim()}»`;
  else if (state.cat !== 'all') {
    const label = state.cat === 'none' ? 'Sin categoría' : state.catById.get(state.cat)?.name;
    el.info.textContent = `${plural(rows.length, 'canción', 'canciones')} · ${label}`;
  } else el.info.textContent = '';

  if (rows.length === 0) {
    el.list.innerHTML = `<div class="empty">
        <span class="empty-mark">${icon('search', 32)}</span>
        <h3>Sin resultados</h3>
        <p>Prueba con otra palabra, un fragmento distinto o cambia la categoría.</p>
      </div>`;
    return;
  }

  let html = '';
  let lastLetter = '';
  for (const row of rows) {
    if (!searching) {
      const first = row.s._t.charAt(0);
      const letter = /[a-z]/.test(first) ? first.toUpperCase() : '#';
      if (letter !== lastLetter) {
        html += `<div class="letter" aria-hidden="true">${letter}</div>`;
        lastLetter = letter;
      }
    }
    html += songRowHtml(row, searching);
  }
  el.list.innerHTML = html;
  if (state.flashId) {
    el.list.querySelector('.song.flash')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    state.flashId = null;
  }
}

function renderLibrary() {
  renderSubtitle();
  renderChips();
  renderList();
}

/* ============================================================
   Navegación entre secciones
   ============================================================ */
const isEditDirty = () => {const d=drafts.edit;return Boolean(d)&&JSON.stringify({title:d.title,lyrics:d.lyrics,categoryId:d.categoryId,categoryIds:categoryIds(d),number:d.number,key:d.key,chords:d.chords})!==JSON.stringify(d.orig);};

function applyView() {
  for (const [name, node] of Object.entries(el.views)) node.hidden = name !== state.view;
  $('#view-editor').hidden = state.view !== 'add' || state.addMode !== 'editor';
  $('#view-scan').hidden = state.view !== 'add' || state.addMode !== 'scan';
  $$('[name="add-method"]').forEach(input => input.checked = input.value === state.addMode);
  const active = state.view;
  el.tabs.forEach((tab) => {
    if (tab.dataset.tab === active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

async function navigate(view) {
  const method = ['editor','scan'].includes(view) ? view : null;
  if(captureTotal&&(view!=='add'&&view!=='editor'||method==='scan')){if(!await confirmBox({title:'¿Salir de la revisión?',message:'Las canciones que ya guardaste se conservan. Las pendientes de esta foto se descartarán.',okLabel:'Salir'}))return false;captureQueue=[];captureTotal=0;captureIndex=0;drafts.fresh=emptyDraft();persistDraft.flush();}

  if(method) view = 'add';
  if(view === 'add' && !access.isEditor()) return false;
  if (state.editing) {
    if (isEditDirty()) {
      const ok = await confirmBox({
        title: '¿Descartar los cambios?',
        message: 'Modificaste esta letra y todavía no la guardaste.',
        okLabel: 'Descartar',
        danger: true,
      });
      if (!ok) return false;
    }
    state.editing = false;
    drafts.edit = null;
    state.returnToReader = null;
  }
  if(method) state.addMode = method;
  if(view!=='add')clearPhoto();
  state.view = view;
  updateDraftDot();
  if (view === 'add' && state.addMode === 'editor') renderEditor();
  if (view === 'library') {renderLibrary();store.syncLibrary();syncSharedSongs();}
  applyView();
  if (view === 'mass') {await store.syncLibrary();await refresh();await mass.show();}
  if (view === 'gospel') await gospel.show();
  return true;
}

/* ============================================================
   Editor (pegar letra / editar)
   ============================================================ */
function renderCatSelect() {
  const d = currentDraft() ?? drafts.fresh;
  const options = [
    '<option value="">Añadir otra categoría…</option>',
    ...state.cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`),
    `<option value="${NEW_CATEGORY}">＋ Añadir categoría nueva…</option>`,
  ];
  el.cat.innerHTML = options.join('');
  el.cat.value='';const ids=categoryIds(d);updateCategorySummary();$('#category-checks').innerHTML=state.cats.map(c=>`<label><input type="checkbox" value="${c.id}" ${ids.includes(c.id)?'checked':''}><span>${esc(c.name)}</span></label>`).join('')+(d.categorySuggested?`<label><input type="checkbox" value="__suggested__" checked><span>${esc(d.categorySuggested)} (sugerida)</span></label>`:'');
}
function updateCategorySummary(){const d=currentDraft()??drafts.fresh;const names=categoryLabels(d,state.cats);if(d.categorySuggested)names.push(d.categorySuggested);$('#category-summary').textContent=names.join(' · ')||'Sin categoría';}

function updateFirstLineButton() {
  const d = currentDraft();

}

function updateDraftDot() {
  $('[data-tab="add"]').classList.toggle('has-draft', hasContent(drafts.fresh));
}

function renderEditor() {
  $('#capture-progress').hidden=!captureTotal;$('#capture-progress').textContent=captureTotal?`He detectado ${captureTotal} canciones. Vamos a validarlas una a una. Canción ${captureIndex} de ${captureTotal}.`:'';
  $('#capture-skip').hidden=!captureTotal;el.save.textContent=captureTotal?(captureQueue.length?'Guardar y continuar':'Guardar y terminar'):'Guardar canción';

  const d = currentDraft();
  el.editorTitle.textContent = state.editing ? 'Editar canción' : 'Nueva canción';
  el.editorCancel.hidden = !state.editing;
  el.clear.hidden = state.editing;
  if(!captureTotal)el.save.textContent=state.editing?'Guardar cambios':'Guardar canción';
  $('#ocr-review').hidden = !d.transient;
  $('#ocr-review').textContent = d.ocrNotice || 'Captura temporal: revisa la letra y guárdala. Al recargar se descarta.';
  el.title.value = d.title;
  el.lyrics.value = d.lyrics;
  music.render();
  renderCatSelect();
  updateFirstLineButton();
  updateDraftDot();
}

function onDraftChanged() {
  music.renderPreview();
  if (!state.editing) persistDraft();
  updateFirstLineButton();
  updateDraftDot();
}

async function onCategoryChange() {
  const d = currentDraft();
  if (el.cat.value !== NEW_CATEGORY) {
    if(!el.cat.value||el.cat.value==='__suggested__')return;d.categoryIds=[...new Set([...categoryIds(d),idValue(el.cat.value)])];d.categoryId=d.categoryIds[0]??null;d.categorySuggested='';renderCatSelect();
    onDraftChanged();
    return;
  }
  const name = await askText({
    title: 'Nueva categoría',
    message: 'Por ejemplo: Cuaresma, Navidad, Mariana…',
    placeholder: 'Nombre de la categoría',
    okLabel: 'Añadir',
  });
  if (!name) {
    renderCatSelect();
    return;
  }
  try {
    const created = await store.addCategory(name);
    await refresh();
    d.categoryIds=[...new Set([...categoryIds(d),created.id])];d.categoryId=d.categoryIds[0];
    renderCatSelect();
    renderChips();
    onDraftChanged();
    toast(`Categoría «${created.name}» lista`);
  } catch (err) {
    toast(err.message);
    renderCatSelect();
  }
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      toast('El portapapeles está vacío');
      return;
    }
    const d = currentDraft();
    const start = el.lyrics.selectionStart ?? d.lyrics.length;
    const end = el.lyrics.selectionEnd ?? start;
    const hasText = d.lyrics.trim() !== '';
    const oldLyrics=d.lyrics;
    d.lyrics = hasText ? `${d.lyrics.slice(0, start)}${text}${d.lyrics.slice(end)}` : text;
    d.chords=rebaseChords(oldLyrics,d.lyrics,d.chords||[]);
    el.lyrics.value = d.lyrics;
    music.render();
    onDraftChanged();
    toast('Letra pegada. Ponle título y guarda.');
  } catch {
    toast('No pude leer el portapapeles. Mantén pulsado en el cuadro y elige Pegar.', 3600);
    el.lyrics.focus();
  }
}

async function duplicateSongPopup(title,sameLyrics=true){
 const buttons=[{label:'Volver a revisar',value:'review',kind:'ghost'}];
 if(captureTotal&&!state.editing)buttons.push({label:'Omitir canción y seguir',value:'skip',kind:'primary'});
 if(!sameLyrics)buttons.push({label:'Guardar igual',value:'save',kind:'secondary'});
 const result=await modal({title:sameLyrics?'Esta canción ya está en la lista':'Ya existe una canción con ese título',message:`«${title}» ya está en tu biblioteca.`+(sameLyrics?' No se guardará otra copia de la misma letra.':' Puedes revisar la letra antes de continuar.'),buttons});
 if(result.value==='skip')await nextCapture();return result.value;
}

async function saveCurrent() {
  const d = currentDraft();
  if(!access.isEditor()){toast('Entra como Editor para guardar.');return;}
  if((d.chords||[]).some(c=>c.needsReview)){toast('Revisa y confirma las posiciones marcadas en el editor de acordes.');return;}
  const title = d.title.trim();
  const lyrics = d.lyrics;
  if (!lyrics.trim()) {
    toast('Escribe o pega la letra primero');
    el.lyrics.focus();
    return;
  }
  if (!title) {
    toast('Ponle un título a la letra');
    el.title.focus();
    return;
  }
  const duplicate = state.songs.find((s) => s._t === norm(title) && s.id !== d.id);
  if (duplicate) {
    if(await duplicateSongPopup(duplicate.title,norm(duplicate.lyrics)===norm(lyrics))!=='save')return;
  }
  el.save.disabled = true;
  try {
    const id = await store.saveSong({ ...d,title,lyrics });
    navigator.storage?.persist?.().catch?.(() => {});
    await refresh();
    if (state.editing) {
      const back = state.returnToReader;
      state.editing = false;
      drafts.edit = null;
      state.returnToReader = null;
      await navigate('library');
      toast('Cambios guardados');
      if (back) openReader(id);
    } else {
      if(captureTotal){await nextCapture();return;}
      drafts.fresh = emptyDraft();
      persistDraft.flush();
      state.q = '';
      el.q.value = '';
      state.cat = 'all';
      state.flashId = id;
      await navigate('library');
      toast('Letra guardada en tu lista');
    }
  } catch (error) {
    if(error.code==='DUPLICATE_SONG')await duplicateSongPopup(error.songTitle);else toast(error.message||'No se pudo guardar. Tus cambios siguen aquí.',5000);
  } finally {
    el.save.disabled = false;
  }
}

async function clearDraft() {
  if (!hasContent(drafts.fresh)) return;
  const ok = await confirmBox({
    title: '¿Limpiar todo?',
    message: 'Se borrará el título y la letra que no has guardado.',
    okLabel: 'Limpiar',
    danger: true,
  });
  if (!ok) return;
  captureQueue=[];captureTotal=0;captureIndex=0;
  drafts.fresh = emptyDraft();
  persistDraft.flush();
  renderEditor();
}

async function cancelEditing() {
  const back = state.returnToReader;
  if (await navigate('library')) {
    if (back) openReader(back);
  }
}

function openEditorForEdit(song) {
  if(song.legacy){toast('Migra primero las canciones de este teléfono desde Configuración.',4500);return;}
  const base={title:song.title,lyrics:song.lyrics,categoryId:song.categoryId??null,categoryIds:categoryIds(song),number:song.number||'',key:structuredClone(song.key||blankKey()),chords:structuredClone(song.chords||[])};
  drafts.edit={id:song.id,revision:song.revision,...base,orig:structuredClone(base)};
  state.editing = true;
  state.view = 'add'; state.addMode = 'editor';
  renderEditor();
  applyView();
}

/* ============================================================
   Foto + OCR
   ============================================================ */
let pendingMode = 'replace';
let ocrRunning = false;

function pickImage(input, mode) {
  pendingMode = mode;
  input.value = '';
  input.click();
}

function showBusy(file) {
  el.busyImg.src = URL.createObjectURL(file);
  el.busyTitle.textContent = 'Leyendo la letra…';
  el.busySub.textContent = 'La primera vez tarda un poco más.';
  el.busyBar.style.width = '4%';
  el.busy.hidden = false;
}

function hideBusy() {
  el.busy.hidden = true;
  if (el.busyImg.src) URL.revokeObjectURL(el.busyImg.src);
  el.busyImg.removeAttribute('src');
}

function onOcrStatus({ status, progress = 0 }) {
  const steps = {
    'preparing image': ['Preparando la foto…', 0.02, 0.06],
    'loading tesseract core': ['Preparando el lector…', 0.06, 0.2],
    'initializing tesseract': ['Preparando el lector…', 0.2, 0.22],
    'loading language traineddata': ['Cargando el idioma español…', 0.22, 0.36],
    'initializing api': ['Casi listo…', 0.36, 0.4],
    'recognizing text': ['Leyendo la letra…', 0.4, 1],
  };
  const step = steps[status];
  if (!step) return;
  const [label, from, to] = step;
  const value = from + (to - from) * Math.min(1, Math.max(0, progress));
  el.busyTitle.textContent = label;
  el.busyBar.style.width = `${Math.round(value * 100)}%`;
  el.busyBar.parentElement.setAttribute('aria-valuenow', String(Math.round(value * 100)));
}

function fillCapture(result){
 const d=currentDraft();d.lyrics=result.lyrics;d.chords=result.chords||[];d.title=result.title||'';d.number=result.number||'';d.key=result.key||blankKey();
 const cat=state.cats.find(c=>norm(c.name)===norm(result.category));d.categoryId=cat?.id||null;d.categoryIds=cat?[cat.id]:[];d.categorySuggested=cat?'':result.category||'';
 d.transient=true;d.ocrNotice=(result.warnings||[]).join(' · ')||'Revisa la letra, el título y los acordes antes de guardar.';
 persistDraft.flush();renderEditor();if(d.categorySuggested){el.cat.add(new Option(d.categorySuggested+' (sugerida)','__suggested__'));el.cat.value='__suggested__';}onDraftChanged();
}
async function nextCapture(){
 if(captureQueue.length){captureIndex++;drafts.fresh=emptyDraft();fillCapture(captureQueue.shift());window.scrollTo(0,0);return;}
 captureTotal=0;captureIndex=0;captureQueue=[];drafts.fresh=emptyDraft();persistDraft.flush();clearPhoto();state.q='';el.q.value='';state.cat='all';await navigate('library');toast('Revisión terminada. Las canciones guardadas están en la biblioteca.');
}
async function runOcr(file,requestedMode){
 if(ocrRunning)return;if(!access.isEditor()){toast('Entra como Editor para reconocer fotos.');return;}
 if(requestedMode==='replace'&&hasContent(drafts.fresh)&&!await confirmBox({title:'¿Reemplazar el borrador?',message:'La canción sin guardar se reemplazará con esta transcripción.',okLabel:'Continuar'}))return;
 ocrRunning=true;let cropped;
 try{if(file){clearPhoto();cropped=await cropImage(file,{instructions:$('#ai-instructions').value,onInstructions:value=>{$('#ai-instructions').value=value;}});}else cropped=getPhoto();if(!cropped)return;
  const controller=new AbortController();el.busyCancelHandler=()=>{controller.abort();cancelOcr();clearPhoto();};showBusy(cropped);el.busySub.textContent='Reconociendo letra y acordes. Puede tardar hasta dos minutos.';
  const results=await recognizePhoto(cropped,{signal:controller.signal,onStatus:onOcrStatus});if(controller.signal.aborted)return;
  if(!results.length)throw new Error('No se detectaron canciones.');
  if(results.length>1&&requestedMode==='append'){toast('Se detectaron varias canciones. Recorta una sola para añadir una página a esta letra.',6000);return;}
  const result=results[0];
  if(requestedMode==='replace'){drafts.fresh=emptyDraft();captureQueue=results.slice(1);captureTotal=results.length>1?results.length:0;captureIndex=1;}

  if(!state.editing)await navigate('editor');const d=currentDraft();const previousLines=d.lyrics.split('\n').length;
  if(requestedMode==='append'&&d.lyrics.trim()){
   d.lyrics=d.lyrics.trimEnd()+'\n\n'+result.lyrics;const shift=d.lyrics.slice(0,d.lyrics.length-result.lyrics.length).split('\n').length-1;d.chords=[...(d.chords||[]),...(result.chords||[]).map(c=>({...c,line:c.line+shift}))];
  }else{d.lyrics=result.lyrics;d.chords=result.chords||[];}
  if(!d.title)d.title=result.title||'';if(!d.number)d.number=result.number||'';
  if(result.key?.note)d.key=result.key;
  const cat=state.cats.find(c=>norm(c.name)===norm(result.category));if(cat){d.categoryIds=[...new Set([...categoryIds(d),cat.id])];d.categoryId=d.categoryIds[0];}else if(result.category)d.categorySuggested=result.category;
  d.transient=true;d.ocrNotice=(result.warnings||[]).join(' · ')||'Revisa la letra, el título y todos los acordes antes de guardar.';
  persistDraft.flush();renderEditor();if(d.categorySuggested){const option=new Option(d.categorySuggested+' (sugerida)','__suggested__');el.cat.add(option);el.cat.value='__suggested__';}
  onDraftChanged();toast('Transcripción lista para revisión. Todavía no se ha guardado.',4500);
 }catch(error){if(error.name!=='AbortError')toast(error.message||'No se pudo reconocer la foto.',6000);}
 finally{ocrRunning=false;el.busyCancelHandler=null;hideBusy();cropped=null;el.fileCamera.value='';el.fileGallery.value='';}
}

/* ============================================================
   Lectura (fondo blanco)
   ============================================================ */
let wakeLock = null;

async function keepAwake() {
  try {
    if (wakeLock && !wakeLock.released) return;
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null;
  }
}

function releaseAwake() {
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
}

function currentFontSize() {
  const saved = Number(readStorage(FONT_KEY, 28));
  return FONT_STEPS.includes(saved) ? saved : 28;
}

function applyFontSize(px) {
  el.rdLyrics.style.setProperty('--fs', `${px}px`);
  const index = FONT_STEPS.indexOf(px);
  el.rdSmaller.disabled = index <= 0;
  el.rdBigger.disabled = index >= FONT_STEPS.length - 1;
}

function stepFont(direction) {
  const index = FONT_STEPS.indexOf(currentFontSize());
  const next = FONT_STEPS[Math.max(0, Math.min(FONT_STEPS.length - 1, index + direction))];
  writeStorage(FONT_KEY, String(next));
  applyFontSize(next);
}

function openReader(id) {
  mass.resetReader(); gospel.resetReader();
  const song = state.songs.find((s) => String(s.id) === String(id));
  if (!song) return;
  displaySong(song);
}

function displaySong(song) {
  state.readerId = song.id ?? null;
  const editable = access.isEditor() && Boolean(song.id) && !song.shared;
  $('#rd-edit').hidden = !editable; $('#rd-delete').hidden = !editable;
  el.rdTitle.textContent = (song.number?song.number+' · ':'')+song.title;
  el.rdCat.textContent = catName(song);
  state.readerSong=song;
  renderReaderMusic();
  $('#rd-key').textContent=keyLabel(song.key);
  applyFontSize(currentFontSize());
  el.reader.hidden = false;
  el.rdScroll.scrollTop = 0;
  keepAwake();
  if (!history.state?.reader) history.pushState({ reader: true }, '');
}

function renderReaderMusic(){const song=state.readerSong;if(!song)return;const show=readStorage('cancionero.show-chords','1')==='1';$('#show-chords').checked=show;el.rdLyrics.innerHTML=renderMusic(song.lyrics,song.chords||[],show);}

function closeReader({ fromPop = false } = {}) {
  if (el.reader.hidden) return;
  el.reader.hidden = true;
  mass.resetReader(); gospel.resetReader();
  state.readerId = null;
  releaseAwake();
  if (!fromPop && history.state?.reader) history.back();
  if (state.view === 'mass') mass.show();
}

async function deleteFromReader() {
  if(!access.isEditor()) return;
  const song = state.songs.find((s) => s.id === state.readerId);
  if (!song) return;
  const ok = await confirmBox({
    title: '¿Eliminar esta letra?',
    message: `«${song.title}» se borrará de tu lista. Esta acción no se puede deshacer.`,
    okLabel: 'Eliminar',
    danger: true,
  });
  if (!ok) return;
  try{await store.deleteSong(song.id);}catch(error){toast(error.message,5000);return;}
  await refresh();
  closeReader();
  renderLibrary();
  toast('Letra eliminada');
}

function editFromReader() {
  if(!access.isEditor()) return;
  const song = state.songs.find((s) => s.id === state.readerId);
  if (!song) return;
  closeReader();
  state.returnToReader = song.id;
  openEditorForEdit(song);
}

/* ============================================================
   Ajustes: categorías y respaldo
   ============================================================ */
function renderSheet() {
  if(!access.isEditor()){el.sheetBody.innerHTML='<section><h3>Acceso</h3><p>Estás en modo Visor.</p><button type="button" class="btn primary block" id="change-access">Cambiar modo de acceso</button></section><p class="note">Versión '+esc(window.APP_VERSION)+'</p>';return;}
  const counts = new Map();
  for (const s of state.songs) for(const id of songCategories(s))counts.set(id,(counts.get(id)||0)+1);
  const rows = state.cats
    .map(
      (c) => `<div class="cat-row" data-id="${c.id}"><button type="button" class="cat-drag" aria-label="Arrastrar ${esc(c.name)} para ordenar">⠿</button>
        <span class="cat-name">${esc(c.name)}</span>
        <small>${counts.get(c.id) ?? 0}</small><button type="button" class="icon-btn" data-act="cat-up" aria-label="Subir ${esc(c.name)}">↑</button><button type="button" class="icon-btn" data-act="cat-down" aria-label="Bajar ${esc(c.name)}">↓</button>
        <button type="button" class="icon-btn" data-act="rename" aria-label="Renombrar ${esc(c.name)}">${icon('pencil', 20)}</button>
        <button type="button" class="icon-btn" data-act="delete" aria-label="Eliminar ${esc(c.name)}">${icon('trash-2', 20)}</button>
      </div>`,
    )
    .join('');
  el.sheetBody.innerHTML = `
    <section><h3>Acceso y preferencias</h3><button type="button" class="btn secondary block" id="change-access">Cambiar modo de acceso</button><button type="button" class="btn ghost block" id="revoke-sessions">Cerrar todas las sesiones de Editor</button><label class="setting-toggle"><input type="checkbox" id="allow-ocr" ${readStorage('cancionero.allow-ocr')==='1'?'checked':''}> Permitir OCR tradicional</label><p class="note">OpenAI es el motor principal. El OCR tradicional solo aparece si activas esta opción.</p><button type="button" class="btn secondary block" id="migrate-settings">Migrar canciones de este teléfono</button><p id="migration-progress" role="status"></p></section>
    <section>
      <h3>Categorías</h3><p class="note">Arrastra el asa ⠿ para ordenar. Este orden se comparte en todos los filtros y selectores. También puedes usar las flechas.</p>
      <div class="cat-list">${rows || '<p class="note" style="padding:16px">Aún no tienes categorías.</p>'}</div>
      <form class="add-row" id="cat-form">
        <input id="cat-new" type="text" maxlength="40" placeholder="Nueva categoría…" autocomplete="off" enterkeyhint="done" aria-label="Nombre de la nueva categoría">
        <button class="btn primary" type="submit">Añadir</button>
      </form>
      <p class="note" style="margin-top:10px">Al eliminar una categoría, sus letras no se borran: quedan «sin categoría».</p>
    </section>
    <section>
      <h3>Respaldo</h3>
      <div class="backup-actions">
        <button type="button" class="btn secondary block" id="btn-export">${icon('download', 20)} Exportar letras y misas</button>
        <button type="button" class="btn secondary block" id="btn-import">${icon('upload', 20)} Importar un respaldo</button>
      </div>
      <p class="note" style="margin-top:12px">La biblioteca central se comparte mediante Supabase. Los originales locales se conservan durante la migración. Los respaldos incluyen letras, tonalidades, acordes y misas; nunca fotografías.</p>
    </section>
    <p class="note">Mi Cancionero · versión ${esc(window.APP_VERSION)}</p>`;
}

function openSheet() {
  renderSheet();
  el.sheet.hidden = false;
}

function closeSheet() {
  el.sheet.hidden = true;
}

async function sheetAddCategory(name) {
  try {
    await store.addCategory(name);
    await refresh();
    renderSheet();
    renderLibrary();
    renderCatSelect();
  } catch (err) {
    toast(err.message);
  }
}

async function sheetRename(id) {
  const cat = state.catById.get(id);
  const name = await askText({ title: 'Renombrar categoría', value: cat.name, okLabel: 'Guardar' });
  if (!name) return;
  try {
    await store.renameCategory(id, name);
    await refresh();
    renderSheet();
    renderLibrary();
    renderCatSelect();
  } catch (err) {
    toast(err.message);
  }
}

async function saveCategoryOrder(){
 const categories=[...el.sheetBody.querySelectorAll('.cat-row')].map(row=>state.catById.get(idValue(row.dataset.id))).filter(Boolean);
 el.sheetBody.inert=true;try{await store.reorderCategories(categories);await refresh();renderLibrary();renderCatSelect();renderSheet();toast('Orden de categorías guardado para todos');}catch(error){toast(error.message,5000);await refresh();renderSheet();}finally{el.sheetBody.inert=false;}
}
async function sheetDelete(id) {
  const cat = state.catById.get(id);if(!cat){toast('Actualiza las categorías e inténtalo de nuevo.');return;}
  const used = state.songs.filter((s) => songCategories(s).includes(id)).length;
  const ok = await confirmBox({
    title: `¿Eliminar «${cat.name}»?`,
    message: used
      ? `Se quitará esta categoría de ${used} canciones. Las demás categorías y las letras se conservan.`
      : 'No tiene letras asignadas.',
    okLabel: 'Eliminar',
    danger: true,
  });
  if (!ok) return;
  await store.deleteCategory(id);
  for (const d of [drafts.fresh, drafts.edit]) if(d){d.categoryIds=categoryIds(d).filter(c=>c!==id);d.categoryId=d.categoryIds[0]??null;}
  await refresh();
  renderSheet();
  renderLibrary();
  renderCatSelect();
}

async function exportBackup() {
  const json = JSON.stringify(await store.exportAll(), null, 2);
  const name = `cancionero-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Respaldo del Cancionero' });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Respaldo descargado');
}

async function importBackup(file) {
  try {
    if (file.size > 30 * 1024 * 1024) throw new Error('El archivo es demasiado grande.');
    const data = JSON.parse(await file.text());
    const { added, skipped, massesAdded } = await store.importAll(data);
    await refresh();
    renderLibrary();
    renderCatSelect();
    if (!el.sheet.hidden) renderSheet();
    toast(
      massesAdded ? `Respaldo importado: ${added} letras y ${massesAdded} misas nuevas.` : added
        ? `Se importaron ${plural(added, 'canción', 'canciones')}${skipped ? ` (${skipped} ya estaban)` : ''}`
        : 'No había letras nuevas para importar',
      3600,
    );
  } catch (err) {
    toast(err instanceof SyntaxError ? 'El archivo no es un respaldo válido.' : err.message, 3600);
  }
}

async function runMigration(){
 if(!access.isEditor()){await access.show();return;}
 const pending=await store.pendingLocal();if(!pending.length){toast('No hay canciones locales pendientes.');return;}
 if(!await confirmBox({title:`¿Compartir ${pending.length} canciones?`,message:'Se subirán copias a Supabase. Los originales permanecerán en este teléfono.',okLabel:'Migrar copias'}))return;
 const node=$('#migration-progress')||$('#migration-banner');
 try{const result=await store.migrateLocal((done,total)=>{node.textContent=`Verificadas ${done} de ${total} canciones…`;});await refresh();renderLibrary();toast(result.pending?`Quedan ${result.pending} canciones por revisar. Los originales siguen guardados.`:`Se verificaron ${result.verified} canciones en Supabase.`,6000);if(!el.sheet.hidden)renderSheet();}
 catch(error){toast(error.message,6000);await refresh();renderLibrary();}
}
async function revokeSessions(){if(!await confirmBox({title:'¿Cerrar todas las sesiones?',message:'Todos los editores tendrán que introducir la contraseña de nuevo.',okLabel:'Cerrar sesiones'}))return;try{await call('revoke_all');await clearSession();closeSheet();toast('Sesiones revocadas.');}catch(error){toast(error.message);}}

/* ============================================================
   Eventos
   ============================================================ */
function bindEvents() {
  // Pestañas
  el.tabs.forEach((tab) => tab.addEventListener('click', () => navigate(tab.dataset.tab)));
  $('#btn-settings').addEventListener('click', openSheet);
  $$('[name="add-method"]').forEach(input => input.addEventListener('change', () => navigate(input.value)));
  window.addEventListener('beforeinstallprompt', event => event.preventDefault());

  // Biblioteca
  el.q.addEventListener('input', () => {
    state.q = el.q.value;
    renderList();
  });
  el.q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.q.blur();
  });
  el.qClear.addEventListener('click', () => {
    el.q.value = '';
    state.q = '';
    renderList();
    el.q.focus();
  });
  el.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const value = chip.dataset.cat;
    state.cat = value === 'all' || value === 'none' ? value : idValue(value);
    renderChips();
    renderList();
  });
  el.list.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) {
      navigate(go.dataset.go);
      return;
    }
    const row = e.target.closest('.song');
    if (row) openReader(row.dataset.id);
  });
  // Editor
  el.title.addEventListener('input', () => {
    currentDraft().title = el.title.value;
    onDraftChanged();
  });
  el.lyrics.addEventListener('input', () => {
    const d=currentDraft();d.chords=rebaseChords(d.lyrics,el.lyrics.value,d.chords||[]);d.lyrics=el.lyrics.value;music.render();
    onDraftChanged();
  });
  el.cat.addEventListener('change', onCategoryChange);
  $('#category-checks').addEventListener('change',e=>{if(!e.target.matches('input[type=checkbox]'))return;const d=currentDraft();if(e.target.value==='__suggested__'){d.categorySuggested='';e.target.closest('label').remove();}else{const id=idValue(e.target.value);d.categoryIds=e.target.checked?[...new Set([...categoryIds(d),id])]:categoryIds(d).filter(c=>c!==id);d.categoryId=d.categoryIds[0]??null;}updateCategorySummary();onDraftChanged();});
  $('#category-new').onclick=()=>{$('#category-dropdown').open=false;el.cat.value=NEW_CATEGORY;onCategoryChange();};
  $('#category-done').onclick=()=>{$('#category-dropdown').open=false;$('#category-summary').focus();};
  document.addEventListener('click',e=>{if(!e.target.closest('#category-dropdown'))$('#category-dropdown').open=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#category-dropdown').open){$('#category-dropdown').open=false;$('#category-summary').focus();}});
  $('#btn-paste').addEventListener('click', pasteFromClipboard);
  $('#btn-addphoto').addEventListener('click', () => pickImage(el.fileGallery, 'append'));
  el.clear.addEventListener('click', clearDraft);
  el.editorCancel.addEventListener('click', cancelEditing);
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveCurrent();
  });

  // Foto
  $('#btn-camera').addEventListener('click', () => pickImage(el.fileCamera, 'replace'));
  $('#btn-gallery').addEventListener('click', () => pickImage(el.fileGallery, 'replace'));
  for (const input of [el.fileCamera, el.fileGallery]) {
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (file) runOcr(file, pendingMode);
    });
  }
  $('#reprocess-photo').addEventListener('click',async()=>{await navigate('scan');runOcr(null,'replace');});
  $('#show-chords').addEventListener('change',()=>{writeStorage('cancionero.show-chords',$('#show-chords').checked?'1':'0');renderReaderMusic();});
  $('#sync-refresh').addEventListener('click',()=>store.syncLibrary());
  $('#migration-banner').addEventListener('click',e=>{if(e.target.closest('#migration-start'))runMigration();});
  $('#busy-cancel').addEventListener('click', () => el.busyCancelHandler?.());

  // Lectura
  $('#rd-back').addEventListener('click', () => closeReader());
  el.rdSmaller.addEventListener('click', () => stepFont(-1));
  el.rdBigger.addEventListener('click', () => stepFont(1));
  $('#rd-edit').addEventListener('click', editFromReader);
  $('#rd-delete').addEventListener('click', deleteFromReader);
  window.addEventListener('popstate', () => closeReader({ fromPop: true }));
  document.addEventListener('visibilitychange', () => {
    if (!el.reader.hidden && document.visibilityState === 'visible') keepAwake();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.sheet.hidden) closeSheet();
    else if (!el.reader.hidden) closeReader();
  });

  // Ajustes
  $('#capture-skip').onclick=async()=>{if(await confirmBox({title:'¿Omitir esta canción?',message:'Esta canción no se guardará. Podrás continuar con la próxima.',okLabel:'Omitir'}))nextCapture();};
  $('#sheet-close').addEventListener('click', closeSheet);
  el.sheet.addEventListener('click', (e) => {
    if (e.target === el.sheet) closeSheet();
  });
  let draggedCategory=null,movedCategory=false;
  el.sheetBody.addEventListener('pointerdown',e=>{const handle=e.target.closest('.cat-drag');if(!handle||e.button!==0)return;e.preventDefault();draggedCategory=handle.closest('.cat-row');movedCategory=false;draggedCategory.classList.add('dragging');el.sheetBody.setPointerCapture(e.pointerId);});
  el.sheetBody.addEventListener('pointermove',e=>{if(!draggedCategory)return;e.preventDefault();const row=document.elementFromPoint(e.clientX,e.clientY)?.closest('.cat-row');if(row&&row!==draggedCategory&&el.sheetBody.contains(row)){const rect=row.getBoundingClientRect();if(e.clientY<rect.top+rect.height/2)row.before(draggedCategory);else row.after(draggedCategory);movedCategory=true;}const b=el.sheetBody.getBoundingClientRect();if(e.clientY<b.top+45)el.sheetBody.scrollTop-=16;else if(e.clientY>b.bottom-45)el.sheetBody.scrollTop+=16;});
  const endCategoryDrag=()=>{if(!draggedCategory)return;draggedCategory.classList.remove('dragging');draggedCategory=null;if(movedCategory)saveCategoryOrder();};el.sheetBody.addEventListener('pointerup',endCategoryDrag);el.sheetBody.addEventListener('pointercancel',endCategoryDrag);
  el.sheetBody.addEventListener('click', (e) => {
    const row = e.target.closest('.cat-row');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if(e.target.closest('#change-access')){closeSheet();access.show();return;}
    if(e.target.closest('#migrate-settings')){runMigration();return;}
    if(e.target.closest('#revoke-sessions')){revokeSessions();return;}
    if(row&&['cat-up','cat-down'].includes(act)){const rows=[...el.sheetBody.querySelectorAll('.cat-row')],i=rows.indexOf(row),other=rows[i+(act==='cat-up'?-1:1)];if(other){if(act==='cat-up')other.before(row);else other.after(row);saveCategoryOrder();}return;}
    if (row && act === 'rename') sheetRename(idValue(row.dataset.id)).catch(error=>toast(error.message,5000));
    else if (row && act === 'delete') sheetDelete(idValue(row.dataset.id)).catch(error=>toast(error.message,5000));
    else if (e.target.closest('#btn-export')) exportBackup();
    else if (e.target.closest('#btn-import')) {
      el.fileImport.value = '';
      el.fileImport.click();
    }
  });
  el.sheetBody.addEventListener('change',e=>{if(e.target.id==='allow-ocr'){writeStorage('cancionero.allow-ocr',e.target.checked?'1':'0');applyEnginePreference();}});
  el.sheetBody.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#cat-new', el.sheetBody);
    if (input.value.trim()) sheetAddCategory(input.value);
  });
  el.fileImport.addEventListener('change', () => {
    const file = el.fileImport.files?.[0];
    if (file) importBackup(file);
  });

  // Guardar el borrador si la app se cierra o se actualiza
  window.addEventListener('pagehide', () => {
    persistDraft.flush(); el.busyCancelHandler?.(); hideBusy();clearPhoto();
    el.fileCamera.value = ''; el.fileGallery.value = '';
  });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    if (drafts.fresh.transient) drafts.fresh = emptyDraft();
    if (drafts.edit?.transient) { state.editing = false; drafts.edit = null; }
    persistDraft.flush(); renderEditor();
  });
}

/* ============================================================
   Inicio
   ============================================================ */
async function init() {
  hydrateIcons(document);
  initRecognition();
  bindEvents();
  try {
    await refresh();
  } catch {
    el.subtitle.textContent = 'No se pudo abrir el almacenamiento';
    el.list.innerHTML = `<div class="empty"><h3>No pude abrir tus letras</h3>
      <p>Tu navegador bloqueó el almacenamiento local. Sal del modo privado y vuelve a abrir la app.</p></div>`;
    return;
  }
  renderLibrary();
  renderCatSelect();
  updateDraftDot();
  applyView();
  applyAccess();
  store.syncLibrary();syncSharedSongs();
  initPWA({
    canReload: () => !access.isChoosing() && !mass.isEditing() && !ocrRunning && !isEditDirty() && !hasContent(drafts.fresh),
    onBeforeReload: () => {
      persistDraft.flush();
      toast('Actualizando la app…');
    },
  });
}

function applyAccess(){
  const editor=access.isEditor();
  $('[data-tab="add"]').hidden=!editor;$('#btn-settings').hidden=false;
  document.body.dataset.mode=editor?'editor':'viewer';
  if(!editor && state.view==='add'){state.editing=false;drafts.edit=null;captureQueue=[];captureTotal=0;captureIndex=0;if(drafts.fresh.transient)drafts.fresh=emptyDraft();state.view='library';}
  gospel.updateAccess();mass.setCanEdit(editor);if(!editor){clearPhoto();closeSheet();}refresh().then(()=>{renderLibrary();applyView();}).catch(()=>{});
}
const mass = initMass({ getSongs: () => state.songs.filter(s=>!s.shared), categoryName: catName, openSong: song=>{gospel.resetReader();displaySong(song);}, canEdit:()=>access.isEditor() });
const gospel = initGospel({canEdit:()=>access.isEditor(),openReading:displaySong,closeOtherReaders:()=>mass.resetReader()});
const access = initAccess({onChange:()=>{applyAccess();closeReader();},beforeChange:async()=>{
  if(state.editing&&isEditDirty())return confirmBox({title:'¿Cambiar el modo?',message:'Guarda tus cambios antes de cambiar el modo.',okLabel:'Continuar'});
  if(mass.isEditing())return confirmBox({title:'¿Cambiar el modo?',message:'Hay una misa en edición. Guarda sus cambios antes de cambiar el modo.',okLabel:'Continuar'});
  return true;
}});
const music=initMusicEditor({getDraft:currentDraft,onChanged:onDraftChanged});
window.addEventListener('cancionero:sync',async()=>{await refresh();mass.refreshSongs();renderLibrary();if(!el.sheet.hidden)renderSheet();});
window.addEventListener('online',()=>store.syncLibrary());
window.addEventListener('cancionero:mass-updated',syncSharedSongs);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&['library','mass'].includes(state.view)){store.syncLibrary();syncSharedSongs();}});
setInterval(()=>{if(['library','mass'].includes(state.view)&&document.visibilityState==='visible'){store.syncLibrary();syncSharedSongs();}},30000);
init();
