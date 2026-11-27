import { freshReadingState } from '../reader/state';
import { libraryStorage } from '../storage';
import type { Book, ShelfEntry } from '../model';
import { fingerprint } from '../identity';

export async function addToLibrary(file: File, existing: Set<string>): Promise<ShelfEntry | null> {
  if (file.size > 128 * 1024 * 1024) throw new Error('The import limit is 128 MiB per book.');
  const id = await fingerprint(file);
  if (existing.has(id)) return null;
  const { importBook } = await import('../importers');
  const book: Book = { ...(await importBook(file)), id };
  const entry: ShelfEntry = {
    id,
    title: book.title,
    author: book.author,
    format: book.format,
    cover: book.cover,
    addedAt: Date.now(),
    openedAt: 0,
    finished: false,
    state: freshReadingState(),
  };
  await libraryStorage.add(book, file, entry);
  existing.add(id);
  return entry;
}

export const sample = {
  title: 'The Quiet Atlas',
  author: 'x-reader editions',
  cover: '/books/quiet-atlas-cover.png',
  source: '/books/the-quiet-atlas.pdf',
};

export type Filter = 'all' | 'reading' | 'finished';
export type Sort = 'recent' | 'title' | 'author';
export function matchesFilter(book: ShelfEntry, filter: Filter) {
  if (filter === 'finished') return book.finished;
  if (filter === 'reading') return book.openedAt > 0 && !book.finished;
  return true;
}

export function shelfView(books: ShelfEntry[], filter: Filter, query: string, sort: Sort) {
  const term = query.trim().toLocaleLowerCase();
  return books
    .filter(
      (book) =>
        matchesFilter(book, filter) &&
        (book.title + ' ' + book.author).toLocaleLowerCase().includes(term),
    )
    .sort((a, b) =>
      sort === 'recent'
        ? Math.max(b.openedAt, b.addedAt) - Math.max(a.openedAt, a.addedAt)
        : a[sort].localeCompare(b[sort]),
    );
}
