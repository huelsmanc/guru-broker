// The pages of a library file, for the preview panel. PDFs are drawn page by page in the browser;
// pictures show as they are; anything else offers a download.
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Download } from 'lucide-react';
import { isPdfName, isImageName, downloadUrl } from './libraryData';
import { FileGlyph } from './bits';

const MAX_PAGES = 30;

export default function FilePreview({ file, onPages }) {
  const [pages, setPages] = useState([]);
  const [total, setTotal] = useState(null);
  const [error, setError] = useState('');
  const box = useRef(null);
  const pdf = isPdfName(file.file_name) || /\.pdf(\?|$)/i.test(file.file_url || '');

  useEffect(() => {
    if (!pdf) return undefined;
    let live = true; let doc = null;
    setPages([]); setTotal(null); setError('');
    (async () => {
      try {
        const { openPdf, pageThumb } = await import('@/lib/pdfText');
        doc = await openPdf(file.file_url);
        if (!live) return;
        setTotal(doc.numPages);
        if (doc.numPages && doc.numPages !== file.pages) onPages?.(doc.numPages);
        const width = Math.min(760, Math.max(320, (box.current?.clientWidth || 520) - 24));
        for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES) && live; n += 1) {
          const src = await pageThumb(doc, n, width);
          if (live) setPages((p) => [...p, src]);
        }
      } catch (err) {
        if (live) setError(err?.message || 'Could not open this file');
      }
    })();
    return () => { live = false; doc?.destroy?.(); };
  }, [file.id, file.file_url]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isImageName(file.file_name)) {
    return <div ref={box} className="p-3"><img src={file.file_url} alt={file.file_name} className="mx-auto max-w-full rounded-lg shadow-sm bg-white" /></div>;
  }
  if (!pdf || error) {
    return (
      <div ref={box} className="flex flex-col items-center justify-center text-center gap-3 py-16 px-6">
        <FileGlyph name={file.file_name} className="w-14 h-14" />
        <p className="text-sm text-muted-foreground">{error ? 'This file can\'t be previewed here.' : 'No preview for this kind of file.'}</p>
        <a href={downloadUrl(file.file_url)} className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm hover:bg-muted"><Download className="w-4 h-4" /> Download</a>
      </div>
    );
  }
  return (
    <div ref={box} className="p-3 space-y-3">
      {pages.map((src, i) => (
        <div key={i} className="relative">
          <img src={src} alt={`Page ${i + 1}`} className="w-full rounded-md bg-white shadow-sm ring-1 ring-black/5" />
          <span className="absolute bottom-2 right-2 rounded-full bg-black/55 text-white text-[10px] px-2 py-0.5">{i + 1}{total ? ` / ${total}` : ''}</span>
        </div>
      ))}
      {(total === null || pages.length < Math.min(total, MAX_PAGES)) && (
        <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      )}
      {total > MAX_PAGES && pages.length >= MAX_PAGES && (
        <p className="text-center text-xs text-muted-foreground py-2">Showing the first {MAX_PAGES} of {total} pages. <a className="text-primary hover:underline" href={file.file_url} target="_blank" rel="noreferrer">Open the whole file</a></p>
      )}
    </div>
  );
}
