import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlignJustify,
  BookOpen,
  Bookmark as BookmarkIcon,
  Check,
  ChevronRight,
  File,
  Minus,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { Chapter } from '../model';
import type { Annotation, Bookmark, Preferences, Theme, Typeface } from './state';
import { clamp } from './state';

export type Panel = 'contents' | 'settings' | 'notebook';
const titles: Record<Panel, string> = {
  contents: 'Contents',
  settings: 'Make it yours',
  notebook: 'Your notebook',
};

export function PanelFrame({
  kind,
  close,
  children,
}: {
  kind: Panel;
  close: () => void;
  children: ReactNode;
}) {
  const dismiss = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dismiss.current?.focus({ preventScroll: true });
  }, [kind]);
  return (
    <aside aria-label={titles[kind]} id={`xr-${kind}`} className={`xr-panel xr-${kind}`}>
      <header className="xr-panel-head">
        <div>
          <div className="xr-eyebrow">Your reading space</div>
          <h2>{titles[kind]}</h2>
        </div>
        <button
          ref={dismiss}
          className="xr-icon"
          title="Close panel"
          aria-label={`Close ${titles[kind]}`}
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      <div className="xr-panel-body">{children}</div>
    </aside>
  );
}

export function Contents({
  chapters,
  active,
  go,
}: {
  chapters: Chapter[];
  active: number;
  go: (i: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  return (
    <nav className="xr-toc" aria-label="Book chapters">
      {chapters.map((chapter, i) => (
        <button
          key={i}
          ref={i === active ? ref : undefined}
          aria-current={i === active ? 'location' : undefined}
          onClick={() => go(i)}
          style={{ paddingInlineStart: 12 + Math.min(3, Math.max(0, chapter.depth ?? 0)) * 12 }}
        >
          <span>{chapter.title}</span>
          <ChevronRight size={15} />
        </button>
      ))}
    </nav>
  );
}

const themes: Theme[] = ['Paper', 'Sepia', 'Sage', 'Dusk', 'Night'];
const typefaces: Typeface[] = ['Literata', 'Georgia', 'Sans serif', 'OpenDyslexic'];
export function Settings({
  preferences: pref,
  change,
  flow,
}: {
  preferences: Preferences;
  change: (values: Partial<Preferences>) => void;
  flow: boolean;
}) {
  return (
    <div className="xr-settings-fields">
      {flow && (
        <fieldset>
          <legend>Page layout</legend>
          <div className="xr-pair">
            <button
              aria-pressed={pref.layout === 'double'}
              onClick={() => change({ layout: 'double' })}
            >
              <BookOpen size={17} /> Two pages
            </button>
            <button
              aria-pressed={pref.layout === 'single'}
              onClick={() => change({ layout: 'single' })}
            >
              <File size={16} /> Single page
            </button>
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend>Page theme</legend>
        <div className="xr-swatches">
          {themes.map((theme) => (
            <button
              key={theme}
              data-swatch={theme}
              aria-pressed={pref.theme === theme}
              onClick={() => change({ theme })}
            >
              <span aria-hidden="true">Aa</span>
              {theme}
            </button>
          ))}
        </div>
      </fieldset>
      {flow ? (
        <>
          <fieldset>
            <legend>Typeface</legend>
            <div className="xr-pair xr-faces">
              {typefaces.map((face) => (
                <button
                  key={face}
                  data-face={face}
                  aria-pressed={pref.typeface === face}
                  onClick={() => change({ typeface: face })}
                >
                  <span aria-hidden="true">Aa</span>
                  {face}
                  {pref.typeface === face && <Check size={12} />}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="xr-adjust">
            <div>
              <strong>Text size</strong>
              <small>{pref.size} px</small>
            </div>
            <div className="xr-stepper">
              <button
                aria-label="Decrease text size"
                disabled={pref.size <= 12}
                onClick={() => change({ size: clamp(pref.size - 1, 12, 36) })}
              >
                <Minus size={15} />
              </button>
              <span aria-hidden="true">Aa</span>
              <button
                aria-label="Increase text size"
                disabled={pref.size >= 36}
                onClick={() => change({ size: clamp(pref.size + 1, 12, 36) })}
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
          <div className="xr-adjust">
            <div>
              <strong>Line spacing</strong>
              <small>{pref.spacing.toFixed(2)}×</small>
            </div>
            <div className="xr-stepper">
              <button
                aria-label="Decrease line spacing"
                disabled={pref.spacing <= 1.25}
                onClick={() =>
                  change({ spacing: clamp(+(pref.spacing - 0.1).toFixed(2), 1.25, 2.25) })
                }
              >
                <Minus size={15} />
              </button>
              <AlignJustify size={12} />
              <button
                aria-label="Increase line spacing"
                disabled={pref.spacing >= 2.25}
                onClick={() =>
                  change({ spacing: clamp(+(pref.spacing + 0.1).toFixed(2), 1.25, 2.25) })
                }
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
          <fieldset>
            <legend>Reading width</legend>
            <div className="xr-segments">
              {(['Narrow', 'Comfort', 'Wide'] as const).map((width) => (
                <button
                  key={width}
                  aria-pressed={pref.width === width}
                  onClick={() => change({ width })}
                >
                  {width}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      ) : (
        <p className="xr-hint">Switch to reading view to adjust the type and layout.</p>
      )}
    </div>
  );
}

interface NotebookProps {
  bookmarks: Bookmark[];
  annotations: Annotation[];
  jumpBookmark: (bookmark: Bookmark) => void;
  jumpPassage: (annotation: Annotation) => void;
  removeBookmark: (id: string) => void;
  removePassage: (id: string) => void;
  updateNote: (id: string, text: string) => void;
}

export function Notebook({
  bookmarks,
  annotations,
  jumpBookmark,
  jumpPassage,
  removeBookmark,
  removePassage,
  updateNote,
}: NotebookProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  return (
    <div className="xr-notes">
      <h3>
        Bookmarks <span>{bookmarks.length}</span>
      </h3>
      {!bookmarks.length && <p className="xr-hint">Save your place with the bookmark icon.</p>}
      {bookmarks.map((mark) => (
        <div className="xr-note-row" key={mark.id}>
          <button className="xr-note-link" onClick={() => jumpBookmark(mark)}>
            <BookmarkIcon size={15} />
            <span>
              <strong>{mark.label}</strong>
              <small>
                {mark.mode === 'pdf'
                  ? `Original PDF · page ${mark.pdfPage}`
                  : `${Math.round(mark.progress)}% through the book`}
              </small>
            </span>
          </button>
          <button
            className="xr-icon"
            aria-label={`Delete bookmark at ${mark.label}`}
            onClick={() => removeBookmark(mark.id)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <h3>
        Highlights &amp; notes <span>{annotations.length}</span>
      </h3>
      {!annotations.length && (
        <p className="xr-hint">Select text in reading view to highlight it or add a note.</p>
      )}
      {annotations.map((a) => (
        <div className="xr-note-entry" key={a.id}>
          <button className="xr-quote" onClick={() => jumpPassage(a)}>
            {a.quote}
          </button>
          {editing === a.id ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateNote(a.id, draft.trim());
                setEditing(null);
              }}
            >
              <textarea
                autoFocus
                aria-label="Edit note"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="xr-note-actions">
                <button type="button" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="submit">Save note</button>
              </div>
            </form>
          ) : (
            <>
              {a.note && <p>{a.note}</p>}
              <div className="xr-note-actions">
                <button
                  onClick={() => {
                    setEditing(a.id);
                    setDraft(a.note);
                  }}
                >
                  <Pencil size={13} /> {a.note ? 'Edit note' : 'Add note'}
                </button>
                <button
                  className="xr-icon"
                  aria-label="Delete highlight"
                  onClick={() => removePassage(a.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
