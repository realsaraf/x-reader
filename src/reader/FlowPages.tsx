import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { Chapter } from '../model';
import type { Annotation, Location, Passage, Preferences } from './state';
import { locationOf, markAnnotations, Pagination } from './pagination';

export interface FlowControls {
  adjacent(direction: number): Location | null;
  containsOnPage(location: Location): boolean;
}

interface Props {
  chapters: Chapter[];
  location: Location;
  preferences: Preferences;
  annotations: Annotation[];
  onMetrics: (spread: number, count: number, lastGroup: boolean, firstGroup: boolean) => void;
  onSelect: (selection: Passage | null) => void;
}

interface Group {
  start: number;
  end: number;
}

// Layout a bounded run of chapters. PDF pages in the same run flow together,
// while a long book keeps only a small portion of its DOM in the webview.
function groupChapters(chapters: Chapter[]) {
  const groups: Group[] = [];
  let start = 0;
  let bytes = 0;
  for (let i = 0; i < chapters.length; i++) {
    const size = chapters[i].html.length;
    if (i > start && (i - start >= 16 || bytes + size > 2_000_000)) {
      groups.push({ start, end: i });
      start = i;
      bytes = 0;
    }
    bytes += size;
  }
  groups.push({ start, end: chapters.length });
  return groups;
}

const fonts: Record<Preferences['typeface'], string> = {
  Literata: '"Literata", Georgia, serif',
  Georgia: 'Georgia, "Times New Roman", serif',
  'Sans serif': '"DM Sans", system-ui, sans-serif',
  OpenDyslexic: '"OpenDyslexic", system-ui, sans-serif',
};

export const FlowPages = forwardRef<FlowControls, Props>(function FlowPages(
  { chapters, location, annotations, preferences, onMetrics, onSelect },
  controls,
) {
  const article = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const pagination = useRef<Pagination | null>(null);
  const spread = useRef(0);
  const current = useRef(location);
  current.current = location;
  const groups = useMemo(() => groupChapters(chapters), [chapters]);
  const group =
    groups.find((g) => location.chapter >= g.start && location.chapter < g.end) ?? groups[0];

  useImperativeHandle(
    controls,
    () => ({
      adjacent(direction) {
        const layout = pagination.current;
        if (!layout) return null;
        const index = spread.current + direction;
        if (index >= 0 && index < layout.count) return layout.firstOn(index);
        if (direction > 0 && group.end < chapters.length) return { chapter: group.end, offset: 0 };
        if (direction < 0 && group.start > 0) {
          return { chapter: group.start - 1, offset: Number.MAX_SAFE_INTEGER };
        }
        return null;
      },
      containsOnPage(point) {
        const layout = pagination.current;
        return !!layout && layout.includes(point) && layout.spreadFor(point) === spread.current;
      },
    }),
    [chapters, group],
  );

  useLayoutEffect(() => {
    const root = article.current;
    if (!root) return;
    const fragment = document.createDocumentFragment();
    for (let i = group.start; i < group.end; i++) {
      const section = document.createElement('section');
      section.dataset.chapter = String(i);
      section.setAttribute('aria-label', chapters[i].title);
      // The import boundary admits sanitized local markup only.
      section.innerHTML = chapters[i].html;
      markAnnotations(section, i, annotations);
      fragment.append(section);
    }
    root.replaceChildren(fragment);
  }, [chapters, group, annotations]);

  useLayoutEffect(() => {
    const root = article.current;
    const frame = viewport.current;
    if (!root || !frame) return;
    let active = true;
    let raf = 0;
    const measure = () => {
      if (!active || !frame.clientWidth) return;
      // A sidebar or a narrow window can reduce the space below two usable pages.
      frame.dataset.columns =
        preferences.layout === 'double' && frame.clientWidth >= 650 ? '2' : '1';
      const layout = new Pagination(root);
      pagination.current = layout;
      spread.current = layout.spreadFor(current.current);
      layout.show(spread.current);
      onMetrics(spread.current, layout.count, group.end === chapters.length, group.start === 0);
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(frame);
    root.addEventListener('load', schedule, true);
    document.fonts.ready.then(schedule);
    document.fonts.addEventListener('loadingdone', schedule);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      root.removeEventListener('load', schedule, true);
      document.fonts.removeEventListener('loadingdone', schedule);
    };
  }, [annotations, chapters, group, preferences, onMetrics]);

  useLayoutEffect(() => {
    const layout = pagination.current;
    if (!layout) return;
    spread.current = layout.spreadFor(location);
    layout.show(spread.current);
    onMetrics(spread.current, layout.count, group.end === chapters.length, group.start === 0);
  }, [location, group, chapters.length, onMetrics]);

  function captureSelection() {
    const root = article.current;
    const selection = window.getSelection();
    if (!root || !selection?.rangeCount || selection.isCollapsed) {
      onSelect(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const start = locationOf(root, range.startContainer, range.startOffset);
    const end = locationOf(root, range.endContainer, range.endOffset);
    const quote = range.toString().trim();
    onSelect(start && end && quote ? { start, end, quote } : null);
  }

  return (
    <div
      ref={viewport}
      className="xr-viewport"
      data-columns="1"
      style={
        {
          '--xr-text-size': `${preferences.size}px`,
          '--xr-line-height': preferences.spacing,
          '--xr-font': fonts[preferences.typeface],
        } as CSSProperties
      }
    >
      <article
        ref={article}
        className="xr-columns"
        tabIndex={0}
        aria-label="Book text"
        onPointerUp={captureSelection}
        onKeyUp={captureSelection}
        onClick={(event) => {
          // Book links have no authority to navigate the application webview.
          if ((event.target as Element).closest('a')) event.preventDefault();
        }}
      />
    </div>
  );
});
