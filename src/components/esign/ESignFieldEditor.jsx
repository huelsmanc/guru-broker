import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, Trash2, PenTool, Calendar, Type, CaseSensitive, Sparkles } from 'lucide-react';
import PDFPageRenderer from './PDFPageRenderer';
import { fieldStyle, heightPct, fieldSignerIndex } from '../../../shared/esignGeometry.js';

export const FIELD_TYPES = [
  { id: 'signature', label: 'Signature', icon: PenTool, w: 0.30, h: 0.055 },
  { id: 'initial', label: 'Initials', icon: CaseSensitive, w: 0.09, h: 0.045 },
  { id: 'date', label: 'Date signed', icon: Calendar, w: 0.18, h: 0.03 },
  { id: 'text', label: 'Text', icon: Type, w: 0.30, h: 0.03 },
];

export const SIGNER_COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#db2777', '#0891b2'];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Place, move and resize signing fields on a document.
 * Works with mouse and touch. Every field is assigned to a signer; the sidebar
 * shows which signers still have nothing to sign.
 */
export default function ESignFieldEditor({ doc, onComplete, onAutoDetect }) {
  const signers = doc.signers || [];
  const [fields, setFields] = useState(() => (doc.fields || []).map((f, i) => ({ ...f, id: f.id || `field-${i}-${Date.now()}` })));
  const [layout, setLayout] = useState(null); // { width, height, ratio }
  const [placing, setPlacing] = useState(null); // field type id
  const [activeSigner, setActiveSigner] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const normalized = useRef(false);

  // Old fields stored height in pixels; convert them once the document is laid out.
  useEffect(() => {
    if (!layout || normalized.current) return;
    normalized.current = true;
    setFields((prev) => prev.map((f) => (typeof f.hPct === 'number' ? f : {
      ...f,
      hPct: ((Number(f.height) || 40) / layout.height) * 100,
    })));
  }, [layout]);

  // Auto-save.
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) { firstSave.current = false; return; }
    const t = setTimeout(() => {
      base44.entities.ESignDocument.update(doc.id, { fields }).catch((err) => console.error('Auto-save failed:', err));
    }, 700);
    return () => clearTimeout(t);
  }, [fields, doc.id]);

  const updateField = useCallback((id, patch) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const selected = fields.find((f) => f.id === selectedId) || null;

  // Place a new field centred where the user clicked or tapped.
  const handlePlace = (e) => {
    if (!placing || !layout) return;
    const rect = containerRef.current.getBoundingClientRect();
    const def = FIELD_TYPES.find((t) => t.id === placing);
    const wPct = def.w * 100;
    const hPct = (def.h / layout.ratio) * 100;
    const xPct = ((e.clientX - rect.left) / rect.width) * 100 - wPct / 2;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100 - hPct / 2;
    const field = {
      id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: placing,
      x: clamp(xPct, 0, 100 - wPct),
      y: clamp(yPct, 0, 100 - hPct),
      width: wPct,
      hPct,
      required: true,
      value: '',
      signer_index: activeSigner,
    };
    setFields((prev) => [...prev, field]);
    setSelectedId(field.id);
    setPlacing(null);
  };

  // Drag to move / drag the corner to resize.
  const startDrag = (e, field, mode) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(field.id);
    const rect = containerRef.current.getBoundingClientRect();
    dragRef.current = {
      id: field.id, mode, rect,
      startX: e.clientX, startY: e.clientY,
      x: field.x, y: field.y, w: field.width, h: heightPct(field, layout?.ratio || 1.3),
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onDragMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();
    const dx = ((e.clientX - d.startX) / d.rect.width) * 100;
    const dy = ((e.clientY - d.startY) / d.rect.height) * 100;
    if (d.mode === 'move') {
      updateField(d.id, { x: clamp(d.x + dx, 0, 100 - d.w), y: clamp(d.y + dy, 0, 100 - d.h) });
    } else {
      const minH = (0.015 / (layout?.ratio || 1.3)) * 100;
      updateField(d.id, {
        width: clamp(d.w + dx, 4, 100 - d.x),
        hPct: clamp(d.h + dy, minH, 100 - d.y),
      });
    }
  };
  const endDrag = () => { dragRef.current = null; };

  const removeField = (id) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // Keyboard: delete selected field.
  useEffect(() => {
    const onKey = (e) => {
      if (!selectedId) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
        removeField(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const signersWithoutSignature = useMemo(() => signers
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => !fields.some((f) => fieldSignerIndex(f) === i && (f.type === 'signature' || f.type === 'initial'))),
  [signers, fields]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await base44.entities.ESignDocument.update(doc.id, { fields });
      onComplete?.(fields);
    } catch (err) {
      setError('Could not save fields: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const saveAsTemplate = async () => {
    setSaving(true);
    setError(null);
    try {
      await base44.entities.ESignTemplate.create({
        brokerage_id: doc.brokerage_id,
        title: doc.title,
        document_url: doc.document_url,
        fields: fields.map(({ id, ...rest }) => rest),
        created_by_email: doc.created_by_email,
      });
    } catch (err) {
      setError('Failed to save template: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const autoDetect = async () => {
    if (!onAutoDetect) return;
    setDetecting(true);
    setError(null);
    try {
      const found = await onAutoDetect({ doc, signers, layout });
      if (found?.length) setFields((prev) => [...prev, ...found]);
      else setError('No signature lines were found. You can place fields by hand.');
    } catch (err) {
      setError('Auto-detect failed: ' + (err.message || err));
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 py-2">
      <div className="lg:col-span-2 space-y-2">
        {placing && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800 flex justify-between items-center">
            <span>Tap the document where the {FIELD_TYPES.find((t) => t.id === placing)?.label.toLowerCase()} should go.</span>
            <button className="text-blue-700 underline text-xs" onClick={() => setPlacing(null)}>Cancel</button>
          </div>
        )}
        <div className="border border-border/50 rounded-lg overflow-auto bg-slate-100" style={{ maxHeight: '72vh' }}>
          <PDFPageRenderer url={doc.document_url} containerRef={containerRef} onLayout={setLayout}>
            <div
              className={`absolute inset-0 z-10 ${placing ? 'cursor-crosshair' : ''}`}
              onPointerDown={(e) => { if (placing) handlePlace(e); else setSelectedId(null); }}
            />
            {layout && fields.map((field) => {
              const color = SIGNER_COLORS[fieldSignerIndex(field) % SIGNER_COLORS.length];
              const isSel = field.id === selectedId;
              const def = FIELD_TYPES.find((t) => t.id === field.type);
              return (
                <div
                  key={field.id}
                  className="absolute z-20 rounded-[3px] flex items-center justify-center overflow-visible"
                  style={{
                    ...fieldStyle(field, layout.ratio),
                    border: `2px ${isSel ? 'solid' : 'dashed'} ${color}`,
                    background: `${color}1f`,
                    touchAction: 'none',
                    cursor: 'move',
                  }}
                  onPointerDown={(e) => startDrag(e, field, 'move')}
                  onPointerMove={onDragMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <span className="text-[11px] font-semibold truncate px-1 pointer-events-none" style={{ color }}>
                    {field.value?.trim() ? field.value : def?.label || field.type}
                  </span>
                  {isSel && (
                    <>
                      <button
                        className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                        aria-label="Remove field"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <div
                        className="absolute -bottom-2 -right-2 w-5 h-5 rounded-full border-2 border-white shadow"
                        style={{ background: color, cursor: 'nwse-resize', touchAction: 'none' }}
                        onPointerDown={(e) => startDrag(e, field, 'resize')}
                        onPointerMove={onDragMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        aria-label="Resize field"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </PDFPageRenderer>
        </div>
      </div>

      <div className="space-y-5">
        {signers.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Placing fields for</p>
            <div className="space-y-1.5">
              {signers.map((s, i) => (
                <button key={i} onClick={() => setActiveSigner(i)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm flex items-center gap-2 border ${activeSigner === i ? 'border-transparent text-white' : 'border-border/60 bg-background'}`}
                  style={activeSigner === i ? { background: SIGNER_COLORS[i % SIGNER_COLORS.length] } : {}}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: activeSigner === i ? '#fff' : SIGNER_COLORS[i % SIGNER_COLORS.length] }} />
                  <span className="truncate">{s.name || s.email}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-sm font-medium mb-2">Add a field</p>
          <div className="grid grid-cols-2 gap-2">
            {FIELD_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.id} disabled={!layout} onClick={() => setPlacing(placing === t.id ? null : t.id)}
                  className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 disabled:opacity-40 ${placing === t.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-border/40 hover:border-foreground/40'}`}>
                  <Icon className="w-4 h-4" /> {t.label}
                </button>
              );
            })}
          </div>
          {onAutoDetect && (
            <Button variant="outline" className="w-full mt-2 gap-2" disabled={!layout || detecting} onClick={autoDetect}>
              {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {detecting ? 'Finding signature lines…' : 'Auto-place fields with AI'}
            </Button>
          )}
        </div>

        {selected && (
          <div className="rounded-lg border border-border/60 p-3 space-y-3">
            <p className="text-sm font-medium">Selected: {FIELD_TYPES.find((t) => t.id === selected.type)?.label}</p>
            {signers.length > 0 && (
              <label className="block text-xs text-muted-foreground">
                Signer
                <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  value={fieldSignerIndex(selected)}
                  onChange={(e) => updateField(selected.id, { signer_index: Number(e.target.value) })}>
                  {signers.map((s, i) => <option key={i} value={i}>{s.name || s.email}</option>)}
                </select>
              </label>
            )}
            <label className="block text-xs text-muted-foreground">
              Type
              <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                value={selected.type} onChange={(e) => updateField(selected.id, { type: e.target.value })}>
                {FIELD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            {selected.type === 'text' && (
              <label className="block text-xs text-muted-foreground">
                Pre-fill (signer can't change it)
                <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  value={selected.value || ''} placeholder="Leave empty for the signer to fill"
                  onChange={(e) => updateField(selected.id, { value: e.target.value })} />
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.required !== false}
                onChange={(e) => updateField(selected.id, { required: e.target.checked })} />
              Required
            </label>
            <Button variant="outline" size="sm" className="w-full gap-2 text-destructive" onClick={() => removeField(selected.id)}>
              <Trash2 className="w-4 h-4" /> Remove field
            </Button>
          </div>
        )}

        <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
          <p className="font-medium">{fields.length} field{fields.length === 1 ? '' : 's'} placed</p>
          {signersWithoutSignature.length > 0 && signers.length > 0 && (
            <p className="text-amber-700 text-xs">
              No signature or initials yet for: {signersWithoutSignature.map(({ s }) => s.name || s.email).join(', ')}
            </p>
          )}
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/40 rounded-lg p-3 flex gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Done
          </Button>
          <Button variant="outline" onClick={saveAsTemplate} disabled={saving || fields.length === 0}>Save as template</Button>
        </div>
      </div>
    </div>
  );
}
