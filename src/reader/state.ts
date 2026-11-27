export type Theme = 'Paper' | 'Sepia' | 'Sage' | 'Dusk' | 'Night';
export type Typeface = 'Literata' | 'Georgia' | 'Sans serif' | 'OpenDyslexic';
export type ReadingMode = 'flow' | 'pdf';

export interface Preferences {
  theme: Theme;
  typeface: Typeface;
  layout: 'single' | 'double';
  width: 'Narrow' | 'Comfort' | 'Wide';
  size: number;
  spacing: number;
}

/** A UTF-16 text offset in the sanitized chapter, independent of pagination. */
export interface Location {
  chapter: number;
  offset: number;
}

export interface Passage {
  start: Location;
  end: Location;
  quote: string;
}

export interface Annotation extends Passage {
  id: string;
  note: string;
}

export interface Bookmark {
  id: string;
  label: string;
  mode: ReadingMode;
  flow: Location;
  pdfPage: number;
  progress: number;
}

export interface ReadingState {
  mode: ReadingMode;
  flow: Location;
  pdfPage: number;
  pdfVisited: boolean;
  flowVisited: boolean;
  progress: number;
  preferences: Preferences;
  bookmarks: Bookmark[];
  annotations: Annotation[];
}

export function freshReadingState(): ReadingState {
  return {
    mode: 'flow',
    flow: { chapter: 0, offset: 0 },
    flowVisited: false,
    pdfPage: 1,
    pdfVisited: false,
    progress: 0,
    preferences: {
      theme: 'Paper',
      typeface: 'Literata',
      layout: 'double',
      width: 'Comfort',
      size: 18,
      spacing: 1.65,
    },
    bookmarks: [],
    annotations: [],
  };
}

export function sameLocation(a: Location, b: Location) {
  return a.chapter === b.chapter && a.offset === b.offset;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
