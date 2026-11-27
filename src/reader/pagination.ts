import type { Annotation, Location } from './state';
import { clamp } from './state';

interface TextRun {
  node: Text;
  start: number;
  end: number;
}

interface Section {
  chapter: number;
  element: HTMLElement;
  runs: TextRun[];
  length: number;
}

function runsIn(root: HTMLElement): TextRun[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const runs: TextRun[] = [];
  let length = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.textContent?.length) continue;
    const end = length + node.textContent.length;
    runs.push({ node: node as Text, start: length, end });
    length = end;
  }
  return runs;
}

export function indexSections(article: HTMLElement): Section[] {
  return Array.from(article.querySelectorAll<HTMLElement>(':scope > section')).map((element) => {
    const runs = runsIn(element);
    return {
      chapter: Number(element.dataset.chapter),
      element,
      runs,
      length: runs.at(-1)?.end ?? 0,
    };
  });
}

function charRect(section: Section, offset: number) {
  // Search the DOM text runs first. Measuring only the matched character avoids
  // materializing a rectangle for every line of a large chapter.
  const target = clamp(offset, 0, section.length - 1);
  let lo = 0;
  let hi = section.runs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (section.runs[mid].end <= target) lo = mid + 1;
    else hi = mid;
  }
  const run = section.runs[lo];
  if (!run) return section.element.getClientRects()[0];
  const range = document.createRange();
  range.setStart(run.node, target - run.start);
  range.setEnd(run.node, target - run.start + 1);
  // Collapsed whitespace between paragraphs has no box. Its nearest parent
  // still identifies the column, including when that column begins with an image.
  return range.getClientRects()[0] ?? run.node.parentElement?.getClientRects()[0];
}

export class Pagination {
  readonly count: number;
  private stride: number;
  private sections: Section[];

  constructor(private article: HTMLElement) {
    const gap = parseFloat(getComputedStyle(article).columnGap) || 0;
    // clientWidth is an integer. A half pixel of rounding per spread can
    // otherwise move a saved location into the previous page of a long chapter.
    this.stride = Math.max(1, article.getBoundingClientRect().width + gap);
    this.count = Math.max(1, Math.ceil((article.scrollWidth + gap - 1) / this.stride));
    this.sections = indexSections(article);
  }

  private spreadAtX(x: number) {
    return clamp(
      Math.floor((x - this.article.getBoundingClientRect().left + 1) / this.stride),
      0,
      this.count - 1,
    );
  }

  spreadFor(location: Location) {
    const section = this.sections.find((s) => s.chapter === location.chapter);
    if (!section) return 0;
    // At the start of an illustrated chapter, the first image can occupy an
    // entire column before the first text node.
    const rect =
      location.offset === 0
        ? section.element.getClientRects()[0]
        : charRect(section, location.offset);
    return rect ? this.spreadAtX(rect.left) : 0;
  }

  firstOn(spread: number): Location {
    const target = this.article.getBoundingClientRect().left + spread * this.stride - 2;
    const section =
      this.sections.find((s) => {
        const rects = s.element.getClientRects();
        return rects.length && rects[rects.length - 1].right > target;
      }) ?? this.sections[this.sections.length - 1];
    if (!section) return { chapter: 0, offset: 0 };
    if ((section.element.getClientRects()[0]?.left ?? 0) >= target) {
      return { chapter: section.chapter, offset: 0 };
    }
    let lo = 0;
    let hi = Math.max(0, section.length - 1);
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((charRect(section, mid)?.left ?? 0) < target) lo = mid + 1;
      else hi = mid;
    }
    return { chapter: section.chapter, offset: lo };
  }

  includes(location: Location) {
    return this.sections.some((s) => s.chapter === location.chapter);
  }

  show(spread: number) {
    this.article.style.transform = `translateX(${-spread * this.stride}px)`;
  }
}

export function locationOf(root: HTMLElement, node: Node, offset: number): Location | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const section = element?.closest<HTMLElement>('section[data-chapter]');
  if (!section || !root.contains(section)) return null;
  const range = document.createRange();
  range.selectNodeContents(section);
  range.setEnd(node, offset);
  return { chapter: Number(section.dataset.chapter), offset: range.toString().length };
}

/** Rebuild only the text runs affected by annotations. Book HTML never receives note markup. */
export function markAnnotations(section: HTMLElement, chapter: number, annotations: Annotation[]) {
  const marks = annotations.filter((a) => chapter >= a.start.chapter && chapter <= a.end.chapter);
  if (!marks.length) return;
  for (const run of runsIn(section)) {
    const intervals = marks
      .map((mark) => ({
        start: Math.max(0, (chapter === mark.start.chapter ? mark.start.offset : 0) - run.start),
        end: Math.min(
          run.end - run.start,
          (chapter === mark.end.chapter ? mark.end.offset : run.end) - run.start,
        ),
      }))
      .filter((i) => i.start < i.end)
      .sort((a, b) => a.start - b.start);
    if (!intervals.length) continue;
    const fragment = document.createDocumentFragment();
    const text = run.node.data;
    let cursor = 0;
    for (const interval of intervals) {
      if (interval.end <= cursor) continue;
      if (cursor < interval.start) fragment.append(text.slice(cursor, interval.start));
      const mark = document.createElement('mark');
      mark.className = 'xr-highlight';
      mark.textContent = text.slice(Math.max(cursor, interval.start), interval.end);
      fragment.append(mark);
      cursor = interval.end;
    }
    fragment.append(text.slice(cursor));
    run.node.replaceWith(fragment);
  }
}
