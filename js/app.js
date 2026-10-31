// Mi Cancionero — lógica principal de la interfaz.
import { $, $$, esc, norm, debounce, readStorage, writeStorage } from './util.js';
import { icon, hydrateIcons } from './icons.js';
import * as store from './db.js';
import { confirmBox, askText, modal, toast } from './ui.js';
import { ocrSupported, readLyricsFromImage, cancelOcr } from './ocr.js';
import { initPWA } from './pwa.js';
import { cropImage } from './crop.js';
import { initMass } from './mass.js';

/* ============================================================
   Estado
   ============================================================ */
const DRAFT_KEY = 'cancionero.draft.v2';
// Older drafts mixed OCR results with persistent text; never restore those captures.
writeStorage('cancionero.draft.v1', null);
const FONT_KEY = 'cancionero.fontsize';
const HINT_KEY = 'cancionero.hint.dismissed';
const FONT_STEPS = [18, 20, 22, 24, 26, 28, 32, 36, 40, 46, 52];
const NEW_CATEGORY = '__new__';

const state = {
  songs: [], // letras con campos auxiliares de búsqueda (_t, _l)
  cats: [],
  catById: new Map(),
  q: '',
  cat: 'all', // 'all' | 'none' | id numérico
  view: 'library', // 'library' | 'editor' | 'scan'
  editing: false, // true cuando se edita una letra ya guardada
  readerId: null,
  flashId: null,
  returnToReader: null,
};

const emptyDraft = () => ({ title: '', lyrics: '', categoryId: null });

function loadDraft() {
  try {
    const parsed = JSON.parse(readStorage(DRAFT_KEY, 'null'));
    if (parsed && typeof parsed === 'object') {
      return {
        title: String(parsed.title ?? ''),
        lyrics: String(parsed.lyrics ?? ''),
        categoryId: Number.isFinite(parsed.categoryId) ? parsed.categoryId : null,
      };
    }
  } catch {
    /* borrador dañado: se empieza de cero */
  }
  return emptyDraft();
}

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
  views: { library: $('#view-library'), editor: $('#view-editor'), scan: $('#view-scan'), mass: $('#view-mass') },
  tabs: $$('.tab'),
  q: $('#q'),
  qClear: $('#q-clear'),
  chips: $('#chips'),
  info: $('#results-info'),
  list: $('#list'),
  hint: $('#install-hint'),
  form: $('#editor'),
  editorTitle: $('#editor-title'),
  editorCancel: $('#editor-cancel'),
  title: $('#f-title'),
  cat: $('#f-cat'),
  lyrics: $('#f-lyrics'),
  firstLine: $('#btn-firstline'),
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
  state.songs = songs.map((s) => ({ ...s, _t: norm(s.title), _l: norm(s.lyrics) }));
  state.songs.sort((a, b) => a._t.localeCompare(b._t, 'es'));
  if (typeof state.cat === 'number' && !state.catById.has(state.cat)) state.cat = 'all';
}

const catName = (song) => state.catById.get(song.categoryId)?.name ?? '';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ============================================================
   Biblioteca: búsqueda, filtros y lista
   ============================================================ */
function searchSongs(items, rawQuery) {
  const phrase = norm(rawQuery);
  if (!phrase) return items.map((s) => ({ s, score: 0 }));
  const tokens = phrase.split(' ');
  const out = [];
  for (const s of items) {
    const hay = `${s._t} ${s._l}`;
    let score;
    if (s._t.startsWith(phrase)) score = 0;
    else if (s._t.includes(phrase)) score = 1;
    else if (tokens.every((t) => s._t.includes(t))) score = 2;
    else if (s._l.includes(phrase)) score = 3;
    else if (tokens.every((t) => hay.includes(t))) score = 4;
    else continue;
    out.push({ s, score });
  }
  out.sort((a, b) => a.score - b.score || a.s._t.localeCompare(b.s._t, 'es'));
  return out;
}

/** Devuelve la línea de la letra que contiene lo buscado, para mostrarla bajo el título. */
function snippetFor(song, rawQuery) {
  const phrase = norm(rawQuery);
  const tokens = phrase.split(' ');
  const lines = song.lyrics.split('\n');
  const normalized = lines.map(norm);
  let index = normalized.findIndex((l) => l.includes(phrase));
  if (index < 0) {
    for (let i = 0; i < normalized.length - 1; i += 1) {
      if (`${normalized[i]} ${normalized[i + 1]}`.includes(phrase)) {
        index = i;
        break;
      }
    }
  }
  if (index < 0) index = normalized.findIndex((l) => tokens.some((t) => l.includes(t)));
  if (index < 0) return '';
  const line = lines[index].trim();
  return line.length > 90 ? `${line.slice(0, 87)}…` : line;
}

function visibleSongs() {
  const filtered = state.songs.filter((s) => {
    if (state.cat === 'all') return true;
    if (state.cat === 'none') return !state.catById.has(s.categoryId);
    return s.categoryId === state.cat;
  });
  return searchSongs(filtered, state.q);
}

function renderSubtitle() {
  const n = state.songs.length;
  el.subtitle.textContent = n ? plural(n, 'letra', 'letras') : 'Tu biblioteca está vacía';
}

function chipHtml(value, label, count) {
  const pressed = String(state.cat) === String(value);
  return `<button type="button" class="chip" data-cat="${esc(value)}" aria-pressed="${pressed}">${esc(label)} <small>${count}</small></button>`;
}

function renderChips() {
  const counts = new Map();
  let none = 0;
  for (const s of state.songs) {
    if (state.catById.has(s.categoryId)) counts.set(s.categoryId, (counts.get(s.categoryId) ?? 0) + 1);
    else none += 1;
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
  const showSnippet = searching && score >= 3;
  const snippet = showSnippet ? snippetFor(s, state.q) : '';
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
      <h3>Aún no hay letras</h3>
      <p>Pega una letra o toma una foto a la hoja y se agregará a tu lista.</p>
      <div class="empty-actions">
        <button type="button" class="btn primary" data-go="editor">${icon('clipboard-paste', 20)} Pegar una letra</button>
        <button type="button" class="btn secondary" data-go="scan">${icon('camera', 20)} Tomar foto</button>
      </div>
    </div>`;
}

function renderList() {
  const searching = norm(state.q) !== '';
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
    el.info.textContent = `${plural(rows.length, 'letra', 'letras')} · ${label}`;
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
const isEditDirty = () => {
  const d = drafts.edit;
  return Boolean(d) && (d.title !== d.orig.title || d.lyrics !== d.orig.lyrics || d.categoryId !== d.orig.categoryId);
};

function applyView() {
  for (const [name, node] of Object.entries(el.views)) node.hidden = name !== state.view;
  const active = state.view === 'editor' && state.editing ? null : state.view;
  el.tabs.forEach((tab) => {
    if (tab.dataset.tab === active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

async function navigate(view) {
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
  state.view = view;
  updateDraftDot();
  if (view === 'editor') renderEditor();
  if (view === 'library') renderLibrary();
  if (view === 'mass') await mass.show();
  applyView();
  return true;
}

/* ============================================================
   Editor (pegar letra / editar)
   ============================================================ */
function renderCatSelect() {
  const d = currentDraft() ?? drafts.fresh;
  const options = [
    '<option value="">Sin categoría</option>',
    ...state.cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`),
    `<option value="${NEW_CATEGORY}">＋ Añadir categoría nueva…</option>`,
  ];
  el.cat.innerHTML = options.join('');
  el.cat.value = d.categoryId && state.catById.has(d.categoryId) ? String(d.categoryId) : '';
}

function updateFirstLineButton() {
  const d = currentDraft();
  el.firstLine.hidden = !(d && !d.title.trim() && d.lyrics.trim());
}

function updateDraftDot() {
  $('[data-tab="editor"]').classList.toggle('has-draft', hasContent(drafts.fresh));
}

function renderEditor() {
  const d = currentDraft();
  el.editorTitle.textContent = state.editing ? 'Editar letra' : 'Nueva letra';
  el.editorCancel.hidden = !state.editing;
  el.clear.hidden = state.editing;
  el.save.lastChild.textContent = state.editing ? ' Guardar cambios' : ' Guardar letra';
  $('#ocr-review').hidden = !d.transient;
  $('#ocr-review').textContent = d.ocrNotice || 'Captura temporal: revisa la letra y guárdala. Al recargar se descarta.';
  el.title.value = d.title;
  el.lyrics.value = d.lyrics;
  renderCatSelect();
  updateFirstLineButton();
  updateDraftDot();
}

function onDraftChanged() {
  if (!state.editing) persistDraft();
  updateFirstLineButton();
  updateDraftDot();
}

async function onCategoryChange() {
  const d = currentDraft();
  if (el.cat.value !== NEW_CATEGORY) {
    d.categoryId = el.cat.value ? Number(el.cat.value) : null;
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
    d.categoryId = created.id;
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
    d.lyrics = hasText ? `${d.lyrics.slice(0, start)}${text}${d.lyrics.slice(end)}` : text;
    el.lyrics.value = d.lyrics;
    onDraftChanged();
    toast('Letra pegada. Ponle título y guarda.');
  } catch {
    toast('No pude leer el portapapeles. Mantén pulsado en el cuadro y elige Pegar.', 3600);
    el.lyrics.focus();
  }
}

async function saveCurrent() {
  const d = currentDraft();
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
    const ok = await confirmBox({
      title: 'Ya existe una letra con ese título',
      message: `«${duplicate.title}» ya está en tu lista. ¿Guardar esta de todos modos?`,
      okLabel: 'Guardar igual',
    });
    if (!ok) return;
  }
  el.save.disabled = true;
  try {
    const id = await store.saveSong({ id: d.id, title, lyrics, categoryId: d.categoryId });
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
      drafts.fresh = emptyDraft();
      persistDraft.flush();
      state.q = '';
      el.q.value = '';
      state.cat = 'all';
      state.flashId = id;
      await navigate('library');
      toast('Letra guardada en tu lista');
    }
  } catch {
    toast('No se pudo guardar. Revisa el espacio del dispositivo.');
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
  const base = { title: song.title, lyrics: song.lyrics, categoryId: song.categoryId ?? null };
  drafts.edit = { id: song.id, ...base, orig: { ...base } };
  state.editing = true;
  state.view = 'editor';
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

async function runOcr(file, requestedMode) {
  if (ocrRunning) return;
  if (!ocrSupported()) {
    toast('Este navegador no puede leer fotos. Pega la letra a mano.', 3600);
    return;
  }
  const mode = requestedMode;
  if (mode === 'replace' && hasContent(drafts.fresh)) {
    const ok = await confirmBox({title: '¿Empezar una captura nueva?', message: 'Se reemplazará la letra sin guardar. Las letras guardadas no se borran.', okLabel: 'Nueva captura'});
    if (!ok) return;
  }
  ocrRunning = true;
  let cropped;
  try { cropped = await cropImage(file); }
  catch (err) { toast(err.message); }
  if (!cropped) { ocrRunning = false; return; }
  const controller = new AbortController();
  el.busyCancelHandler = () => {
    controller.abort();
    cancelOcr();
  };
  showBusy(cropped);
  try {
    const { text, confidence } = await readLyricsFromImage(cropped, {
      onStatus: onOcrStatus,
      signal: controller.signal,
    });
    if (!text) {
      toast('No encontré texto en la foto. Prueba con más luz y de frente.', 3800);
      return;
    }
    if (controller.signal.aborted) return;
    if (mode === 'replace') drafts.fresh = emptyDraft();
    if (state.editing === false && state.view !== 'editor') await navigate('editor');
    const d = currentDraft();
    d.transient = true;
    d.ocrNotice = (confidence < 80 ? 'Hay texto de lectura dudosa. Revisa acentos, palabras y estrofas. ' : 'Revisa el texto y las estrofas antes de guardar. ') + 'La captura es temporal y se descarta al recargar.';
    d.lyrics = mode === 'append' && d.lyrics.trim() ? `${d.lyrics.trimEnd()}\n\n${text}` : text;
    persistDraft.flush();
    renderEditor();
    onDraftChanged();
    el.lyrics.scrollTop = 0;
    toast(
      confidence < 65
        ? 'Foto poco clara: revisa bien el texto antes de guardar.'
        : 'Letra leída. Revísala, ponle título y guarda.',
      3800,
    );
  } catch (err) {
    if (err?.name !== 'AbortError') {
      toast('No pude leer la foto. Prueba con mejor luz o pega la letra.', 3800);
    }
  } finally {
    ocrRunning = false;
    el.busyCancelHandler = null;
    hideBusy();
    cropped = null;
    el.fileCamera.value = '';
    el.fileGallery.value = '';
  }
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
  const saved = Number(readStorage(FONT_KEY, 26));
  return FONT_STEPS.includes(saved) ? saved : 26;
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
  mass.resetReader();
  const song = state.songs.find((s) => s.id === id);
  if (!song) return;
  displaySong(song);
}

function displaySong(song) {
  state.readerId = song.id ?? null;
  el.rdTitle.textContent = song.title;
  el.rdCat.textContent = song.category ?? catName(song);
  el.rdLyrics.textContent = song.lyrics;
  applyFontSize(currentFontSize());
  el.reader.hidden = false;
  el.rdScroll.scrollTop = 0;
  keepAwake();
  if (!history.state?.reader) history.pushState({ reader: true }, '');
}

function closeReader({ fromPop = false } = {}) {
  if (el.reader.hidden) return;
  el.reader.hidden = true;
  mass.resetReader();
  state.readerId = null;
  releaseAwake();
  if (!fromPop && history.state?.reader) history.back();
  if (state.view === 'mass') mass.show();
}

async function deleteFromReader() {
  const song = state.songs.find((s) => s.id === state.readerId);
  if (!song) return;
  const ok = await confirmBox({
    title: '¿Eliminar esta letra?',
    message: `«${song.title}» se borrará de tu lista. Esta acción no se puede deshacer.`,
    okLabel: 'Eliminar',
    danger: true,
  });
  if (!ok) return;
  await store.deleteSong(song.id);
  await refresh();
  closeReader();
  renderLibrary();
  toast('Letra eliminada');
}

function editFromReader() {
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
  const counts = new Map();
  for (const s of state.songs) counts.set(s.categoryId, (counts.get(s.categoryId) ?? 0) + 1);
  const rows = state.cats
    .map(
      (c) => `<div class="cat-row" data-id="${c.id}">
        <span class="cat-name">${esc(c.name)}</span>
        <small>${counts.get(c.id) ?? 0}</small>
        <button type="button" class="icon-btn" data-act="rename" aria-label="Renombrar ${esc(c.name)}">${icon('pencil', 20)}</button>
        <button type="button" class="icon-btn" data-act="delete" aria-label="Eliminar ${esc(c.name)}">${icon('trash-2', 20)}</button>
      </div>`,
    )
    .join('');
  el.sheetBody.innerHTML = `
    <section>
      <h3>Categorías</h3>
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
      <p class="note" style="margin-top:12px">Tus letras y misas se guardan solo en este dispositivo. Exporta un respaldo de vez en cuando para no perderlas si borras los datos del navegador o cambias de teléfono.</p>
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

async function sheetDelete(id) {
  const cat = state.catById.get(id);
  const used = state.songs.filter((s) => s.categoryId === id).length;
  const ok = await confirmBox({
    title: `¿Eliminar «${cat.name}»?`,
    message: used
      ? `${plural(used, 'letra queda', 'letras quedan')} sin categoría. Las letras no se borran.`
      : 'No tiene letras asignadas.',
    okLabel: 'Eliminar',
    danger: true,
  });
  if (!ok) return;
  await store.deleteCategory(id);
  for (const d of [drafts.fresh, drafts.edit]) if (d?.categoryId === id) d.categoryId = null;
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
        ? `Se importaron ${plural(added, 'letra', 'letras')}${skipped ? ` (${skipped} ya estaban)` : ''}`
        : 'No había letras nuevas para importar',
      3600,
    );
  } catch (err) {
    toast(err instanceof SyntaxError ? 'El archivo no es un respaldo válido.' : err.message, 3600);
  }
}

/* ============================================================
   Aviso para instalar la app
   ============================================================ */
let installPrompt = null;

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function renderInstallHint() {
  if (isStandalone() || readStorage(HINT_KEY)) {
    el.hint.hidden = true;
    return;
  }
  let message = '';
  let action = '';
  if (isIos()) {
    message = 'Instálala en tu iPhone: toca Compartir y luego «Añadir a pantalla de inicio».';
  } else if (installPrompt) {
    message = 'Instala el Cancionero para abrirlo como una app, incluso sin internet.';
    action = '<button type="button" class="btn primary small" data-hint="install">Instalar</button>';
  } else {
    el.hint.hidden = true;
    return;
  }
  el.hint.innerHTML = `<p>${esc(message)}</p>${action}<button type="button" class="icon-btn small" data-hint="close" aria-label="Cerrar aviso">${icon('x', 18)}</button>`;
  el.hint.hidden = false;
}

/* ============================================================
   Eventos
   ============================================================ */
function bindEvents() {
  // Pestañas
  el.tabs.forEach((tab) => tab.addEventListener('click', () => navigate(tab.dataset.tab)));
  $('#btn-settings').addEventListener('click', openSheet);

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
    state.cat = value === 'all' || value === 'none' ? value : Number(value);
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
    if (row) openReader(Number(row.dataset.id));
  });
  el.hint.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-hint]')?.dataset.hint;
    if (action === 'close') {
      writeStorage(HINT_KEY, '1');
      el.hint.hidden = true;
    } else if (action === 'install' && installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice.catch(() => {});
      installPrompt = null;
      renderInstallHint();
    }
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    renderInstallHint();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    renderInstallHint();
  });

  // Editor
  el.title.addEventListener('input', () => {
    currentDraft().title = el.title.value;
    onDraftChanged();
  });
  el.lyrics.addEventListener('input', () => {
    currentDraft().lyrics = el.lyrics.value;
    onDraftChanged();
  });
  el.cat.addEventListener('change', onCategoryChange);
  el.firstLine.addEventListener('click', () => {
    const d = currentDraft();
    const first = d.lyrics.split('\n').find((l) => l.trim());
    if (!first) return;
    d.title = first.trim().slice(0, 120);
    el.title.value = d.title;
    onDraftChanged();
  });
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
  $('#sheet-close').addEventListener('click', closeSheet);
  el.sheet.addEventListener('click', (e) => {
    if (e.target === el.sheet) closeSheet();
  });
  el.sheetBody.addEventListener('click', (e) => {
    const row = e.target.closest('.cat-row');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (row && act === 'rename') sheetRename(Number(row.dataset.id));
    else if (row && act === 'delete') sheetDelete(Number(row.dataset.id));
    else if (e.target.closest('#btn-export')) exportBackup();
    else if (e.target.closest('#btn-import')) {
      el.fileImport.value = '';
      el.fileImport.click();
    }
  });
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
    persistDraft.flush(); el.busyCancelHandler?.(); hideBusy();
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
  renderInstallHint();
  initPWA({
    canReload: () => !mass.isEditing() && !ocrRunning && !isEditDirty() && !hasContent(drafts.fresh),
    onBeforeReload: () => {
      persistDraft.flush();
      toast('Actualizando la app…');
    },
  });
}

const mass = initMass({ getSongs: () => state.songs, categoryName: catName, openSong: displaySong });
init();
