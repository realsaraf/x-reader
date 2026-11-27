import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { ShelfEntry } from '../model';

interface Props {
  book: ShelfEntry;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RemoveBookDialog({ book, onCancel, onConfirm }: Props) {
  const confirmation = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    confirmation.current?.showModal();
  }, []);
  return (
    <dialog
      aria-labelledby="remove-book-title"
      className="remove-dialog"
      ref={confirmation}
      onCancel={onCancel}
    >
      <button className="dialog-x" aria-label="Close" onClick={onCancel}>
        <X size={18} />
      </button>
      <h2 id="remove-book-title">Remove this book?</h2>
      <p>
        Removing <strong>{book.title}</strong> deletes its library copy, bookmarks and notes. Your
        original file stays on disk.
      </p>
      <div>
        <button autoFocus onClick={onCancel}>
          Keep book
        </button>
        <button className="green-button" onClick={onConfirm}>
          Remove book
        </button>
      </div>
    </dialog>
  );
}
