import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  ArrowDownWideNarrow,
  BookOpen,
  BookmarkCheck,
  ChevronDown,
  FolderOpen,
  LibraryBig,
  Plus,
  Search,
} from 'lucide-react';
import type { ShelfEntry } from '../model';
import { BookCard } from './BookCard';
import { FeaturedBook } from './FeaturedBook';
import { RemoveBookDialog } from './RemoveBookDialog';
import { matchesFilter, shelfView, type Filter, type Sort } from './collection';
import { accept } from '../importers/formats';
import './library.css';

interface Props {
  books: ShelfEntry[];
  busy: string;
  open: (book: ShelfEntry) => void;
  openSample: () => void;
  importFiles: (files: File[]) => void;
  setFinished: (book: ShelfEntry) => void;
  remove: (book: ShelfEntry) => void;
}

const tabs = [
  {
    id: 'all',
    title: 'My library',
    heading: 'Your bookshelf',
    icon: LibraryBig,
    empty: 'Make this shelf yours',
    hint: 'Add books or drop files here to start your collection.',
  },
  {
    id: 'reading',
    title: 'In progress',
    heading: 'In progress',
    icon: BookOpen,
    empty: 'Your current reads will appear here',
    hint: 'Open a book from your library to get started.',
  },
  {
    id: 'finished',
    title: 'Finished',
    heading: 'Finished',
    icon: BookmarkCheck,
    empty: 'Your finished books will appear here',
    hint: 'Use a book’s options to mark it as finished.',
  },
] as const;

export default function Library({
  books,
  busy,
  open,
  openSample,
  importFiles,
  setFinished,
  remove,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [menu, setMenu] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ShelfEntry | null>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const picker = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  useEffect(() => {
    folder.current?.setAttribute('webkitdirectory', '');
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.item-actions')) setMenu(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [menu]);
  const shelves = useMemo(
    () =>
      tabs.map((tab) => ({
        ...tab,
        count:
          tab.id === 'all'
            ? books.length
            : books.filter((book) => matchesFilter(book, tab.id)).length,
      })),
    [books],
  );
  const shelf = shelves.find((tab) => tab.id === filter) ?? shelves[0];
  const featured = useMemo(() => {
    const recent = [...books].sort((a, b) => b.openedAt - a.openedAt || b.addedAt - a.addedAt);
    return recent.find((book) => !book.finished) ?? recent[0];
  }, [books]);
  const visible = shelfView(books, filter, query, sort);
  function picked(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length) importFiles(files);
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (!busy) importFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div
      className="library-app"
      onDragEnter={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('Files')) {
          depth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        if (--depth.current <= 0) {
          depth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={drop}
    >
      <input
        className="file-picker"
        type="file"
        accept={accept}
        multiple
        ref={picker}
        onChange={picked}
        aria-label="Choose books"
      />
      <input
        className="file-picker"
        type="file"
        multiple
        ref={folder}
        onChange={picked}
        aria-label="Choose folder"
      />
      <aside className="shelf-sidebar">
        <div className="wordmark">
          <span className="brand-icon">
            <BookOpen />
          </span>
          <span>
            x-reader<span className="brand-period">.</span>
          </span>
        </div>
        <nav aria-label="Bookshelves">
          <span className="rail-label eyebrow">Your space</span>
          {shelves.map(({ id, title, icon: Icon, count }) => (
            <button
              key={id}
              className={filter === id ? 'shelf-tab active' : 'shelf-tab'}
              aria-label={`${title} (${count})`}
              aria-current={filter === id ? 'page' : undefined}
              onClick={() => {
                setFilter(id);
                setMenu(null);
              }}
            >
              <Icon size={18} />
              <span>{title}</span>
              <small>{count}</small>
            </button>
          ))}
        </nav>
        <div className="rail-bottom">
          <span className="status-dot" /> Stored locally <span>v{__APP_VERSION__}</span>
        </div>
      </aside>
      <main className="shelf-main">
        <header className="shelf-top">
          <div className="breadcrumb eyebrow">
            <span>Your space</span>
            <b>/</b>Library
          </div>
          <button
            className="green-button add-button"
            disabled={!!busy}
            onClick={() => picker.current?.click()}
          >
            <Plus size={17} /> Add books
          </button>
        </header>
        <div className="shelf-content">
          <section className="intro">
            <h1>
              Your reading,{' '}
              <em>
                beautifully
                <br />
                uninterrupted.
              </em>
            </h1>
            <p>A quiet corner for all the books you love.</p>
          </section>
          <FeaturedBook
            book={featured}
            busy={!!busy}
            onOpen={() => (featured ? open(featured) : openSample())}
          />
          <section className="collection">
            <div className="section-label eyebrow">Your collection</div>
            <div className="collection-heading">
              <h2>
                {shelf.heading} <small>{String(visible.length).padStart(2, '0')}</small>
              </h2>
              <div className="shelf-controls">
                <label className="search-field">
                  <Search size={16} />
                  <input
                    type="search"
                    aria-label="Search books"
                    placeholder="Find a book…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label className="sort-field">
                  <ArrowDownWideNarrow size={16} />
                  <select
                    aria-label="Sort books"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as Sort)}
                  >
                    <option value="recent">Recent</option>
                    <option value="title">Title</option>
                    <option value="author">Author</option>
                  </select>
                  <ChevronDown size={12} />
                </label>
              </div>
            </div>
            {visible.length ? (
              <div className="shelf-grid">
                {visible.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    busy={!!busy}
                    menuOpen={menu === book.id}
                    onOpen={() => open(book)}
                    onToggleMenu={() => setMenu(menu === book.id ? null : book.id)}
                    onToggleFinished={() => {
                      setMenu(null);
                      setFinished(book);
                    }}
                    onRemove={() => {
                      setMenu(null);
                      setRemoving(book);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-shelf">
                <BookOpen size={25} strokeWidth={1.25} />
                <div>
                  <strong>{query ? 'No matching books' : shelf.empty}</strong>
                  <p>{query ? 'Try a different title or author.' : shelf.hint}</p>
                </div>
              </div>
            )}
          </section>
          <footer className="shelf-footer">
            <span>
              <span className="status-dot" /> Your personal library
            </span>
            <button onClick={() => folder.current?.click()} disabled={!!busy}>
              <FolderOpen size={16} /> Import a folder
            </button>
          </footer>
        </div>
      </main>
      {dragging && (
        <div className="drop-overlay">
          <BookOpen size={35} />
          <h2>Drop books to import</h2>
        </div>
      )}
      {removing && (
        <RemoveBookDialog
          book={removing}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            remove(removing);
            setRemoving(null);
          }}
        />
      )}
    </div>
  );
}
