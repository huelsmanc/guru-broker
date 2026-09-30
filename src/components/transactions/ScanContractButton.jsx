import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ScanLine, Loader2, AlertTriangle } from 'lucide-react';

// "Scan a contract with AI": upload a PDF or phone photo, get the terms and dates back.
export default function ScanContractButton({ onResult, label = 'Scan a contract with AI' }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const scan = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const urls = [];
      for (const file of Array.from(files).slice(0, 10)) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        urls.push({ url: file_url, name: file.name });
      }
      const res = await base44.functions.invoke('aiScanDocument', { file_urls: urls.map((u) => u.url) });
      setResult(res.data.result);
      onResult?.(res.data.result, urls);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input ref={input} type="file" accept="application/pdf,image/*" multiple capture="environment" className="hidden"
        onChange={(e) => scan(e.target.files)} />
      <Button type="button" variant="outline" className="w-full gap-2 border-dashed" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
        {busy ? 'Reading the document…' : label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {result && (
        <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs space-y-2">
          <p><span className="font-semibold">{result.document_type}.</span> {result.summary}</p>
          {result.issues?.length > 0 && (
            <div className="space-y-1">
              <p className="font-semibold flex items-center gap-1 text-amber-700"><AlertTriangle className="w-3.5 h-3.5" /> Needs attention</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {result.issues.map((i, k) => (
                  <li key={k} className={i.severity === 'high' ? 'text-red-700' : ''}>
                    {i.description}{i.page ? ` (page ${i.page})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-muted-foreground">Fields below were filled from the document. Check them before saving.</p>
        </div>
      )}
    </div>
  );
}
