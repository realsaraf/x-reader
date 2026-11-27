import type { ImportedBook, Chapter } from '../model';
import { escapeHtml, fragment, headingBreaks, splitAt } from './markup';
import { BookArchive, embeddedRaster, elements, parseXml, relativePath, value } from './resources';

const docNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export function readDocx(archive: BookArchive, fallback: string): ImportedBook {
  const xml = parseXml(archive.text('word/document.xml'), 'Word document');
  const rels = new Map<string, string>();
  if (archive.paths().includes('word/_rels/document.xml.rels')) {
    const doc = parseXml(archive.text('word/_rels/document.xml.rels'), 'Word relationships');
    for (const rel of elements(doc, 'Relationship')) {
      const path = relativePath('word/document.xml', rel.getAttribute('Target') || '');
      if (path && rel.getAttribute('TargetMode') !== 'External')
        rels.set(rel.getAttribute('Id') || '', path);
    }
  }
  function render(node: Element): string {
    const type = node.localName;
    const children = () => Array.from(node.children, render).join('');
    if (type === 't') return escapeHtml(node.textContent || '');
    if (type === 'br') return '<br>';
    if (type === 'tab') return ' ';
    if (type === 'del' || type.endsWith('Pr')) return '';
    if (type === 'blip') {
      const id =
        node.getAttribute('r:embed') ||
        Array.from(node.attributes).find((a) => a.localName === 'embed')?.value;
      const image = id && archive.image(rels.get(id));
      return image ? '<img alt="" src="' + image + '">' : '';
    }
    if (type === 'r') {
      const rPr = Array.from(node.children).find((el) => el.localName === 'rPr');
      let text = children();
      for (const [property, tag] of [
        ['b', 'strong'],
        ['i', 'em'],
        ['u', 'u'],
      ]) {
        const prop = rPr && elements(rPr, property)[0];
        if (
          prop &&
          !['0', 'false', 'off', 'none'].includes(prop.getAttributeNS(docNs, 'val') || '')
        )
          text = '<' + tag + '>' + text + '</' + tag + '>';
      }
      return text;
    }
    if (type === 'p') {
      const style = elements(node, 'pStyle')[0]?.getAttributeNS(docNs, 'val') || '';
      const level = /^Heading\s*([1-6])$/i.exec(style)?.[1];
      const tag = level ? 'h' + level : 'p';
      return '<' + tag + '>' + children() + '</' + tag + '>';
    }
    const tag = ({ tbl: 'table', tr: 'tr', tc: 'td' } as Record<string, string>)[type];
    return tag ? '<' + tag + '>' + children() + '</' + tag + '>' : children();
  }
  const root = fragment(render(xml.documentElement));
  const metadata = archive.paths().includes('docProps/core.xml')
    ? parseXml(archive.text('docProps/core.xml'), 'Word metadata')
    : undefined;
  const title = (metadata && value(metadata, 'title')) || fallback;
  return {
    title,
    author: (metadata && value(metadata, 'creator')) || '',
    format: 'DOCX',
    cover: archive.image(
      archive.paths().find((path) => /^docProps\/thumbnail\.(png|jpe?g)$/i.test(path)),
    ),
    chapters: splitAt(root, headingBreaks(root), title),
  };
}

export function readFb2(text: string, fallback: string): ImportedBook {
  const xml = parseXml(text, 'FictionBook');
  const info = elements(xml, 'title-info')[0];
  const title = (info && value(info, 'book-title')) || fallback;
  const images = new Map<string, string>();
  for (const binary of elements(xml, 'binary')) {
    const type = binary.getAttribute('content-type') || '';
    const url = embeddedRaster('data:' + type + ';base64,' + binary.textContent);
    const id = binary.getAttribute('id');
    if (id && url) images.set(id, url);
  }
  const imageOf = (el: Element) =>
    images.get(
      (
        el.getAttribute('l:href') ||
        el.getAttribute('xlink:href') ||
        el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
        el.getAttribute('href') ||
        ''
      ).replace(/^#/, ''),
    );
  const mapping: Record<string, string> = {
    p: 'p',
    subtitle: 'h3',
    strong: 'strong',
    emphasis: 'em',
    strikethrough: 's',
    sub: 'sub',
    sup: 'sup',
    code: 'code',
    poem: 'blockquote',
    cite: 'blockquote',
    v: 'p',
    tr: 'tr',
    td: 'td',
    th: 'th',
    table: 'table',
  };
  function render(node: Node): string {
    if (node.nodeType === 3) return escapeHtml(node.textContent || '');
    if (node.nodeType !== 1) return '';
    const el = node as Element;
    if (el.localName === 'image') {
      const img = imageOf(el);
      return img ? '<img alt="" src="' + img + '">' : '';
    }
    if (el.localName === 'empty-line') return '<br>';
    if (el.localName === 'title')
      return '<h2>' + escapeHtml(el.textContent?.trim() || '') + '</h2>';
    const body = Array.from(el.childNodes, render).join('');
    const tag = mapping[el.localName];
    return tag ? '<' + tag + '>' + body + '</' + tag + '>' : body;
  }
  const chapters: Chapter[] = [];
  function visit(section: Element, inherited: string, depth: number) {
    const nodes = Array.from(section.children);
    const name = nodes.find((n) => n.localName === 'title')?.textContent?.trim() || inherited;
    let html = '';
    function flush() {
      if (html.trim()) chapters.push({ title: name, depth, html });
      html = '';
    }
    for (const el of nodes) {
      if (el.localName === 'section') {
        flush();
        visit(el, name, depth + (section.localName === 'body' ? 0 : 1));
      } else html += render(el);
    }
    flush();
  }
  for (const body of elements(xml, 'body')) visit(body, title, 0);
  const author = info
    ? elements(info, 'author')
        .map(
          (person) =>
            ['first-name', 'middle-name', 'last-name']
              .map((k) => value(person, k))
              .filter(Boolean)
              .join(' ') || value(person, 'nickname'),
        )
        .filter(Boolean)
        .join(', ')
    : '';
  const cover = info && elements(info, 'coverpage')[0];
  const coverImage = cover && elements(cover, 'image')[0];
  return { title, author, cover: coverImage && imageOf(coverImage), format: 'FB2', chapters };
}

export function readComic(archive: BookArchive, fallback: string): ImportedBook {
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const paths = archive
    .paths()
    .filter((p) => /\.(?:jpe?g|png|webp|gif)$/i.test(p))
    .sort(collator.compare);
  const metadata = archive.paths().find((p) => /(^|\/)ComicInfo\.xml$/i.test(p));
  const info = metadata ? parseXml(archive.text(metadata), 'ComicInfo') : undefined;
  const chapters: Chapter[] = [];
  let cover: string | undefined;
  for (const path of paths) {
    const image = archive.image(path);
    if (!image) continue;
    cover ||= image;
    const label = 'Page ' + (chapters.length + 1);
    chapters.push({
      title: label,
      html: '<figure><img src="' + image + '" alt="' + label + '"></figure>',
    });
  }
  return {
    title: (info && value(info, 'Title')) || fallback,
    author: (info && value(info, 'Writer')) || '',
    format: 'CBZ',
    cover,
    chapters,
  };
}
