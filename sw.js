// Service worker del Cancionero. Subir la versión aquí, en version.json y en index.html en cada cambio.
const VERSION = '1.1.0';
const CACHE = `cancionero-v${VERSION}`;

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'version.json',
  'css/styles.css',
  'js/app.js',
  'js/crop.js',
  'js/mass.js',
  'js/shared-mass.js',
  'js/dates.js',
  'js/ocr-layout.js',
  'js/db.js',
  'js/icons.js',
  'js/ocr.js',
  'js/pwa.js',
  'js/ui.js',
  'js/util.js',
  'fonts/inter-latin-wght-normal.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'libs/dexie.min.js',
  'libs/tesseract.min.js',
  'libs/worker.min.js',
  'libs/tesseract-core-simd-lstm.wasm.js',
  'libs/lang/spa.traineddata.gz',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cancionero-v') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Páginas y código de la app: primero la red (siempre lo último), con respaldo sin conexión.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request.url, { cache: 'no-store', credentials: 'same-origin' });
    // Las consultas con parámetros (p. ej. version.json?t=…) no se guardan para no llenar la caché.
    if (fresh.ok && !new URL(request.url).search) {
      cache.put(request.mode === 'navigate' ? 'index.html' : request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ||
      (request.mode === 'navigate' ? await cache.match('index.html') : undefined);
    return cached || Response.error();
  }
}

// Librerías, fuentes e iconos: primero la caché.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  const path = url.pathname;
  const isAppCode =
    request.mode === 'navigate' ||
    path.endsWith('/') ||
    path.endsWith('.html') ||
    path.endsWith('version.json') ||
    path.endsWith('manifest.webmanifest') ||
    path.endsWith('sw.js') ||
    path.endsWith('.css') ||
    (path.endsWith('.js') && !path.includes('/libs/'));

  event.respondWith(isAppCode ? networkFirst(request) : cacheFirst(request));
});
