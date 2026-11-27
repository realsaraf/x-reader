import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { BookOpen, X } from 'lucide-react';
import Library from './library/Library';
import { addToLibrary, sample } from './library/collection';
import { accept } from './importers/formats';
import type { Book, ShelfEntry } from './model';
import type { ReadingState } from './reader/state';
import { libraryStorage } from './storage';
import { flushNativeWrites } from './storage/native';

const Reader = lazy(() => import('./reader/Reader'));
const supported = accept.split(',');
interface OpenBook {
  book: Book;
  source: Blob | null;
  initial: ReadingState;
}
interface Notice {
  text: string;
  error?: boolean;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const [books, setBooks] = useState<ShelfEntry[]>([]);
  const entries = useRef(new Map<string, ShelfEntry>());
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<OpenBook | null>(null);
  const [busy, setBusy] = useState('');
  const locked = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const refresh = () => setBooks([...entries.current.values()]);
  const load = useCallback(async () => {
    try {
      const shelf = await libraryStorage.list();
      entries.current = new Map(shelf.map((b) => [b.id, b]));
      setBooks(shelf);
      setReady(true);
      setNotice(null);
    } catch (e) {
      setNotice({ text: 'Could not open the library. ' + message(e), error: true });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
      getCurrentWindow().onCloseRequested(() => flushNativeWrites()),
    );
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => clearTimeout(timer);
  }, [notice]);

  async function work(label: string, task: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(label);
    setNotice(null);
    try {
      await task();
    } catch (e) {
      setNotice({ text: message(e), error: true });
    } finally {
      setBusy('');
      locked.current = false;
    }
  }

  async function open(entry: ShelfEntry) {
    const [book, source] = await Promise.all([
      libraryStorage.getBook(entry.id),
      entry.format.toLowerCase() === 'pdf'
        ? libraryStorage.getSource(entry.id)
        : Promise.resolve(null),
    ]);
    const updated = { ...entry, openedAt: Date.now() };
    await libraryStorage.update(updated);
    entries.current.set(entry.id, updated);
    refresh();
    setActive({ book, source, initial: updated.state });
  }
  const readSample = () =>
    work('Preparing The Quiet Atlas…', async () => {
      const response = await fetch(sample.source);
      if (!response.ok) throw new Error('The bundled sample could not be opened.');
      const file = new File([await response.blob()], 'the-quiet-atlas.pdf', {
        type: 'application/pdf',
      });
      const added = await addToLibrary(file, new Set(entries.current.keys()));
      if (!added) throw new Error('The sample is already in your library.');
      entries.current.set(added.id, added);
      refresh();
      await open(added);
    });

  function importFiles(files: File[]) {
    return work('Preparing books…', async () => {
      const accepted = files.filter((f) =>
        supported.some((ext) => f.name.toLowerCase().endsWith(ext)),
      );
      if (!accepted.length)
        throw new Error(
          'No supported books found. Choose one of these formats: ' + accept.replaceAll(',', ', '),
        );
      let added = 0,
        duplicates = 0;
      const errors: string[] = [];
      const known = new Set(entries.current.keys());
      for (const [i, file] of accepted.entries()) {
        setBusy(`Importing ${i + 1} of ${accepted.length} · ${file.name}`);
        try {
          const entry = await addToLibrary(file, known);
          if (!entry) {
            duplicates++;
            continue;
          }
          entries.current.set(entry.id, entry);
          refresh();
          added++;
        } catch (e) {
          errors.push(file.name + ' — ' + message(e));
        }
      }
      const results = [
        added ? `Added ${added} ${added === 1 ? 'book' : 'books'}.` : '',
        duplicates ? `${duplicates} already in your library.` : '',
        files.length > accepted.length
          ? `Skipped ${files.length - accepted.length} unsupported files.`
          : '',
        ...errors.slice(0, 3),
        errors.length > 3 ? `Plus ${errors.length - 3} other import errors.` : '',
      ];
      setNotice({ text: results.filter(Boolean).join('\n'), error: !!errors.length });
    });
  }

  function record(id: string, state: ReadingState) {
    const old = entries.current.get(id);
    if (!old) return;
    const entry = { ...old, state, finished: old.finished || state.progress >= 100 };
    entries.current.set(id, entry);
    void libraryStorage
      .update(entry)
      .catch((e) => setNotice({ text: 'Could not save your place. ' + message(e), error: true }));
  }
  async function toggleFinished(book: ShelfEntry) {
    await work('Updating shelf…', async () => {
      const entry = { ...book, finished: !book.finished };
      await libraryStorage.update(entry);
      entries.current.set(entry.id, entry);
      refresh();
    });
  }
  async function remove(book: ShelfEntry) {
    await work('Removing book…', async () => {
      await libraryStorage.remove(book.id);
      entries.current.delete(book.id);
      refresh();
      setNotice({ text: 'Removed ' + book.title + ' from your library.' });
    });
  }
  const waiting = (
    <div className="loading-library">
      <BookOpen size={28} />
      <span>Opening your library…</span>
      {notice?.error && <button onClick={load}>Try again</button>}
    </div>
  );
  return (
    <>
      {!ready ? (
        waiting
      ) : active ? (
        <Suspense fallback={waiting}>
          <Reader
            key={active.book.id}
            book={active.book}
            source={active.source}
            initialState={active.initial}
            onChange={(state) => record(active.book.id, state)}
            onClose={() => {
              refresh();
              setActive(null);
            }}
          />
        </Suspense>
      ) : (
        <Library
          books={books}
          busy={busy}
          open={(entry) => void work('Opening book…', () => open(entry))}
          openSample={readSample}
          importFiles={importFiles}
          remove={remove}
          setFinished={toggleFinished}
        />
      )}
      {(busy || notice) && (
        <div
          className={'notice' + (notice?.error ? ' error' : '')}
          role={notice?.error ? 'alert' : 'status'}
        >
          {busy || notice?.text}
          {!busy && (
            <button aria-label="Dismiss message" onClick={() => setNotice(null)}>
              <X size={15} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
