import { invoke } from '@tauri-apps/api/core';
import type { Book, ShelfEntry } from '../model';

/** Keep shelf mutations in user-action order even across rapid book changes. */
let writeTail: Promise<void> = Promise.resolve();
function write(action: () => Promise<void>): Promise<void> {
  const result = writeTail.then(action);
  writeTail = result.catch(() => {});
  return result;
}

export const nativeStorage = {
  async list(): Promise<ShelfEntry[]> {
    await writeTail;
    const entries = await invoke<string[]>('list_books');
    return entries.map((entry) => JSON.parse(entry) as ShelfEntry);
  },

  async getBook(id: string): Promise<Book> {
    await writeTail;
    return JSON.parse(await invoke<string>('read_book', { id })) as Book;
  },

  async getSource(id: string): Promise<Blob> {
    await writeTail;
    return new Blob([await invoke<ArrayBuffer>('read_source', { id })]);
  },

  add(book: Book, source: Blob, entry: ShelfEntry): Promise<void> {
    return write(async () => {
      const metadata = new TextEncoder().encode(JSON.stringify({ book, entry }));
      const header = new ArrayBuffer(4);
      new DataView(header).setUint32(0, metadata.byteLength, true);
      const payload = await new Blob([header, metadata, source]).arrayBuffer();
      await invoke('import_book', payload);
    });
  },

  update(entry: ShelfEntry): Promise<void> {
    const snapshot = JSON.stringify(entry);
    return write(() => invoke('update_entry', { entry: snapshot }));
  },

  remove(id: string): Promise<void> {
    return write(() => invoke('remove_book', { id }));
  },
};

/** Call before closing the desktop window if a change is still being saved. */
export async function flushNativeWrites(): Promise<void> {
  await writeTail;
}
