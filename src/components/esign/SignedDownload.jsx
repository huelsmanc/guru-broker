import React, { useEffect, useRef, useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Links to a signed document ("/api/fn/viewSignedDocument?...") can be downloaded with the
// signing certificate pages at the end, or as the signed document alone.
export const isSignedLink = (u) => typeof u === 'string' && u.includes('viewSignedDocument');
const withParam = (u, extra) => `${u}${u.includes('?') ? '&' : '?'}${extra}`;
export const signedDownloadUrl = (u, certificate = true) => withParam(u, certificate ? 'download=1' : 'download=1&certificate=0');

export default function SignedDownload({ url, label = 'Download', className, iconOnly }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" title="Download the signed document" onClick={() => setOpen((o) => !o)}
        className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted', className)}>
        <Download className="w-3.5 h-3.5" />{!iconOnly && <>{label}<ChevronDown className="w-3 h-3" /></>}
      </button>
      {open && (
        <span className="absolute right-0 top-full mt-1 z-30 w-56 rounded-md border bg-popover shadow-lg py-1 text-sm">
          <a href={signedDownloadUrl(url, true)} onClick={() => setOpen(false)} className="block px-3 py-2 hover:bg-muted">
            With signing certificate<span className="block text-xs text-muted-foreground">Signer names, times and IP addresses on the last page</span>
          </a>
          <a href={signedDownloadUrl(url, false)} onClick={() => setOpen(false)} className="block px-3 py-2 hover:bg-muted">
            Without certificate<span className="block text-xs text-muted-foreground">Just the signed document</span>
          </a>
        </span>
      )}
    </span>
  );
}
