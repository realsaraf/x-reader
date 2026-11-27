import type { Chapter, ImportedBook } from '../model';
import { cleanMarkup, fragment, splitAt } from './markup';
import { BookArchive, elements, parseXml, relativePath, value } from './resources';

type Entry = { path: string; label: string; fragment?: string; depth: number };
type Resource = { path: string; mediaType: string; properties: string[] };

function tocEntry(base: string, href: string, label: string, depth: number): Entry | undefined {
  const path = relativePath(base, href);
  if (!path || !label) return;
  let fragment = href.split('#')[1];
  try {
    fragment = decodeURIComponent(fragment || '');
  } catch {
    return;
  }
  return { path, label: label.trim(), fragment, depth };
}

function navigation(
  archive: BookArchive,
  manifest: Map<string, Resource>,
  ncxId: string | null,
): Entry[] {
  const nav = [...manifest.values()].find((item) => item.properties.includes('nav'));
  const result: Entry[] = [];
  if (nav) {
    const xml = parseXml(archive.text(nav.path), 'EPUB navigation');
    const contents = elements(xml, 'nav').find((n) =>
      (n.getAttribute('epub:type') || n.getAttribute('type') || '').split(/\s+/).includes('toc'),
    );
    if (contents) {
      for (const a of elements(contents, 'a')) {
        let depth = -1;
        for (
          let parent = a.parentElement;
          parent && parent !== contents;
          parent = parent.parentElement
        )
          if (parent.localName === 'ol') depth++;
        const entry = tocEntry(
          nav.path,
          a.getAttribute('href') || '',
          a.textContent || '',
          Math.max(0, depth),
        );
        if (entry) result.push(entry);
      }
    }
  }
  if (result.length) return result;
  const ncx =
    manifest.get(ncxId || '') ||
    [...manifest.values()].find((item) => item.mediaType === 'application/x-dtbncx+xml');
  if (!ncx) return [];
  const xml = parseXml(archive.text(ncx.path), 'EPUB table of contents');
  for (const point of elements(xml, 'navPoint')) {
    const content = Array.from(point.children).find((el) => el.localName === 'content');
    const label =
      Array.from(point.children).find((el) => el.localName === 'navLabel')?.textContent || '';
    let depth = 0;
    for (let parent = point.parentElement; parent; parent = parent.parentElement)
      if (parent.localName === 'navPoint') depth++;
    const entry = tocEntry(ncx.path, content?.getAttribute('src') || '', label, depth);
    if (entry) result.push(entry);
  }
  return result;
}

export function readEpub(archive: BookArchive, fallback: string): ImportedBook {
  const container = parseXml(archive.text('META-INF/container.xml'), 'EPUB container');
  const packages = elements(container, 'rootfile');
  const descriptor =
    packages.find((el) => el.getAttribute('media-type') === 'application/oebps-package+xml') ||
    packages[0];
  const opfPath = descriptor?.getAttribute('full-path');
  if (!opfPath) throw new Error('The EPUB has no package document.');
  const pkg = parseXml(archive.text(opfPath), 'EPUB package');
  const manifest = new Map<string, Resource>();
  for (const el of elements(pkg, 'item')) {
    const id = el.getAttribute('id');
    const path = relativePath(opfPath, el.getAttribute('href') || '');
    if (id && path)
      manifest.set(id, {
        path,
        mediaType: el.getAttribute('media-type') || '',
        properties: (el.getAttribute('properties') || '').split(/\s+/),
      });
  }
  const spine = elements(pkg, 'spine')[0];
  if (!spine) throw new Error('The EPUB has no reading order.');
  const toc = navigation(archive, manifest, spine.getAttribute('toc'));
  const chapters: Chapter[] = [];
  const encrypted = new Set<string>();
  if (archive.paths().includes('META-INF/encryption.xml')) {
    const xml = parseXml(archive.text('META-INF/encryption.xml'), 'EPUB encryption metadata');
    for (const el of elements(xml, 'CipherReference'))
      encrypted.add(relativePath('', el.getAttribute('URI') || '') || '');
  }
  const coverId = elements(pkg, 'meta')
    .find((el) => el.getAttribute('name') === 'cover')
    ?.getAttribute('content');
  const coverItem =
    [...manifest.values()].find((item) => item.properties.includes('cover-image')) ||
    manifest.get(coverId || '');
  let cover = archive.image(coverItem?.path);
  for (const ref of elements(spine, 'itemref')) {
    const item = manifest.get(ref.getAttribute('idref') || '');
    if (!item) throw new Error('The EPUB refers to a missing chapter.');
    if (encrypted.has(item.path))
      throw new Error('This EPUB has encrypted chapters. Import a DRM-free copy.');
    if (item.mediaType.startsWith('image/') && !item.mediaType.includes('svg')) {
      const image = archive.image(item.path);
      if (image)
        chapters.push({
          title: 'Plate ' + (chapters.length + 1),
          html: '<img alt="" src="' + image + '">',
        });
      continue;
    }
    const source = archive.text(item.path);
    // XHTML publishers occasionally ship HTML tag soup. The inert HTML parser recovers it.
    const root = fragment(source);
    const entries = toc.filter((entry) => entry.path === item.path);
    const title =
      entries.find((e) => !e.fragment)?.label ||
      entries[0]?.label ||
      root.querySelector('h1,h2,title')?.textContent?.trim() ||
      'Section ' + (chapters.length + 1);
    const ids = new Map(Array.from(root.querySelectorAll('[id]'), (el) => [el.id, el]));
    const boundaries: { at: Element; title: string; depth: number }[] = [];
    for (const entry of entries) {
      const at = ids.get(entry.fragment || '');
      if (at && !boundaries.some((boundary) => boundary.at === at))
        boundaries.push({ at, title: entry.label, depth: entry.depth });
    }
    boundaries.sort((a, b) => (a.at.compareDocumentPosition(b.at) & 4 ? -1 : 1));
    const image = (href: string) => archive.image(relativePath(item.path, href));
    if (!cover && /cover/i.test(item.path)) {
      const img = root.querySelector('img,image');
      if (img)
        cover = image(
          img.getAttribute('src') ||
            img.getAttribute('href') ||
            img.getAttribute('xlink:href') ||
            '',
        );
    }
    if (boundaries.length) chapters.push(...splitAt(root, boundaries, title, image));
    else {
      const html = cleanMarkup(root, image);
      if (html) chapters.push({ title, html, depth: entries[0]?.depth || 0 });
    }
  }
  return {
    title: value(pkg, 'title') || fallback,
    author: elements(pkg, 'creator')
      .map((n) => n.textContent?.trim())
      .filter(Boolean)
      .join(', '),
    format: 'EPUB',
    cover,
    chapters,
  };
}
