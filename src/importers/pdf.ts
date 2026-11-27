// Mozilla's compatibility build pairs the same PDF engine with WebKit polyfills.
import { getDocument, GlobalWorkerOptions, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { Chapter, ImportedBook } from '../model';
import {
  preparePage,
  reflowPage,
  runningMargins,
  type Illustration,
  type PageLines,
  type TextRun,
} from './pdf-layout';
import { encloses, framedDiagrams, lineIn, type Rect } from './pdf-figures';
import { escapeHtml } from './markup';

GlobalWorkerOptions.workerSrc = workerUrl;

export async function openPdf(source: Blob | Uint8Array): Promise<PDFDocumentProxy> {
  // PDF.js transfers the input buffer to its worker; keep the caller's source intact.
  const data =
    source instanceof Uint8Array ? source.slice() : new Uint8Array(await source.arrayBuffer());
  const assets = new URL('pdf-assets/', document.baseURI).href;
  const task = getDocument({
    data,
    cMapUrl: assets + 'cmaps/',
    cMapPacked: true,
    iccUrl: assets + 'iccs/',
    standardFontDataUrl: assets + 'standard_fonts/',
    wasmUrl: assets + 'wasm/',
    maxImageSize: 50_000_000,
  });
  try {
    return await task.promise;
  } catch (error) {
    await task.destroy();
    if (error instanceof Error && error.name === 'PasswordException')
      throw new Error('This PDF requires a password. Import an unlocked copy.');
    throw error;
  }
}

async function outlinePages(doc: PDFDocumentProxy) {
  const mapping = new Map<number, { title: string; depth: number }>();
  type Outline = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>;
  async function visit(entries: Outline, depth: number) {
    for (const entry of entries || []) {
      // Some publishers leave unresolved destinations alongside valid bookmarks.
      try {
        const dest =
          typeof entry.dest === 'string' ? await doc.getDestination(entry.dest) : entry.dest;
        if (dest?.length) {
          const index = typeof dest[0] === 'number' ? dest[0] : await doc.getPageIndex(dest[0]);
          if (!mapping.has(index + 1)) mapping.set(index + 1, { title: entry.title, depth });
        }
      } catch {
        /* Keep the rest of the outline. */
      }
      if (entry.items?.length) await visit(entry.items, depth + 1);
    }
  }
  await visit(await doc.getOutline(), 0);
  return mapping;
}

const imageOps = new Set([
  OPS.paintImageXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintInlineImageXObject,
  OPS.paintImageMaskXObject,
  OPS.paintImageMaskXObjectGroup,
  OPS.paintInlineImageXObjectGroup,
]);

function scaledCanvas(source: HTMLCanvasElement, width: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round((source.height * canvas.width) / source.width));
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.84);
}

function figure(url: string, label: string) {
  return '<figure><img src="' + url + '" alt="' + escapeHtml(label) + '"></figure>';
}

function cropFigure(
  source: HTMLCanvasElement,
  rect: Rect,
  type: 'image/png' | 'image/jpeg',
): string {
  const crop = document.createElement('canvas');
  crop.width = Math.max(1, Math.ceil((rect.right - rect.left) * source.width));
  crop.height = Math.max(1, Math.ceil((rect.bottom - rect.top) * source.height));
  crop
    .getContext('2d')!
    .drawImage(
      source,
      rect.left * source.width,
      rect.top * source.height,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
  return crop.toDataURL(type, 0.88);
}

async function illustrations(page: PDFPageProxy, text: PageLines, firstPage: boolean) {
  const images: Illustration[] = [];
  let diagrams: Rect[] = [];
  const hasText = text.lines.length > 0;
  const base = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  const hasImages = ops.fnArray.some((op) => imageOps.has(op));
  const paths: number[] = [];
  ops.fnArray.forEach((op, index) => {
    if (op === OPS.constructPath) paths.push(index);
  });
  // Intricate unframed artwork can contain thousands of paths. Bound the geometry
  // pass on potential figures; the original view always retains the full drawing.
  const inspectPaths = hasText && paths.length >= 4 && paths.length <= 2000;
  if (hasText && !hasImages && !inspectPaths && !firstPage) return { images, diagrams };
  // Bound both dimensions for very large architectural sheets and unusually tall pages.
  const viewport = page.getViewport({
    scale: Math.min(1300 / base.width, 1850 / base.height, 2.5),
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  try {
    await page.render({
      canvas,
      viewport,
      recordImages: hasImages && hasText,
      recordOperations: inspectPaths,
    }).promise;
    const cover = firstPage ? scaledCanvas(canvas, Math.min(260, canvas.width)) : undefined;
    if (!hasText) {
      images.push({
        y: 0,
        html: figure(canvas.toDataURL('image/jpeg', 0.86), 'Original page ' + page.pageNumber),
      });
    } else {
      if (inspectPaths && page.recordedBBoxes) {
        diagrams = framedDiagrams(page.recordedBBoxes, paths, text.lines, base.width, base.height);
        for (const rect of diagrams) {
          const labels = text.lines
            .filter((line) => lineIn(rect, line, base.width, base.height))
            .map((line) => line.text.trim());
          const alt =
            'Diagram on page ' + page.pageNumber + (labels.length ? ' — ' + labels.join(', ') : '');
          images.push({
            y: rect.top * base.height,
            html: figure(cropFigure(canvas, rect, 'image/png'), alt),
          });
        }
      }
      // PDF.js reports three normalized corners per painted image. Cropping the composed
      // page preserves image masks, the color profile and transformations performed by PDF.js.
      const coords: ArrayLike<number> = page.imageCoordinates || [];
      for (let i = 0; i + 5 < coords.length; i += 6) {
        const [ax, ay, bx, by, cx, cy] = Array.from({ length: 6 }, (_, j) => coords[i + j]);
        const left = Math.max(0, Math.min(ax, bx, cx, bx + cx - ax));
        const top = Math.max(0, Math.min(ay, by, cy, by + cy - ay));
        const right = Math.min(1, Math.max(ax, bx, cx, bx + cx - ax));
        const bottom = Math.min(1, Math.max(ay, by, cy, by + cy - ay));
        const w = Math.round((right - left) * canvas.width);
        const h = Math.round((bottom - top) * canvas.height);
        if (w < 24 || h < 24 || (right - left) * (bottom - top) > 0.87) continue;
        const rect = { left, top, right, bottom };
        if (diagrams.some((frame) => encloses(frame, rect))) continue;
        images.push({
          y: top * base.height,
          html: figure(
            cropFigure(canvas, rect, 'image/jpeg'),
            'Illustration on page ' + page.pageNumber,
          ),
        });
      }
    }
    return { images, cover, diagrams };
  } finally {
    canvas.width = canvas.height = 1;
  }
}

export async function readPdf(file: File, fallback: string): Promise<ImportedBook> {
  const doc = await openPdf(file);
  try {
    const [metadata, outline] = await Promise.all([doc.getMetadata(), outlinePages(doc)]);
    const info = metadata.info as { Title?: string; Author?: string };
    const pages: { text: PageLines; images: Illustration[]; height: number }[] = [];
    let cover: string | undefined;
    let convertedLength = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const runs: TextRun[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const [x, y] = view.convertToViewportPoint(item.transform[4], item.transform[5]);
        runs.push({
          text: item.str,
          x,
          y,
          width: item.width,
          height: item.height || 12,
          end: item.hasEOL,
          rtl: item.dir === 'rtl',
        });
      }
      const isCover = n === 1 && /^cover$/i.test(outline.get(n)?.title.trim() || '');
      const text = preparePage(isCover ? [] : runs);
      const art = await illustrations(page, text, n === 1);
      if (art.diagrams.length) {
        text.lines = text.lines.filter(
          (line) => !art.diagrams.some((rect) => lineIn(rect, line, view.width, view.height)),
        );
      }
      cover ||= art.cover;
      pages.push({ text, images: art.images, height: view.height });
      convertedLength +=
        art.images.reduce((size, image) => size + image.html.length, 0) +
        text.lines.reduce((size, line) => size + line.text.length, 0);
      if (convertedLength > 256 * 1024 * 1024)
        throw new Error('The reflowed PDF exceeds 256 MiB. Try importing a smaller volume.');
      page.cleanup();
    }
    const margins = runningMargins(pages);
    const chapters: Chapter[] = pages.map(({ text, images, height }, index) => {
      const n = index + 1;
      const flow = reflowPage(text, images, height, margins);
      const section = outline.get(n);
      return {
        sourcePage: n,
        title: section?.title || flow.heading || 'Page ' + n,
        depth: section?.depth,
        html: '<section data-source-page="' + n + '">' + flow.html + '</section>',
      };
    });
    return {
      title: info.Title?.trim() || fallback,
      author: info.Author?.trim() || '',
      chapters,
      cover,
      format: 'PDF',
      pageCount: doc.numPages,
    };
  } finally {
    await doc.loadingTask.destroy();
  }
}
