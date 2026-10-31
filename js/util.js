// Utilidades pequeñas compartidas por todos los módulos.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para insertarlo de forma segura dentro de innerHTML. */
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/**
 * Normaliza texto para comparar y buscar: sin tildes, sin mayúsculas,
 * sin signos y con espacios simples. "¡Señor, ten piedad!" -> "senor ten piedad".
 */
export const norm = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function debounce(fn, wait = 300) {
  let timer = 0;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return wrapped;
}

const loadedScripts = new Map();

/** Carga un script una sola vez y devuelve una promesa. */
export function loadScript(src) {
  if (!loadedScripts.has(src)) {
    loadedScripts.set(
      src,
      new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.onload = resolve;
        el.onerror = () => {
          loadedScripts.delete(src);
          reject(new Error(`No se pudo cargar ${src}`));
        };
        document.head.appendChild(el);
      }),
    );
  }
  return loadedScripts.get(src);
}

/** Lee un valor de localStorage sin romperse si el almacenamiento está bloqueado. */
export function readStorage(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw;
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}
