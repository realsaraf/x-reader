import type { ReadingState } from './reader/state';

export interface Chapter {
  title: string;
  html: string;
  sourcePage?: number;
  depth?: number;
}

export interface ImportedBook {
  title: string;
  author: string;
  format: string;
  cover?: string;
  chapters: Chapter[];
  pageCount?: number;
}

export interface Book extends ImportedBook {
  id: string;
}

export interface ShelfEntry extends Omit<Book, 'chapters' | 'pageCount'> {
  addedAt: number;
  openedAt: number;
  finished: boolean;
  state: ReadingState;
}
