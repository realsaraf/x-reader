import { describe, expect, it } from 'vitest';
import { locationOf, markAnnotations, Pagination } from './pagination';
import type { Annotation } from './state';

describe('character locators', () => {
  it('keeps UTF-16 offsets stable across nested typography and overlapping annotations', () => {
    const root = document.createElement('article');
    root.innerHTML = '<section data-chapter="3"><p>First <em>edition</em> ✨</p></section>';
    const section = root.firstElementChild as HTMLElement;
    const note: Annotation = {
      id: 'a',
      start: { chapter: 3, offset: 3 },
      end: { chapter: 3, offset: 12 },
      quote: 'st editio',
      note: '',
    };
    markAnnotations(section, 3, [note, { ...note, id: 'b', end: { chapter: 3, offset: 14 } }]);
    expect(section.textContent).toBe('First edition ✨');
    const emphasized = section.querySelector('em mark')!.firstChild!;
    expect(locationOf(root, emphasized, 2)).toEqual({ chapter: 3, offset: 8 });
    expect([...section.querySelectorAll('mark')].map((mark) => mark.textContent).join('')).toBe(
      'st edition ',
    );
  });

  it('retains subpixel column width when turning through a long chapter', () => {
    const article = document.createElement('article');
    article.style.columnGap = '56px';
    Object.defineProperty(article, 'clientWidth', { value: 684 });
    Object.defineProperty(article, 'scrollWidth', { value: 34701 });
    article.getBoundingClientRect = () => DOMRect.fromRect({ width: 683.5 });
    const pages = new Pagination(article);
    pages.show(32);
    expect(article.style.transform).toBe('translateX(-23664px)');
  });
});
