import { isTauri } from '@tauri-apps/api/core';
import { browserStorage } from './browser';
import { nativeStorage } from './native';
import type { Book, ShelfEntry } from '../model';

export interface LibraryStorage {
  list(): Promise<ShelfEntry[]>;
  getBook(id: string): Promise<Book>;
  getSource(id: string): Promise<Blob>;
  add(book: Book, source: Blob, entry: ShelfEntry): Promise<void>;
  update(entry: ShelfEntry): Promise<void>;
  remove(id: string): Promise<void>;
}

export const libraryStorage: LibraryStorage = isTauri() ? nativeStorage : browserStorage;
