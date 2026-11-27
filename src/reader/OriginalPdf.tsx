import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';

interface Props {
  source: Blob;
  page: number;
}

export default function OriginalPdf({ source, page }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () =>
      setSize((s) =>
        s.width === el.clientWidth && s.height === el.clientHeight
          ? s
          : { width: el.clientWidth, height: el.clientHeight },
      );
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    let opened: PDFDocumentProxy | undefined;
    setDoc(null);
    setError('');
    import('../importers/pdf')
      .then(({ openPdf }) => openPdf(source))
      .then((document) => {
        if (!active) {
          void document.loadingTask.destroy();
          return;
        }
        opened = document;
        setDoc(document);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
      if (opened) void opened.loadingTask.destroy();
    };
  }, [source]);

  useEffect(() => {
    if (!doc || !size.width || !size.height || !paper.current) return;
    const container = paper.current;
    let active = true;
    let task: RenderTask | undefined;
    setError('');
    setReady(false);
    container.replaceChildren();
    const render = async () => {
      const pdfPage = await doc.getPage(page);
      if (!active) return;
      const original = pdfPage.getViewport({ scale: 1 });
      const scale =
        Math.min((size.width - 40) / original.width, (size.height - 28) / original.height) * zoom;
      const viewport = pdfPage.getViewport({ scale: Math.max(0.05, scale) });
      // Bound the bitmap even on high-DPI monitors and very large PDF pages.
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        2,
        4096 / Math.max(viewport.width, viewport.height),
      );
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width * ratio));
      canvas.height = Math.max(1, Math.round(viewport.height * ratio));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Original PDF, page ${page} of ${doc.numPages}`);
      task = pdfPage.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await task.promise;
      if (active) {
        container.replaceChildren(canvas);
        setReady(true);
      }
    };
    render().catch((reason) => {
      if (active) setError(String(reason));
    });
    return () => {
      active = false;
      task?.cancel();
    };
  }, [doc, page, size, zoom]);

  return (
    <div className="xr-original">
      <div className="xr-pdf-scroll" ref={host}>
        <div ref={paper} className="xr-pdf-paper" />
        {!ready && (
          <p role="status" className="xr-pdf-message">
            {error || 'Opening original page…'}
          </p>
        )}
      </div>
      <div className="xr-pdf-zoom" aria-label="PDF zoom">
        <button
          aria-label="Zoom out"
          title="Zoom out"
          disabled={zoom <= 0.75}
          onClick={() => setZoom((z) => z - 0.25)}
        >
          <ZoomOut size={16} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          aria-label="Zoom in"
          title="Zoom in"
          disabled={zoom >= 3}
          onClick={() => setZoom((z) => z + 0.25)}
        >
          <ZoomIn size={16} />
        </button>
        <button aria-label="Fit PDF page" title="Fit page" onClick={() => setZoom(1)}>
          <Maximize size={15} />
        </button>
      </div>
    </div>
  );
}
