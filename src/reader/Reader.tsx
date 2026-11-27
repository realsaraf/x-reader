import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowLeft,
  Asterisk,
  BookOpen,
  Bookmark as BookmarkIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Highlighter,
  List,
  Maximize2,
  Minimize2,
  NotebookPen,
  Pencil,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { Book } from '../model';
import { annotationId } from '../identity';
import { FlowPages } from './FlowPages';
import type { FlowControls } from './FlowPages';
import OriginalPdf from './OriginalPdf';
import { Contents, Notebook, PanelFrame, Settings } from './Panels';
import type { Panel } from './Panels';
import { clamp } from './state';
import type { Annotation, Bookmark, Location, Passage, ReadingState } from './state';
import './reader.css';

interface Props {
  book: Book;
  source: Blob | null;
  initialState: ReadingState;
  onChange: (state: ReadingState) => void;
  onClose: () => void;
}

function Tool({
  name,
  children,
  action,
  pressed,
  panel,
}: {
  name: string;
  children: ReactNode;
  action: () => void;
  pressed?: boolean;
  panel?: string;
}) {
  return (
    <button
      type="button"
      className="xr-icon"
      aria-label={name}
      title={name}
      aria-pressed={panel ? undefined : pressed}
      aria-expanded={panel ? pressed : undefined}
      aria-controls={panel}
      data-selected={pressed || undefined}
      onClick={action}
    >
      {children}
    </button>
  );
}

export default function Reader({ book, source, initialState, onChange, onClose }: Props) {
  const [state, setState] = useState(initialState);
  const latest = useRef(state);
  const flow = useRef<FlowControls>(null);
  const [contents, setContents] = useState(false);
  const [panel, setPanel] = useState<Exclude<Panel, 'contents'> | null>(null);
  const [selected, setSelected] = useState<Passage | null>(null);
  const [takingNote, setTakingNote] = useState(false);
  const [note, setNote] = useState('');
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const [notice, setNotice] = useState('');
  const [metrics, setMetrics] = useState({ spread: 0, count: 1, last: false, first: true });
  const onMetrics = useCallback((spread: number, count: number, last: boolean, first: boolean) => {
    setMetrics((old) =>
      old.spread === spread && old.count === count && old.last === last && old.first === first
        ? old
        : { spread, count, last, first },
    );
  }, []);
  const hasPdf = book.format.toLowerCase() === 'pdf' && !!source;
  const original = state.mode === 'pdf' && hasPdf;
  const total = book.chapters.length;
  const pageCount = Math.max(1, book.pageCount ?? total);
  const active = original
    ? Math.max(
        0,
        book.chapters.findIndex((chapter) => chapter.sourcePage === state.pdfPage),
      )
    : clamp(state.flow.chapter, 0, total - 1);
  const label = book.chapters[active]?.title || book.title;
  const pdfLabel = `Page ${state.pdfPage} of ${pageCount}`;
  const atEnd = original
    ? state.pdfPage === pageCount
    : metrics.last && metrics.spread === metrics.count - 1;
  const atStart = original ? state.pdfPage === 1 : metrics.first && metrics.spread === 0;

  // One synchronous publication per interaction preserves the last turn even
  // when the reader closes before React paints another frame.
  function save(patch: Partial<ReadingState>) {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setState(next);
    onChange(next);
  }

  const lengths = useMemo(() => new Map<number, number>(), [book.id]);
  function chapterLength(index: number) {
    const known = lengths.get(index);
    if (known !== undefined) return known;
    const template = document.createElement('template');
    template.innerHTML = book.chapters[index]?.html || '';
    const length = template.content.textContent?.length ?? 0;
    lengths.set(index, length);
    return length;
  }

  function progressAt(point: Location) {
    const fraction = point.offset / Math.max(1, chapterLength(point.chapter));
    return Math.min(99, (100 * (point.chapter + fraction)) / Math.max(1, total));
  }
  function pdfProgress(page: number) {
    return Math.min(99, ((page - 1) / Math.max(1, pageCount - 1)) * 100);
  }
  function clearSelection() {
    setSelected(null);
    setTakingNote(false);
    setNote('');
    window.getSelection()?.removeAllRanges();
  }
  function goFlow(location: Location) {
    clearSelection();
    const point = { chapter: clamp(location.chapter, 0, total - 1), offset: 0 };
    point.offset = clamp(location.offset, 0, Math.max(0, chapterLength(point.chapter) - 1));
    save({ mode: 'flow', flow: point, flowVisited: true, progress: progressAt(point) });
  }
  function goPdf(value: number) {
    clearSelection();
    const page = clamp(value, 1, pageCount);
    save({ mode: 'pdf', pdfPage: page, pdfVisited: true, progress: pdfProgress(page) });
  }
  function toggleMode() {
    if (original) {
      goFlow(state.flowVisited ? state.flow : { chapter: active, offset: 0 });
    } else {
      const page = state.pdfVisited ? state.pdfPage : (book.chapters[active]?.sourcePage ?? 1);
      // This is also a visit if the reader switched before making a page turn.
      save({
        flowVisited: true,
        mode: 'pdf',
        pdfPage: page,
        pdfVisited: true,
        progress: pdfProgress(page),
      });
      clearSelection();
    }
  }
  function turn(direction: number) {
    if (direction < 0 && atStart) return;
    if (direction > 0 && atEnd) {
      save({ progress: 100 });
      onClose();
      return;
    }
    if (original) goPdf(state.pdfPage + direction);
    else {
      const point = flow.current?.adjacent(direction);
      if (point) goFlow(point);
    }
  }
  function seek(percent: number) {
    if (original) goPdf(1 + Math.round((percent / 100) * (pageCount - 1)));
    else {
      const position = Math.min(total - 0.000001, (percent * total) / 100);
      const chapter = Math.floor(position);
      goFlow({ chapter, offset: Math.round((position - chapter) * chapterLength(chapter)) });
    }
  }

  const currentBookmark = state.bookmarks.find((mark) =>
    original
      ? mark.mode === 'pdf' && mark.pdfPage === state.pdfPage
      : mark.mode === 'flow' &&
        (flow.current?.containsOnPage(mark.flow) ??
          (mark.flow.chapter === state.flow.chapter && mark.flow.offset === state.flow.offset)),
  );
  function toggleBookmark() {
    if (currentBookmark) {
      save({ bookmarks: state.bookmarks.filter((m) => m.id !== currentBookmark.id) });
      setNotice('Bookmark removed');
      return;
    }
    const mark: Bookmark = {
      id: annotationId(),
      label,
      mode: original ? 'pdf' : 'flow',
      flow: state.flow,
      pdfPage: state.pdfPage,
      progress: state.progress,
    };
    save({ bookmarks: [mark, ...state.bookmarks] });
    setNotice('Bookmark saved');
  }
  function addPassage() {
    if (!selected) return;
    const annotation: Annotation = { ...selected, note: note.trim(), id: annotationId() };
    save({ annotations: [annotation, ...state.annotations] });
    clearSelection();
    setNotice(annotation.note ? 'Note saved' : 'Highlight saved');
  }
  function closePanel(kind: Panel) {
    if (kind === 'contents') setContents(false);
    else setPanel(null);
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(`button[aria-controls="xr-${kind}"]`)?.focus(),
    );
  }
  function goToChapter(index: number) {
    if (original) goPdf(book.chapters[index].sourcePage ?? 1);
    else goFlow({ chapter: index, offset: 0 });
    if (window.innerWidth < 900) closePanel('contents');
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setNotice('Full screen is unavailable in this window.');
    }
  }
  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 1900);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selected) clearSelection();
        else if (panel) closePanel(panel);
        else if (contents) closePanel('contents');
        return;
      }
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        (event.target as Element)?.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        if (!atEnd) turn(1);
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        turn(-1);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  return (
    <div
      className="xr-reader"
      data-theme={state.preferences.theme}
      data-width={state.preferences.width}
    >
      <header className="xr-topbar">
        <div className="xr-top-group xr-book-info">
          <button className="xr-back" onClick={onClose} title="Back to library">
            <ArrowLeft size={17} />
            <span>Library</span>
          </button>
          <span className="xr-separator" />
          <Tool
            name="Table of contents"
            pressed={contents}
            panel="xr-contents"
            action={() => setContents(!contents)}
          >
            <List size={20} />
          </Tool>
          <div className="xr-title">
            <strong>{book.title}</strong>
            <small>{book.author}</small>
          </div>
        </div>
        <span className="xr-top-chapter">{original ? pdfLabel : label}</span>
        <div className="xr-top-group xr-tools">
          {hasPdf && (
            <button
              className="xr-mode"
              aria-label={original ? 'Switch to reading view' : 'View original PDF'}
              title={original ? 'Switch to reading view' : 'View original PDF'}
              onClick={toggleMode}
            >
              {original ? <BookOpen size={16} /> : <FileText size={16} />}
              <span>{original ? 'Reading view' : 'Original PDF'}</span>
            </button>
          )}
          <Tool
            name="Your notebook"
            panel="xr-notebook"
            pressed={panel === 'notebook'}
            action={() => setPanel(panel === 'notebook' ? null : 'notebook')}
          >
            <NotebookPen size={19} />
          </Tool>
          <Tool
            name={currentBookmark ? 'Remove bookmark' : 'Add bookmark'}
            pressed={!!currentBookmark}
            action={toggleBookmark}
          >
            <BookmarkIcon size={19} fill={currentBookmark ? 'currentColor' : 'none'} />
          </Tool>
          <span className="xr-separator" />
          <Tool
            name="Reading settings"
            panel="xr-settings"
            pressed={panel === 'settings'}
            action={() => setPanel(panel === 'settings' ? null : 'settings')}
          >
            <SlidersHorizontal size={18} />
          </Tool>
          <Tool
            name={fullscreen ? 'Exit full screen' : 'Enter full screen'}
            action={toggleFullscreen}
          >
            {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </Tool>
        </div>
      </header>

      <div className="xr-workspace">
        {contents && (
          <PanelFrame kind="contents" close={() => closePanel('contents')}>
            <Contents chapters={book.chapters} active={active} go={goToChapter} />
          </PanelFrame>
        )}
        <main className="xr-main">
          <div className="xr-sheet" data-layout={state.preferences.layout}>
            <div className="xr-running-head">
              <span>{book.author}</span>
              <Asterisk aria-hidden="true" size={16} />
              <span>{original ? 'Original PDF' : label}</span>
            </div>
            {original && source ? (
              <OriginalPdf source={source} page={state.pdfPage} />
            ) : (
              <FlowPages
                ref={flow}
                chapters={book.chapters}
                location={state.flow}
                preferences={state.preferences}
                annotations={state.annotations}
                onMetrics={onMetrics}
                onSelect={(passage) => {
                  setSelected(passage);
                  setTakingNote(false);
                  setNote('');
                }}
              />
            )}
            <footer className="xr-pagination">
              <button
                className="xr-page-button"
                aria-label="Previous page"
                title="Previous page"
                disabled={atStart}
                onClick={() => turn(-1)}
              >
                <ChevronLeft size={19} />
              </button>
              <div className="xr-position">
                <div>
                  <span>{original ? pdfLabel : label}</span>
                  <span>{Math.round(state.progress)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.1}
                  aria-label="Reading progress"
                  aria-valuetext={`${Math.round(state.progress)} percent`}
                  value={state.progress}
                  style={{ '--xr-progress': `${state.progress}%` } as CSSProperties}
                  onChange={(e) => seek(Number(e.target.value))}
                />
              </div>
              <button
                className="xr-page-button"
                aria-label={atEnd ? 'Finish book' : 'Next page'}
                title={atEnd ? 'Finish book' : 'Next page'}
                onClick={() => turn(1)}
              >
                {atEnd ? <Check size={17} /> : <ChevronRight size={19} />}
              </button>
            </footer>
          </div>
        </main>
      </div>

      {panel && (
        <PanelFrame kind={panel} close={() => closePanel(panel)}>
          {panel === 'settings' ? (
            <Settings
              preferences={state.preferences}
              flow={!original}
              change={(values) => save({ preferences: { ...state.preferences, ...values } })}
            />
          ) : (
            <Notebook
              bookmarks={state.bookmarks}
              annotations={state.annotations}
              jumpBookmark={(m) => {
                m.mode === 'pdf' && hasPdf ? goPdf(m.pdfPage) : goFlow(m.flow);
                closePanel('notebook');
              }}
              jumpPassage={(a) => {
                goFlow(a.start);
                closePanel('notebook');
              }}
              removeBookmark={(id) =>
                save({ bookmarks: state.bookmarks.filter((m) => m.id !== id) })
              }
              removePassage={(id) =>
                save({ annotations: state.annotations.filter((a) => a.id !== id) })
              }
              updateNote={(id, text) =>
                save({
                  annotations: state.annotations.map((a) =>
                    a.id === id ? { ...a, note: text } : a,
                  ),
                })
              }
            />
          )}
        </PanelFrame>
      )}

      {selected && (
        <div className="xr-annotation-tools" role="group" aria-label="Selected passage">
          {takingNote ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addPassage();
              }}
            >
              <label htmlFor="xr-note-text">Note on this passage</label>
              <textarea
                id="xr-note-text"
                value={note}
                autoFocus
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="xr-note-actions">
                <button type="button" onClick={clearSelection}>
                  Cancel
                </button>
                <button type="submit">Save note</button>
              </div>
            </form>
          ) : (
            <>
              <button onPointerDown={(e) => e.preventDefault()} onClick={addPassage}>
                <Highlighter size={16} /> Highlight
              </button>
              <button onPointerDown={(e) => e.preventDefault()} onClick={() => setTakingNote(true)}>
                <Pencil size={15} /> Add note
              </button>
              <button className="xr-icon" aria-label="Dismiss selection" onClick={clearSelection}>
                <X size={14} />
              </button>
            </>
          )}
        </div>
      )}
      <div role="status" className={notice ? 'xr-notice' : 'xr-sr-only'}>
        {notice}
      </div>
    </div>
  );
}
