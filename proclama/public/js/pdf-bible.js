// Lee una Biblia en PDF dentro del navegador. pdf.js (carpeta vendor/) solo se descarga cuando hace falta.
import { linesFromItems, parseBiblePages, compareShape } from '../shared/bible-pdf.js';

/**
 * @param {File} file
 * @param {(done: number, total: number) => void} onProgress
 * @param {object|null} ref  Biblia de referencia para comprobar el número de versículos
 */
export async function bibleFromPdf(file, onProgress, ref) {
  const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), verbosity: 0 }).promise;
  const pages = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      pages.push(linesFromItems((await page.getTextContent()).items));
      page.cleanup();
      if (p % 10 === 0 || p === doc.numPages) { onProgress?.(p, doc.numPages); await new Promise(r => setTimeout(r)); } // deja respirar a la interfaz
    }
  } finally { doc.destroy(); }
  if (pages.every(l => !l.length)) throw new Error('Este PDF no tiene texto (parece escaneado como imagen). Hace falta un PDF con texto seleccionable.');
  const result = parseBiblePages(pages, ref);
  result.pages = pages.length;
  result.differs = ref ? compareShape(result.books, ref) : [];
  result.verses = result.books.reduce((n, b) => n + b.reduce((m, c) => m + (c?.length ?? 0), 0), 0);
  return result;
}
