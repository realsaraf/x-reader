import { ArrowRight, BookCheck, Check, Ellipsis, Trash2 } from 'lucide-react';
import type { ShelfEntry } from '../model';
import { Cover } from './Cover';

interface Props {
  book: ShelfEntry;
  busy: boolean;
  menuOpen: boolean;
  onOpen: () => void;
  onToggleMenu: () => void;
  onToggleFinished: () => void;
  onRemove: () => void;
}

export function BookCard({
  book,
  busy,
  menuOpen,
  onOpen,
  onToggleMenu,
  onToggleFinished,
  onRemove,
}: Props) {
  return (
    <article className="book-card">
      <button
        className="cover-button"
        aria-label={'Open ' + book.title}
        onClick={onOpen}
        disabled={busy}
      >
        <div className="tile-cover">
          <Cover {...book} />
        </div>
        <span className="cover-call">
          Open book <ArrowRight size={14} />
        </span>
      </button>
      <div className="book-details">
        <button className="book-name" onClick={onOpen} title={book.title} disabled={busy}>
          {book.title}
        </button>
        <div className="item-actions">
          <button
            className="more-button"
            aria-label={'Options for ' + book.title}
            aria-expanded={menuOpen}
            onClick={onToggleMenu}
          >
            <Ellipsis size={18} />
          </button>
          {menuOpen && (
            <div className="book-menu">
              <button onClick={onToggleFinished}>
                <BookCheck size={15} />
                {book.finished ? 'Mark as unfinished' : 'Mark as finished'}
              </button>
              <button onClick={onRemove}>
                <Trash2 size={15} />
                Remove from library
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="book-byline">{book.author || 'Unknown author'}</div>
      <div className="book-meta">
        <span>{book.format.toUpperCase()}</span>
        <div className="mini-track">
          <i style={{ width: (book.finished ? 100 : book.state.progress) + '%' }} />
        </div>
        <span>
          {book.finished ? (
            <Check aria-label="Finished" size={12} />
          ) : (
            Math.round(book.state.progress) + '%'
          )}
        </span>
      </div>
    </article>
  );
}
