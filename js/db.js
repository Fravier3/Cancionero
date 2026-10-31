// Almacenamiento local (IndexedDB con Dexie): letras y categorías.
import { norm } from './util.js';

const Dexie = window.Dexie;

export const db = new Dexie('cancionero');

db.version(1).stores({
  songs: '++id, titleKey, categoryId, updatedAt',
  categories: '++id, &key',
});

export const DEFAULT_CATEGORIES = [
  'Entrada',
  'Piedad',
  'Gloria',
  'Aleluya',
  'Ofertorio',
  'Santo',
  'Cordero de Dios',
  'Comunión',
  'Acción de gracias',
  'Salida',
];

// Solo se ejecuta la primera vez que se crea la base de datos.
db.on('populate', (tx) => {
  tx.table('categories').bulkAdd(
    DEFAULT_CATEGORIES.map((name, order) => ({ name, key: norm(name), order })),
  );
});

/* ---------- Letras ---------- */

/** Limpia saltos de línea y espacios sobrantes sin tocar el contenido. */
export function cleanLyrics(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const listSongs = () => db.songs.toArray();

export async function saveSong({ id, title, lyrics, categoryId }) {
  const now = Date.now();
  const record = {
    title: String(title).trim().replace(/\s+/g, ' '),
    lyrics: cleanLyrics(lyrics),
    categoryId: categoryId ?? null,
    titleKey: norm(title),
    updatedAt: now,
  };
  if (id) {
    await db.songs.update(id, record);
    return id;
  }
  record.createdAt = now;
  return db.songs.add(record);
}

export const deleteSong = (id) => db.songs.delete(id);

/* ---------- Categorías ---------- */

export async function listCategories() {
  const all = await db.categories.toArray();
  return all.sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'es'),
  );
}

function cleanName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
}

export async function addCategory(rawName) {
  const name = cleanName(rawName);
  const key = norm(name);
  if (!key) throw new Error('Escribe un nombre para la categoría.');
  const existing = await db.categories.where('key').equals(key).first();
  if (existing) return existing;
  const all = await db.categories.toArray();
  const order = Math.max(-1, ...all.map((c) => c.order ?? 0)) + 1;
  const id = await db.categories.add({ name, key, order });
  return { id, name, key, order };
}

export async function renameCategory(id, rawName) {
  const name = cleanName(rawName);
  const key = norm(name);
  if (!key) throw new Error('Escribe un nombre para la categoría.');
  const clash = await db.categories.where('key').equals(key).first();
  if (clash && clash.id !== id) throw new Error('Ya existe una categoría con ese nombre.');
  await db.categories.update(id, { name, key });
}

/** Elimina la categoría; las letras que la usaban quedan "sin categoría". */
export function deleteCategory(id) {
  return db.transaction('rw', db.songs, db.categories, async () => {
    await db.songs.where('categoryId').equals(id).modify({ categoryId: null });
    await db.categories.delete(id);
  });
}

/* ---------- Respaldo ---------- */

export async function exportAll() {
  const [categories, songs] = await Promise.all([listCategories(), listSongs()]);
  return {
    app: 'cancionero',
    version: 1,
    exportedAt: new Date().toISOString(),
    categories: categories.map(({ id, name, order }) => ({ id, name, order })),
    songs: songs.map(({ title, lyrics, categoryId, createdAt, updatedAt }) => ({
      title,
      lyrics,
      categoryId,
      createdAt,
      updatedAt,
    })),
  };
}

/** Mezcla un respaldo con lo que ya hay: nunca borra ni duplica letras idénticas. */
export async function importAll(data) {
  if (!data || data.app !== 'cancionero' || !Array.isArray(data.songs)) {
    throw new Error('El archivo no es un respaldo del Cancionero.');
  }
  const idMap = new Map();
  for (const cat of Array.isArray(data.categories) ? data.categories : []) {
    if (typeof cat?.name !== 'string') continue;
    const created = await addCategory(cat.name);
    idMap.set(cat.id, created.id);
  }
  const existing = await listSongs();
  const seen = new Set(existing.map((s) => `${s.titleKey}|${norm(s.lyrics)}`));
  let added = 0;
  let skipped = 0;
  for (const s of data.songs) {
    if (typeof s?.title !== 'string' || typeof s?.lyrics !== 'string') {
      skipped += 1;
      continue;
    }
    const signature = `${norm(s.title)}|${norm(s.lyrics)}`;
    if (seen.has(signature)) {
      skipped += 1;
      continue;
    }
    seen.add(signature);
    const id = await saveSong({
      title: s.title.slice(0, 200),
      lyrics: s.lyrics.slice(0, 50000),
      categoryId: idMap.get(s.categoryId) ?? null,
    });
    if (Number.isFinite(s.createdAt)) await db.songs.update(id, { createdAt: s.createdAt });
    added += 1;
  }
  return { added, skipped };
}
