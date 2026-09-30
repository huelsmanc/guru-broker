import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Renders a PDF using pdfjs-dist onto canvas elements (sharp, high-DPI).
 * Fields passed as children are positioned as absolute overlays using
 * percentage coordinates relative to the total rendered height.
 */
export default function PDFPageRenderer({ url, children, onHeightReady, containerRef: externalRef }) {
  const internalRef = useRef(null);
  const containerRef = externalRef || internalRef;
  const [pages, setPages] = useState([]); // Array of { canvas element, height, width }
  const [loading, setLoading] = useState(true);
  const [totalHeight, setTotalHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const renderingRef = useRef(false);
  const urlRef = useRef(url);

  const renderPDF = useCallback(async (containerW) => {
    if (!url || renderingRef.current) return;
    renderingRef.current = true;
    setLoading(true);

    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

      const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;

      const dpr = window.devicePixelRatio || 1;
      const renderedPages = [];
      let total = 0;

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const scale = (containerW / viewport.width) * dpr;
        const scaledViewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        // CSS size = logical pixels (not device pixels)
        canvas.style.width = `${scaledViewport.width / dpr}px`;
        canvas.style.height = `${scaledViewport.height / dpr}px`;

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

        const logicalHeight = scaledViewport.height / dpr;
        renderedPages.push({ canvas, height: logicalHeight, width: scaledViewport.width / dpr });
        total += logicalHeight;
      }

      setPages(renderedPages);
      setTotalHeight(total);
      if (onHeightReady) onHeightReady(total);
    } catch (err) {
      console.error('PDF render error:', err);
    } finally {
      setLoading(false);
      renderingRef.current = false;
    }
  }, [url]);

  // Watch container width via ResizeObserver so we re-render if the dialog/panel resizes
  useEffect(() => {
    if (!url) return;

    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0 && w !== containerWidth) {
        setContainerWidth(w);
      }
    });

    // Also try to get initial width immediately
    const initialW = containerRef.current?.offsetWidth;
    if (initialW && initialW > 0) {
      setContainerWidth(initialW);
    } else {
      // Fallback: wait one frame for layout
      requestAnimationFrame(() => {
        const w = containerRef.current?.offsetWidth;
        if (w && w > 0) setContainerWidth(w);
        else setContainerWidth(800);
      });
    }

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [url]);

  // Re-render PDF when we have a valid container width
  useEffect(() => {
    if (containerWidth > 0) {
      renderingRef.current = false; // allow re-render on width change
      renderPDF(containerWidth);
    }
  }, [containerWidth, url]);

  // Attach canvas elements to the DOM via refs
  const canvasContainerRefs = useRef([]);

  useEffect(() => {
    pages.forEach((p, i) => {
      const el = canvasContainerRefs.current[i];
      if (el && el.children.length === 0) {
        el.appendChild(p.canvas);
      }
    });
  }, [pages]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: loading ? '400px' : `${totalHeight}px`, overflow: 'visible' }}>
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" /> Rendering document...
        </div>
      ) : (
        <>
          {pages.map((p, i) => {
            const offsetY = pages.slice(0, i).reduce((sum, pg) => sum + pg.height, 0);
            return (
              <div
                key={i}
                ref={el => canvasContainerRefs.current[i] = el}
                className="absolute left-0 w-full pointer-events-none"
                style={{ top: `${offsetY}px`, height: `${p.height}px`, overflow: 'hidden' }}
              />
            );
          })}
          {children}
        </>
      )}
    </div>
  );
}