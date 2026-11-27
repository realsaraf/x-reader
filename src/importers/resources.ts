import { unzipSync } from 'fflate';

export const MAX_FILE_BYTES = 128 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 256 * 1024 * 1024;
const MAX_ENTRY_COUNT = 25000;

export function decodeText(bytes: Uint8Array): string {
  // FB2 and older EPUB/XML documents may declare a legacy character encoding.
  const prefix = new TextDecoder('latin1').decode(bytes.subarray(0, 512));
  const declared = /<\?xml[^>]*encoding\s*=\s*["']([^"']+)/i.exec(prefix)?.[1];
  if (bytes[0] === 255 && bytes[1] === 254) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 254 && bytes[1] === 255) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder(declared || 'utf-8').decode(bytes);
}

export function parseXml(input: string, label: string): Document {
  if (/<!ENTITY\s/i.test(input))
    throw new Error(label + ' contains unsupported XML entity declarations.');
  const doc = new DOMParser().parseFromString(input, 'application/xml');
  if (doc.getElementsByTagNameNS('*', 'parsererror').length)
    throw new Error(label + ' contains invalid XML.');
  return doc;
}

export function elements(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', name));
}

export function value(root: Document | Element, name: string): string {
  return elements(root, name)[0]?.textContent?.trim() || '';
}

/** Resolve an archive-relative URI without giving it access to the filesystem or network. */
export function relativePath(base: string, href: string): string | undefined {
  let raw: string;
  try {
    raw = decodeURIComponent(href.split(/[?#]/, 1)[0] || '');
  } catch {
    return;
  }
  if (!raw) return base || undefined;
  if (/^[\/\\]|^[a-z][a-z\d+.-]*:|[\u0000\\]/i.test(raw)) return;
  const parts = base.split('/').slice(0, -1);
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue;
    if (part !== '..') parts.push(part);
    else if (parts.length) parts.pop();
    else return;
  }
  return parts.join('/');
}

export class BookArchive {
  private files: Record<string, Uint8Array>;
  private images = new Map<string, string>();

  constructor(bytes: Uint8Array) {
    let total = 0;
    let count = 0;
    this.files = unzipSync(bytes, {
      filter(entry) {
        if (++count > MAX_ENTRY_COUNT || (total += entry.originalSize) > MAX_UNPACKED_BYTES)
          throw new Error(
            'This archive exceeds the supported unpacked size (256 MiB or 25,000 entries).',
          );
        return !entry.name.endsWith('/') && !entry.name.startsWith('__MACOSX/');
      },
    });
  }

  paths(): string[] {
    return Object.keys(this.files);
  }

  text(path: string): string {
    if (!Object.hasOwn(this.files, path)) throw new Error('Book resource is missing: ' + path);
    return decodeText(this.files[path]);
  }

  image(path?: string): string | undefined {
    if (!path || !Object.hasOwn(this.files, path)) return;
    const cached = this.images.get(path);
    if (cached) return cached;
    const image = rasterUrl(this.files[path]);
    if (image) this.images.set(path, image);
    return image;
  }
}

export function rasterUrl(bytes: Uint8Array): string | undefined {
  const mime = rasterMime(bytes);
  if (!mime) return;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 16384)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
  return 'data:' + mime + ';base64,' + btoa(chunks.join(''));
}

function rasterMime(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70) return 'image/gif';
  if (
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  )
    return 'image/webp';
}

export function embeddedRaster(src: string): string | undefined {
  const match = /^data:image\/(?:png|jpe?g|gif|webp);base64,([a-z\d+/=\s]+)$/i.exec(src);
  if (!match) return;
  const base64 = match[1].replace(/\s+/g, '');
  try {
    const prefix = Uint8Array.from(atob(base64.slice(0, 24)), (ch) => ch.charCodeAt(0));
    const type = rasterMime(prefix);
    if (type) return 'data:' + type + ';base64,' + base64;
  } catch {
    /* Malformed inline images can be omitted without losing the book. */
  }
}
