import type { Chapter } from '../model';
import { embeddedRaster } from './resources';

const tags = new Set(
  'p div section article blockquote pre code kbd samp h1 h2 h3 h4 h5 h6 ul ol li dl dt dd b strong i em u s sub sup small br hr figure figcaption table caption thead tbody tfoot tr th td ruby rt rp span bdi bdo'.split(
    ' ',
  ),
);
const omit = new Set(
  'script style iframe frame object embed link meta base noscript template head title form video audio canvas'.split(
    ' ',
  ),
);
type ImageResolver = (src: string) => string | undefined;

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  );
}

/** Parsing inside template content keeps source markup inert, including resource URLs. */
export function fragment(markup: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template.content;
}

export function cleanMarkup(root: Node, resolveImage?: ImageResolver): string {
  function render(node: Node): string {
    if (node.nodeType === 3 || node.nodeType === 4) return escapeHtml(node.textContent || '');
    if (node.nodeType !== 1) return '';
    const el = node as Element;
    const tag = el.localName.toLowerCase();
    if (omit.has(tag) || el.hasAttribute('hidden')) return '';
    if (tag === 'img' || tag === 'image') {
      const src =
        el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('xlink:href') || '';
      const url = resolveImage?.(src) || embeddedRaster(src);
      const alt = escapeHtml(el.getAttribute('alt') || el.getAttribute('aria-label') || '');
      return url ? '<img src="' + escapeHtml(url) + '" alt="' + alt + '">' : alt;
    }
    const children = Array.from(el.childNodes, render).join('');
    if (!tags.has(tag)) return children;
    if (tag === 'br' || tag === 'hr') return '<' + tag + '>';
    let attrs = '';
    const dir = el.getAttribute('dir');
    if (dir && /^(rtl|ltr|auto)$/.test(dir)) attrs += ' dir="' + dir + '"';
    for (const attr of ['colspan', 'rowspan', 'start']) {
      const number = el.getAttribute(attr);
      if (number && /^\d{1,3}$/.test(number)) attrs += ' ' + attr + '="' + number + '"';
    }
    return '<' + tag + attrs + '>' + children + '</' + tag + '>';
  }
  return Array.from(root.childNodes, render).join('').trim();
}

export function splitAt(
  root: Node,
  breaks: { at: Element; title: string; depth?: number }[],
  fallback: string,
  image?: ImageResolver,
): Chapter[] {
  const chapters: Chapter[] = [];
  let start: Element | undefined;
  let title = fallback;
  let depth = 0;
  function append(end?: Element) {
    const range = document.createRange();
    range.selectNodeContents(root);
    if (start) range.setStartBefore(start);
    if (end) range.setEndBefore(end);
    const html = cleanMarkup(range.cloneContents(), image);
    if (html.replace(/<[^>]+>/g, '').trim() || /<img\b/.test(html))
      chapters.push({ title, depth, html });
  }
  for (const boundary of breaks) {
    append(boundary.at);
    start = boundary.at;
    title = boundary.title;
    depth = boundary.depth || 0;
  }
  append();
  return chapters;
}

export function headingBreaks(root: ParentNode) {
  return Array.from(root.querySelectorAll('h1,h2')).map((at) => ({
    at,
    title: at.textContent?.trim() || 'Section',
    depth: at.localName === 'h2' ? 1 : 0,
  }));
}
