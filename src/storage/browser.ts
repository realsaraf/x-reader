import type { LibraryStorage } from './index';
import type { Book, ShelfEntry } from '../model';

const stores = ['shelf', 'books', 'sources'];
let database: Promise<IDBDatabase> | undefined;

function openLibrary() {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('x-reader-library', 1);
      request.onupgradeneeded = () => {
        for (const name of stores) request.result.createObjectStore(name);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        database = undefined;
        reject(request.error);
      };
    });
  }
  return database;
}

async function read<T>(store: string, key?: string): Promise<T> {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const table = db.transaction(store).objectStore(store);
    const request = key === undefined ? table.getAll() : table.get(key);
    request.onsuccess = () =>
      request.result === undefined
        ? reject(new Error('This book could not be found.'))
        : resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function write(names: string[], change: (tx: IDBTransaction) => void) {
  const db = await openLibrary();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('The library change could not be saved.'));
    tx.onerror = (event) =>
      reject(
        (event.target as IDBRequest | null)?.error ??
          tx.error ??
          new Error('The library write failed.'),
      );
    try {
      change(tx);
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

export const browserStorage: LibraryStorage = {
  list: () => read<ShelfEntry[]>('shelf'),
  getBook: (id) => read<Book>('books', id),
  getSource: async (id) => {
    const source = await read<Blob | ArrayBuffer>('sources', id);
    return source instanceof Blob ? source : new Blob([source]);
  },
  add: async (book, source, entry) => {
    // WebKit can reject File/Blob writes in ephemeral browsing contexts.
    // Read the bytes before opening the transaction so it stays active.
    const bytes = await source.arrayBuffer();
    await write(stores, (tx) => {
      tx.objectStore('books').add(book, book.id);
      tx.objectStore('sources').add(bytes, book.id);
      tx.objectStore('shelf').add(entry, book.id);
    });
  },
  update: (entry) => write(['shelf'], (tx) => tx.objectStore('shelf').put(entry, entry.id)),
  remove: (id) =>
    write(stores, (tx) => {
      for (const name of stores) tx.objectStore(name).delete(id);
    }),
};
