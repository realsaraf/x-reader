import { unzlibSync } from 'fflate';
import { MOBI } from 'foliate-js/mobi.js';
import type { ImportedBook, Chapter } from '../model';
import { cleanMarkup, fragment } from './markup';
import { decodeText, rasterUrl } from './resources';

function validateHeader(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 86 || decodeText(bytes.subarray(60, 68)) !== 'BOOKMOBI')
    throw new Error('This file is not a supported MOBI or KF8 book.');
  const record = view.getUint32(78);
  if (record > bytes.length - 40) throw new Error('The Kindle book has a damaged header.');
  if (view.getUint16(record + 12))
    throw new Error('This Kindle book is encrypted. Import a DRM-free copy.');
  if (view.getUint32(record + 4) > 128 * 1024 * 1024)
    throw new Error('This Kindle book exceeds the supported text size.');
}

async function localBlob(url: string): Promise<Blob> {
  if (!url.startsWith('blob:')) throw new Error('Expected an embedded Kindle resource.');
  return (await fetch(url)).blob();
}

export async function readKindle(
  file: File,
  bytes: Uint8Array,
  fallback: string,
  extension: string,
): Promise<ImportedBook> {
  validateHeader(bytes);
  const book = await new MOBI({ unzlib: unzlibSync }).open(file);
  try {
    const toc = new Map<number, { title: string; depth: number }>();
    function visit(entries: NonNullable<typeof book.toc>, depth: number) {
      for (const entry of entries) {
        const [index] = book.splitTOCHref(entry.href);
        if (entry.label && !toc.has(index)) toc.set(index, { title: entry.label.trim(), depth });
        if (entry.subitems) visit(entry.subitems, depth + 1);
      }
    }
    visit(book.toc || [], 0);
    const images = new Map<string, string>();
    const chapters: Chapter[] = [];
    for (const [index, section] of book.sections.entries()) {
      if (!section.load) continue;
      const root = fragment(await (await localBlob(await section.load())).text());
      for (const el of root.querySelectorAll('img[src],image')) {
        const url =
          el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('xlink:href') || '';
        if (!url.startsWith('blob:') || images.has(url)) continue;
        const blob = await localBlob(url);
        const image = rasterUrl(new Uint8Array(await blob.arrayBuffer()));
        if (image) images.set(url, image);
      }
      const html = cleanMarkup(root, (url) => images.get(url));
      if (!html) continue;
      const sectionInfo = toc.get(index);
      chapters.push({
        html,
        title:
          sectionInfo?.title ||
          root.querySelector('h1,h2,h3')?.textContent?.trim() ||
          'Section ' + (chapters.length + 1),
        depth: sectionInfo?.depth || 0,
      });
    }
    const cover = await book.getCover();
    return {
      format: extension.toUpperCase(),
      title: book.metadata.title || fallback,
      author: book.metadata.author?.join(', ') || '',
      cover: cover && rasterUrl(new Uint8Array(await cover.arrayBuffer())),
      chapters,
    };
  } finally {
    book.destroy();
  }
}
