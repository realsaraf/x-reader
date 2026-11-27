import { escapeHtml } from './markup';

export interface TextRun {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  end: boolean;
  rtl?: boolean;
}

interface Line extends TextRun {
  right: number;
}
export interface Illustration {
  y: number;
  html: string;
}
export interface PageLines {
  lines: Line[];
  bodySize: number;
}

export function preparePage(runs: TextRun[]): PageLines {
  const lines: Line[] = [];
  let current: Line | undefined;
  for (const raw of runs) {
    // In tracked capitals PDF.js sometimes inserts a space between every glyph
    // within a word. It still emits inter-word whitespace as its own text item.
    const run = /^(?:[A-Z0-9–-] ){1,}[A-Z0-9–-]$/.test(raw.text)
      ? { ...raw, text: raw.text.replaceAll(' ', '') }
      : raw;
    if (current && !current.end && Math.abs(current.y - run.y) < Math.max(2, run.height * 0.45)) {
      const space = !current.rtl && run.x - current.right > run.height * 0.15 ? ' ' : '';
      current.text += space + run.text;
      current.right = run.x + run.width;
      if (run.text.trim()) current.height = Math.max(current.height, run.height);
      current.end = run.end;
    } else {
      current = { ...run, right: run.x + run.width };
      lines.push(current);
    }
  }
  const nonempty = lines.filter((line) => line.text.trim());
  const sizes = nonempty
    .map((l) => l.height)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  return { lines: nonempty, bodySize: sizes[Math.floor(sizes.length / 2)] || 12 };
}

/** Margin text must repeat on three distinct sheets before it can be dropped.
 * Location is part of the signature so an identical phrase in prose survives. */
function marginKey(line: Line, bodySize: number, height: number): string | undefined {
  if (!height || line.height > bodySize * 1.06) return;
  const y = line.y / height;
  const atTop = y <= 0.12 || (y < 0.2 && line.height < bodySize * 0.8);
  if (!atTop && y < 0.88) return;
  const content = line.text
    .toLowerCase()
    .replace(/\p{N}+/gu, '#')
    .replace(/\s+/g, '');
  if (content.length > 160) return;
  return (atTop ? 'top:' : 'bottom:') + content;
}

export function runningMargins(pages: { text: PageLines; height: number }[]): Set<string> {
  const counts = new Map<string, number>();
  for (const { text, height } of pages) {
    const seen = new Set(text.lines.map((line) => marginKey(line, text.bodySize, height)));
    for (const key of seen) if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count >= 3).map(([key]) => key));
}

function appendLine(text: string, next: string) {
  if (!text) return next;
  if (/[\p{Ll}][-\u00ad]$/u.test(text) && /^\p{Ll}/u.test(next)) return text.slice(0, -1) + next;
  if (/[\u3000-\u9fff]$/u.test(text) && /^[\u3000-\u9fff]/u.test(next)) return text + next;
  return text + ' ' + next;
}

/** PDF content-stream order is preserved, even when a new column starts higher on the sheet. */
export function reflowPage(
  page: PageLines,
  illustrations: Illustration[],
  height = 0,
  margins = new Set<string>(),
): { html: string; heading?: string } {
  const { lines, bodySize } = page;
  const images = [...illustrations].sort((a, b) => a.y - b.y);
  const blocks: string[] = [];
  let paragraph = '';
  let previous: Line | undefined;
  let heading: string | undefined;
  let rtl = false;
  function flush() {
    if (paragraph) blocks.push((rtl ? '<p dir="rtl">' : '<p>') + escapeHtml(paragraph) + '</p>');
    paragraph = '';
  }
  for (const line of lines) {
    if (margins.has(marginKey(line, bodySize, height) || '')) continue;
    while (images.length && images[0].y < line.y - line.height) {
      flush();
      blocks.push(images.shift()!.html);
    }
    const text = line.text.replace(/\s+/g, ' ').trim();
    const isHeading = line.height >= bodySize * 1.2 && text.length <= 150;
    const bullet = /^[•●▪◦‣]\s*/.test(text);
    if (isHeading) {
      flush();
      heading ||= text;
      blocks.push('<h2>' + escapeHtml(text) + '</h2>');
    } else {
      if (
        bullet ||
        (previous &&
          (line.y - previous.y > bodySize * 1.65 ||
            line.y < previous.y - bodySize ||
            (/[.!?。！？]["”’)]?$/.test(previous.text.trim()) &&
              line.x > previous.x + bodySize * 0.65)))
      )
        flush();
      if (!paragraph) rtl = !!line.rtl;
      paragraph = appendLine(paragraph, text);
    }
    previous = line;
  }
  flush();
  return { html: blocks.join('') + images.map((i) => i.html).join(''), heading };
}
