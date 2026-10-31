// Lectura de letras desde una foto con Tesseract.js (todo local, sin enviar la imagen a ningún servidor).
import { loadScript } from './util.js';

const BASE = new URL('libs/', document.baseURI).href;
const MAX_SIDE = 2600; // lado máximo al que se reduce la foto
const MIN_SIDE = 1400; // fotos más pequeñas se amplían hasta aquí

let workerPromise = null;
let statusListener = null;

export function ocrSupported() {
  return typeof WebAssembly === 'object' && typeof Worker === 'function';
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      await loadScript('libs/tesseract.min.js');
      return window.Tesseract.createWorker('spa', 1, {
        workerPath: `${BASE}worker.min.js`,
        corePath: BASE,
        langPath: `${BASE}lang`,
        workerBlobURL: false,
        cacheMethod: 'none',
        logger: (m) => statusListener?.(m),
      });
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Detiene la lectura en curso y libera memoria. */
export async function cancelOcr() {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    /* ya estaba detenido */
  }
}

async function toBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* se usa el respaldo con <img> */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo abrir la imagen.'));
    };
    img.src = url;
  });
}

/** Escala la foto, la pasa a grises y estira el contraste para que el texto resalte. */
async function preprocess(file) {
  const bitmap = await toBitmap(file);
  const w0 = bitmap.width;
  const h0 = bitmap.height;
  const longest = Math.max(w0, h0);
  let scale = 1;
  if (longest > MAX_SIDE) scale = MAX_SIDE / longest;
  else if (longest < MIN_SIDE) scale = Math.min(2, MIN_SIDE / longest);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    histogram[gray | 0] += 1;
  }
  const total = canvas.width * canvas.height;
  let low = 0;
  let high = 255;
  for (let acc = 0; low < 255; low += 1) {
    acc += histogram[low];
    if (acc >= total * 0.01) break;
  }
  for (let acc = 0; high > 0; high -= 1) {
    acc += histogram[high];
    if (acc >= total * 0.01) break;
  }
  const range = high - low;
  for (let i = 0; i < data.length; i += 4) {
    let gray = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    if (range >= 30) gray = Math.max(0, Math.min(255, ((gray - low) * 255) / range));
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Arregla defectos típicos del OCR sin cambiar el contenido de la letra. */
function tidy(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').replace(/^[|\\]+\s+/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const abortError = () => Object.assign(new Error('Lectura cancelada'), { name: 'AbortError' });

/**
 * Lee el texto de una imagen.
 * @param {File|Blob} file
 * @param {{ onStatus?: Function, signal?: AbortSignal }} options
 * @returns {Promise<{ text: string, confidence: number }>}
 */
export async function readLyricsFromImage(file, { onStatus, signal } = {}) {
  const aborted = new Promise((_, reject) => {
    if (signal?.aborted) reject(abortError());
    signal?.addEventListener('abort', () => reject(abortError()), { once: true });
  });

  const work = (async () => {
    onStatus?.({ status: 'preparing image', progress: 0 });
    const canvas = await preprocess(file);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo preparar la imagen.'))), 'image/png'),
    );
    statusListener = onStatus;
    const worker = await getWorker();
    const { data } = await worker.recognize(blob);
    return { text: tidy(data.text), confidence: data.confidence ?? 0 };
  })();

  try {
    return await Promise.race([work, aborted]);
  } finally {
    statusListener = null;
    work.catch(() => {}); // evita errores sin capturar si se canceló
  }
}
