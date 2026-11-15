// Convierte un PDF en una imagen por página (y su miniatura) para presentarlo como si fuera un PowerPoint.
// Todo ocurre en el navegador con pdf.js, que solo se descarga cuando se abre un PDF.
import { pdfKey } from '../shared/model.js';

export const MAX_PAGES = 500;
const BOX_W = 1920, BOX_H = 1080;   // cada página se ajusta a este cuadro (se ve nítida en un proyector Full HD)
const THUMB_W = 320;

const toBlob = (canvas, quality) => new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), 'image/jpeg', quality));

/** Identificador aleatorio de 16 caracteres (sirve también en conexiones sin HTTPS, donde randomUUID no existe). */
export function newPdfId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {File} file
 * @param {{ savePdfPage(id: string, key: string, blob: Blob): Promise<void> }} store
 * @param {string} id
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<{ pages: number }>}
 */
export async function renderPdf(file, store, id, onProgress) {
  const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  let doc;
  try { doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), verbosity: 0 }).promise; }
  catch (e) { throw new Error(e?.name === 'PasswordException' ? 'Este PDF tiene contraseña. Quítasela y vuelve a abrirlo.' : 'No se pudo leer ese archivo: no parece un PDF válido.'); }
  try {
    if (doc.numPages > MAX_PAGES) throw new Error(`Este PDF tiene ${doc.numPages} páginas; el máximo es ${MAX_PAGES}. Divídelo en partes y ábrelas por separado.`);
    const canvas = document.createElement('canvas'), thumb = document.createElement('canvas');
    for (let n = 1; n <= doc.numPages; n++) {
      onProgress?.(n - 1, doc.numPages);
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(4, Math.max(0.5, Math.min(BOX_W / base.width, BOX_H / base.height)));
      const viewport = page.getViewport({ scale });
      canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      await store.savePdfPage(id, pdfKey('p', n), await toBlob(canvas, 0.86));
      thumb.width = THUMB_W; thumb.height = Math.max(1, Math.round(THUMB_W * canvas.height / canvas.width));
      thumb.getContext('2d', { alpha: false }).drawImage(canvas, 0, 0, thumb.width, thumb.height);
      await store.savePdfPage(id, pdfKey('t', n), await toBlob(thumb, 0.7));
      page.cleanup();
      await new Promise(r => setTimeout(r)); // deja respirar a la interfaz (equipos modestos)
    }
    onProgress?.(doc.numPages, doc.numPages);
    return { pages: doc.numPages };
  } finally { doc.destroy(); }
}
