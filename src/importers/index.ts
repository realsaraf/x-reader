import type { Chapter, ImportedBook } from '../model';
import { BookArchive, decodeText, MAX_FILE_BYTES } from './resources';
import { escapeHtml, fragment, headingBreaks, splitAt } from './markup';
import { readEpub } from './epub';
import { readComic, readDocx, readFb2 } from './documents';
import { extensions } from './formats';
export { accept } from './formats';

function readText(text: string, fallback: string): ImportedBook {
  const chapters: Chapter[] = [];
  let title = fallback;
  let blocks: string[] = [];
  let size = 0;
  function flush() {
    if (blocks.length) chapters.push({ title, html: blocks.join('') });
    blocks = [];
    size = 0;
  }
  for (const paragraph of text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    const lines = paragraph.trim().split('\n');
    const first = lines[0]?.trim() || '';
    if (!first) continue;
    const chapter =
      first.length < 100 &&
      /^(?:chapter|part|book)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(
        first,
      );
    if (chapter || size > 20000) {
      flush();
      title = chapter ? first : fallback + ' · ' + (chapters.length + 1);
    }
    if (chapter) {
      blocks.push('<h2>' + escapeHtml(first) + '</h2>');
      lines.shift();
    }
    const prose = lines
      .map((s) => s.trim())
      .join(' ')
      .trim();
    if (prose) blocks.push('<p>' + escapeHtml(prose) + '</p>');
    size += paragraph.length;
  }
  flush();
  return { title: fallback, author: '', format: 'TXT', chapters };
}

async function decode(file: File, ext: string, fallback: string): Promise<ImportedBook> {
  if (ext === 'pdf') return (await import('./pdf')).readPdf(file, fallback);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (['mobi', 'azw', 'azw3'].includes(ext))
    return (await import('./kindle')).readKindle(file, bytes, fallback, ext);
  if (['epub', 'docx', 'cbz', 'fb2.zip'].includes(ext)) {
    const zip = new BookArchive(bytes);
    if (ext === 'epub') return readEpub(zip, fallback);
    if (ext === 'docx') return readDocx(zip, fallback);
    if (ext === 'cbz') return readComic(zip, fallback);
    const entry = zip.paths().find((path) => /\.fb2$/i.test(path));
    if (!entry) throw new Error('The archive contains no FB2 book.');
    return readFb2(zip.text(entry), fallback);
  }
  const text = decodeText(bytes);
  if (ext === 'fb2') return readFb2(text, fallback);
  if (ext === 'txt') return readText(text, fallback);
  const markdown = ext === 'md' || ext === 'markdown';
  const markup = markdown ? (await import('marked')).marked.parse(text, { async: false }) : text;
  const root = fragment(markup);
  const title = root.querySelector('title,h1')?.textContent?.trim() || fallback;
  const author = root.querySelector('meta[name="author" i]')?.getAttribute('content') || '';
  return {
    title,
    author,
    format: markdown ? 'MD' : 'HTML',
    chapters: splitAt(root, headingBreaks(root), title),
  };
}

export async function importBook(file: File): Promise<ImportedBook> {
  const name = file.name.toLowerCase();
  const ext = extensions.find((extension) => name.endsWith('.' + extension));
  if (!ext) throw new Error('Unsupported book format: ' + file.name);
  if (!file.size) throw new Error('The book file is empty.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Books must be 128 MiB or smaller.');
  const fallback =
    file.name
      .slice(0, -(ext.length + 1))
      .replace(/_/g, ' ')
      .trim() || 'Untitled book';
  const book = await decode(file, ext, fallback);
  if (!book.chapters.length)
    throw new Error('No readable chapters or supported images were found in this book.');
  return { ...book, author: book.author || 'Unknown author' };
}
