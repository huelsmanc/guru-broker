import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { stackRatio } from '../../../shared/esignGeometry.js';

// pdf.js is loaded once and shared.
let pdfjsPromise;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.js`;
      return lib;
    });
  }
  return pdfjsPromise;
}

export function isPdfUrl(url = '') {
  // Private files are /api/file?p=<path>; look at the stored file name.
  const m = String(url).match(/\/api\/file\?(?:[^#]*&)?p=([^&#]+)/);
  const clean = (m ? decodeURIComponent(m[1]) : String(url).split('?')[0]).toLowerCase();
  return clean.endsWith('.pdf') || String(url).includes('application/pdf');
}

/**
 * Shows a document (PDF or image) as pages stacked at full container width, with
 * `children` laid over it as absolutely positioned overlays. The editor, the signing
 * page and the final PDF all use this same layout, so fields land in the same place
 * everywhere (see shared/esignGeometry.js).
 *
 * onLayout({ width, height, ratio, pages }) fires whenever the rendered size changes.
 */
export default function PDFPageRenderer({ url, children, onLayout, onHeightReady, containerRef: externalRef }) {
  const internalRef = useRef(null);
  const containerRef = externalRef || internalRef;
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState(null); // [{ width, height }] in points
  const [error, setError] = useState(null);
  const pdfRef = useRef(null);
  const canvasRefs = useRef([]);
  const renderTask = useRef(0);
  const isPdf = isPdfUrl(url);

  // Track the container width.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  // Load the document and read page sizes.
  useEffect(() => {
    let cancelled = false;
    setPages(null);
    setError(null);
    if (!url) return;
    if (!isPdf) {
      const img = new Image();
      img.onload = () => !cancelled && setPages([{ width: img.naturalWidth, height: img.naturalHeight }]);
      img.onerror = () => !cancelled && setError('This document could not be loaded.');
      img.src = url;
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const lib = await loadPdfjs();
        const pdf = await lib.getDocument({ url, withCredentials: false }).promise;
        const sizes = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const vp = (await pdf.getPage(i)).getViewport({ scale: 1 });
          sizes.push({ width: vp.width, height: vp.height });
        }
        if (!cancelled) {
          pdfRef.current = pdf;
          setPages(sizes);
        }
      } catch (err) {
        console.error('PDF load error:', err);
        if (!cancelled) setError('This document could not be loaded. Try re-uploading it as a PDF.');
      }
    })();
    return () => { cancelled = true; };
  }, [url, isPdf]);

  const ratio = pages ? stackRatio(pages) : 1.294;
  const totalHeight = width ? width * ratio : 0;

  // Report layout.
  useEffect(() => {
    if (!pages || !width) return;
    onLayout?.({ width, height: totalHeight, ratio, pages });
    onHeightReady?.(totalHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, width]);

  // Draw PDF pages at the current width (sharp on high-DPI screens).
  // Each page is drawn on its own off-screen canvas and copied over when finished, and an
  // older drawing is cancelled first: two drawings into one canvas at once (e.g. while a
  // dialog is still opening and the width changes) used to leave pages small and upside down.
  const activeRenders = useRef([]);
  const [drawWidth, setDrawWidth] = useState(0);
  useEffect(() => {
    if (!width) return undefined;
    const t = setTimeout(() => setDrawWidth(width), drawWidth ? 150 : 0); // wait for resizing to settle
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);
  useEffect(() => {
    if (!isPdf || !pages || !drawWidth || !pdfRef.current) return undefined;
    const task = ++renderTask.current;
    for (const r of activeRenders.current) { try { r.cancel(); } catch { /* already done */ } }
    activeRenders.current = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    (async () => {
      for (let i = 0; i < pages.length; i++) {
        if (task !== renderTask.current) return;
        const page = await pdfRef.current.getPage(i + 1);
        if (task !== renderTask.current) return;
        const vp = page.getViewport({ scale: (drawWidth / pages[i].width) * dpr });
        const off = document.createElement('canvas');
        off.width = Math.floor(vp.width);
        off.height = Math.floor(vp.height);
        const job = page.render({ canvasContext: off.getContext('2d'), viewport: vp });
        activeRenders.current.push(job);
        try {
          await job.promise;
        } catch (err) {
          if (task === renderTask.current && err?.name !== 'RenderingCancelledException') console.error('Page render error:', err);
          continue;
        }
        if (task !== renderTask.current) return;
        const canvas = canvasRefs.current[i];
        if (!canvas) continue;
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.getContext('2d').drawImage(off, 0, 0);
      }
    })();
    return undefined;
  }, [isPdf, pages, drawWidth]);

  let offset = 0;
  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height: pages && width ? `${totalHeight}px` : '420px' }}
    >
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-red-600 p-6 text-center">
          <AlertCircle className="w-6 h-6" /> {error}
        </div>
      ) : !pages || !width ? (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-gray-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading document…
        </div>
      ) : (
        <>
          {pages.map((p, i) => {
            const h = (p.height / p.width) * width;
            const top = offset;
            offset += h;
            return (
              <div
                key={i}
                className="absolute left-0 w-full pointer-events-none bg-white"
                style={{ top, height: h, borderTop: i ? '1px dashed #cbd5e1' : undefined }}
              >
                {isPdf ? (
                  <canvas ref={(el) => (canvasRefs.current[i] = el)} style={{ width: '100%', height: '100%', display: 'block' }} />
                ) : (
                  <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block' }} />
                )}
                {pages.length > 1 && (
                  <span className="absolute right-2 bottom-1 text-[10px] text-slate-400">Page {i + 1} of {pages.length}</span>
                )}
              </div>
            );
          })}
          {children}
        </>
      )}
    </div>
  );
}
