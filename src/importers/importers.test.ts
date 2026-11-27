import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { importBook } from './index';
import { embeddedRaster, relativePath } from './resources';
import { preparePage, reflowPage, runningMargins, type TextRun } from './pdf-layout';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const imageBytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));

function file(name: string, value: string | Uint8Array): File {
  const bytes = typeof value === 'string' ? strToU8(value) : value;
  const f = new File([new Uint8Array(bytes)], name);
  // jsdom's File implements the FileReader API but lacks Blob.arrayBuffer().
  if (!f.arrayBuffer)
    Object.defineProperty(f, 'arrayBuffer', { value: async () => bytes.slice().buffer });
  return f;
}

function archive(name: string, entries: Record<string, string | Uint8Array>) {
  return file(
    name,
    zipSync(
      Object.fromEntries(
        Object.entries(entries).map(([key, value]) => [
          key,
          typeof value === 'string' ? strToU8(value) : value,
        ]),
      ),
    ),
  );
}

function epub(toc: 'nav' | 'ncx') {
  const nav = toc === 'nav';
  return archive('collected.epub', {
    'META-INF/container.xml':
      '<container><rootfiles><rootfile full-path="Books/book.opf"/></rootfiles></container>',
    'Books/book.opf':
      '<package><metadata><title>Collected</title><creator>June Lake</creator></metadata><manifest>' +
      '<item id="c" href="Text/main.xhtml"/><item id="art" properties="cover-image" href="Art/red.png"/>' +
      '<item id="toc" href="nav.xml" ' +
      (nav ? 'properties="nav"' : 'media-type="application/x-dtbncx+xml"') +
      '/></manifest><spine toc="toc"><itemref idref="c"/></spine></package>',
    'Books/nav.xml': nav
      ? '<nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc"><ol><li><a href="Text/main.xhtml#first">Lake</a><ol><li><a href="Text/main.xhtml#next">Forest</a></li></ol></li></ol></nav>'
      : '<ncx><navMap><navPoint><navLabel><text>Lake</text></navLabel><content src="Text/main.xhtml#first"/><navPoint><navLabel><text>Forest</text></navLabel><content src="Text/main.xhtml#next"/></navPoint></navPoint></navMap></ncx>',
    'Books/Text/main.xhtml':
      '<h1 id="first">The lake</h1><p>Clouds above <em>water.</em></p><img src="../Art/red.png"/>' +
      '<h2 id="next">The forest</h2><p>Beneath the trees.</p>',
    'Books/Art/red.png': imageBytes,
  });
}

describe('book import', () => {
  it.each(['nav', 'ncx'] as const)(
    'resolves EPUB %s navigation within a spine item and preserves local art',
    async (toc) => {
      const book = await importBook(epub(toc));
      expect(book).toMatchObject({ title: 'Collected', author: 'June Lake', format: 'EPUB' });
      expect(book.chapters.map((c) => [c.title, c.depth])).toEqual([
        ['Lake', 0],
        ['Forest', 1],
      ]);
      expect(book.chapters[0].html).toContain('<em>water.</em>');
      expect(book.chapters[0].html).toContain('data:image/png;base64,');
      expect(book.chapters[0].html).not.toContain('trees');
      expect(book.cover).toContain('data:image/png;base64,');
    },
  );

  it('imports typography without source scripts, links, tracking images or event handlers', async () => {
    const book = await importBook(
      file(
        'Test.html',
        '<title>Book</title><h1>Start</h1><script>unwanted()</script>' +
          '<img src="https://example.invalid/track"><p style="display:none" onclick="bad()"><a href="https://example.invalid/">Persistent</a> <strong>words</strong></p>',
      ),
    );
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0].html).toBe('<h1>Start</h1><p>Persistent <strong>words</strong></p>');
  });

  it('retains Markdown emphasis, code and nested headings', async () => {
    const book = await importBook(
      file('Lake.md', '# Walking\n\nA *short* walk.\n\n## Map\n\nUse \x60north\x60.'),
    );
    expect(book.chapters.map((c) => c.title)).toEqual(['Walking', 'Map']);
    expect(book.chapters[0].html).toContain('<em>short</em>');
    expect(book.chapters[1].html).toContain('<code>north</code>');
  });

  it('rejoins wrapped text and retains chapter boundaries', async () => {
    const book = await importBook(
      file('Walks.txt', 'Chapter I\nThe valley\nwas silent.\n\nChapter II\nAnother hill.'),
    );
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter I', 'Chapter II']);
    expect(book.chapters[0].html).toContain('The valley was silent.');
  });

  it('reads compressed FictionBook metadata, covers and nested sections', async () => {
    const xml =
      '<FictionBook xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><book-title>Tides</book-title>' +
      '<author><first-name>Luna</first-name><last-name>Hill</last-name></author><coverpage><image l:href="#red"/></coverpage></title-info></description>' +
      '<body><section><title><p>Sea</p></title><p>A <emphasis>wave</emphasis>.</p><section><title><p>Land</p></title><p>Sand.</p>' +
      '</section></section></body><binary content-type="image/png" id="red">' +
      png +
      '</binary></FictionBook>';
    const book = await importBook(archive('tides.fb2.zip', { 'book.fb2': xml }));
    expect(book).toMatchObject({
      title: 'Tides',
      author: 'Luna Hill',
      cover: 'data:image/png;base64,' + png,
    });
    expect(book.chapters.map((c) => c.depth)).toEqual([0, 1]);
    expect(book.chapters[0].html).toContain('<em>wave</em>');
  });

  it('loads Word headings, emphasis and an image relationship', async () => {
    const book = await importBook(
      archive('Draft.docx', {
        'word/document.xml':
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="urn:drawing" xmlns:r="urn:relations">' +
          '<w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Harbor</w:t></w:r></w:p>' +
          '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Water</w:t></w:r></w:p><a:blip r:embed="img"/></w:body></w:document>',
        'word/_rels/document.xml.rels':
          '<Relationships><Relationship Id="img" Target="media/red.png"/></Relationships>',
        'word/media/red.png': imageBytes,
      }),
    );
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0]).toMatchObject({ title: 'Harbor' });
    expect(book.chapters[0].html).toContain('<strong>Water</strong>');
    expect(book.chapters[0].html).toContain('data:image/png;');
  });

  it('reads CBZ image pages and embedded comic metadata', async () => {
    const book = await importBook(
      archive('issue.cbz', {
        '10.png': imageBytes,
        '2.png': imageBytes,
        'broken.jpg': 'text',
        'ComicInfo.xml': '<ComicInfo><Title>At sea</Title><Writer>J. May</Writer></ComicInfo>',
      }),
    );
    expect(book).toMatchObject({ title: 'At sea', author: 'J. May', format: 'CBZ' });
    expect(book.chapters.map((c) => c.title)).toEqual(['Page 1', 'Page 2']);
  });

  it('rejects empty, unknown, damaged and oversized files with an error', async () => {
    await expect(importBook(file('empty.txt', ''))).rejects.toThrow(/empty/i);
    await expect(importBook(file('test.abc', 'hello'))).rejects.toThrow(/unsupported/i);
    await expect(importBook(file('broken.epub', 'broken'))).rejects.toThrow();
    await expect(importBook(file('lost.mobi', 'broken'))).rejects.toThrow(/MOBI/);
    const large = file('large.txt', 'x');
    Object.defineProperty(large, 'size', { value: 130 * 1024 * 1024 });
    await expect(importBook(large)).rejects.toThrow(/128 MiB/);
  });
});

describe('resource boundaries', () => {
  it('keeps relative archive references inside the book', () => {
    expect(relativePath('Books/Text/main.htm', '../Art/red%20ink.png#section')).toBe(
      'Books/Art/red ink.png',
    );
    for (const url of [
      '../../../secret',
      '/file',
      '//remote',
      'file:///etc/passwd',
      'https://example.invalid/',
      'bad%Y0',
    ])
      expect(relativePath('Books/Text/main.htm', url)).toBeUndefined();
    expect(embeddedRaster('data:image/png;base64,PHN2Zz4=')).toBeUndefined();
  });
});

describe('PDF reflow', () => {
  it('preserves heading, reading order, figures, and words separated by a line-end hyphen', () => {
    const run = (text: string, y: number, height = 12): TextRun => ({
      text,
      x: 40,
      y,
      height,
      width: 200,
      end: true,
    });
    const flow = reflowPage(
      preparePage([
        run('Harbor', 40, 22),
        run('A quiet after-', 72),
        run('noon on the bay.', 86),
        run('A boat came in.', 250),
      ]),
      [{ y: 110, html: '<figure>Boat</figure>' }],
    );
    expect(flow).toEqual({
      heading: 'Harbor',
      html: '<h2>Harbor</h2><p>A quiet afternoon on the bay.</p><figure>Boat</figure><p>A boat came in.</p>',
    });
  });

  it('removes repeated running heads and numbered footers without removing the same words in body text', () => {
    const run = (text: string, y: number, height: number): TextRun => ({
      text,
      x: 20,
      y,
      width: 100,
      height,
      end: true,
    });
    const pages = [1, 2, 3].map((n) => ({
      height: 600,
      text: preparePage([
        run('H A R B O R', 40, 8),
        run('Harbor', 160, 22),
        run('A low tide', 250, 12),
        run('shows the shore.', 266, 12),
        run('Edition ' + n, 568, 8),
      ]),
    }));
    const margins = runningMargins(pages);
    expect(reflowPage(pages[0].text, [], 600, margins).html).toBe(
      '<h2>Harbor</h2><p>A low tide shows the shore.</p>',
    );
  });
});
