import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, Trash2, PenTool, Calendar, Type, CaseSensitive, Sparkles, Strikethrough, CheckSquare, CircleDot, ListChecks, Paperclip, Copy, Home, Check } from 'lucide-react';
import PDFPageRenderer from './PDFPageRenderer';
import { fieldStyle, heightPct, fieldSignerIndex, textPx } from '../../../shared/esignGeometry.js';
import { fieldLook, textCss, strikePx, STYLED_TYPES } from '../../../shared/esignStyle.js';
import FieldStyleBar from './FieldStyleBar';

export const FIELD_TYPES = [
  { id: 'signature', label: 'Signature', icon: PenTool, w: 0.30, h: 0.055 },
  { id: 'initial', label: 'Initials', icon: CaseSensitive, w: 0.09, h: 0.045 },
  { id: 'date', label: 'Date signed', icon: Calendar, w: 0.18, h: 0.03 },
  { id: 'text', label: 'Text', icon: Type, w: 0.30, h: 0.03 },
  { id: 'checkbox', label: 'Checkbox', icon: CheckSquare, w: 0.028, h: 0.028 },
  { id: 'radio', label: 'Choose one', icon: CircleDot, w: 0.028, h: 0.028 },
  { id: 'dropdown', label: 'Dropdown', icon: ListChecks, w: 0.22, h: 0.03 },
  { id: 'attachment', label: 'Attach a file', icon: Paperclip, w: 0.28, h: 0.03 },
  { id: 'strike', label: 'Strike out', icon: Strikethrough, w: 0.30, h: 0.012 },
];

const money = (v) => (v == null || v === '' ? '' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
const usDate = (d) => { if (!d) return ''; const [y, m, day] = String(d).slice(0, 10).split('-'); return y && m && day ? `${m}/${day}/${y}` : String(d); };
const listOf = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? x.name : x)).filter(Boolean).join(', ') : v || '');
const usDateTime = (d) => { if (!d) return ''; const t = new Date(d); return Number.isNaN(t.getTime()) ? String(d) : t.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const days = (v) => (v == null || v === '' ? '' : String(v));
const today = () => new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

// Deal facts a box can be tied to. On a template the box stays blank and fills itself in
// from whichever deal the form is used on.
// Works with a transaction, an offer, or both merged ({ ...deal, ...offer }).
export const DEAL_KEYS = [
  { key: 'property_address', label: 'Property address', get: (d) => d.property_address },
  { key: 'city', label: 'City', get: (d) => d.city },
  { key: 'state', label: 'State', get: (d) => d.state },
  { key: 'zip', label: 'ZIP', get: (d) => d.zip },
  { key: 'full_address', label: 'Full address', get: (d) => [d.property_address, d.city, [d.state, d.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') },
  { key: 'mls_number', label: 'MLS #', get: (d) => d.mls_number },
  { key: 'sale_price', label: 'Price', get: (d) => money(d.offer_price ?? d.sale_price) },
  { key: 'list_price', label: 'List price', get: (d) => money(d.list_price) },
  { key: 'buyers', label: 'Buyer(s)', get: (d) => listOf(d.buyers) || d.buyer_name },
  { key: 'sellers', label: 'Seller(s)', get: (d) => listOf(d.sellers) || d.seller_name },
  { key: 'earnest_money', label: 'Earnest money', get: (d) => money(d.earnest_money) },
  { key: 'financing_type', label: 'Financing type', get: (d) => (d.financing_type === 'cash' ? 'Cash' : d.financing_type || '') },
  { key: 'down_payment_percent', label: 'Down payment %', get: (d) => (d.down_payment_percent == null || d.down_payment_percent === '' ? '' : `${d.down_payment_percent}%`) },
  { key: 'loan_amount', label: 'Loan amount', get: (d) => money(d.loan_amount) },
  { key: 'inspection_days', label: 'Inspection days', get: (d) => days(d.inspection_days) },
  { key: 'financing_days', label: 'Financing days', get: (d) => days(d.financing_days) },
  { key: 'seller_concessions', label: 'Seller concessions', get: (d) => money(d.seller_concessions) },
  { key: 'included_items', label: 'Included items', get: (d) => d.included_items },
  { key: 'special_terms', label: 'Special terms', get: (d) => d.special_terms },
  { key: 'offer_expiration', label: 'Offer expires', get: (d) => usDateTime(d.offer_expiration) },
  { key: 'closing_date', label: 'Closing date', get: (d) => usDate(d.closing_date) },
  { key: 'acceptance_date', label: 'Acceptance date', get: (d) => usDate(d.acceptance_date) },
  { key: 'inspection_date', label: 'Inspection deadline', get: (d) => usDate(d.inspection_contingency_date || d.inspection_date) },
  { key: 'agent_name', label: 'Agent', get: (d) => d.agent_name },
  { key: 'agent_email', label: 'Agent email', get: (d) => d.agent_email },
  { key: 'listing_agent_name', label: 'Listing agent', get: (d) => d.listing_agent_name },
  { key: 'brokerage_name', label: 'Brokerage', get: (d) => d.brokerage_name },
  { key: 'today', label: "Today's date", get: () => today() },
];

// Facts with a few set answers: a checkbox can tick itself when the fact matches.
export const CHOICE_KEYS = [
  { key: 'financing_type', label: 'Financing', options: ['conventional', 'FHA', 'VA', 'USDA', 'cash', 'other'], get: (d) => d.financing_type || '' },
  { key: 'appraisal_contingency', label: 'Appraisal contingency', options: ['yes', 'no'], get: (d) => (d.appraisal_contingency == null ? '' : d.appraisal_contingency === false ? 'no' : 'yes') },
  { key: 'inspection_contingency', label: 'Inspection contingency', options: ['yes', 'no'], get: (d) => (d.inspection_days == null && !d.inspection_contingency_date ? '' : Number(d.inspection_days) > 0 || d.inspection_contingency_date ? 'yes' : 'no') },
  { key: 'financing_contingency', label: 'Financing contingency', options: ['yes', 'no'], get: (d) => (d.financing_type === 'cash' ? 'no' : d.financing_days == null && !d.financing_contingency_date ? '' : 'yes') },
  { key: 'seller_concessions_any', label: 'Seller concessions', options: ['yes', 'no'], get: (d) => (d.seller_concessions == null || d.seller_concessions === '' ? '' : Number(d.seller_concessions) > 0 ? 'yes' : 'no') },
];

/** Facts from the deal that can be dropped onto the document as pre-filled text. */
export function dealFacts(deal) {
  if (!deal) return [];
  return DEAL_KEYS.map((k) => ({ key: k.key, label: k.label, value: String(k.get(deal) || '') })).filter((f) => f.value);
}

/** Fills boxes tied to a deal fact (from a template) with this deal's values. */
export function fillFromDeal(fields, deal) {
  if (!deal) return fields;
  return (fields || []).map((f) => {
    if (f.type === 'checkbox' && f.deal_key && f.deal_equals) {
      const c = CHOICE_KEYS.find((x) => x.key === f.deal_key);
      const v = c ? c.get(deal) : '';
      return v ? { ...f, value: String(v).toLowerCase() === String(f.deal_equals).toLowerCase() ? 'X' : '', sender_fill: true } : f;
    }
    if (!f.deal_key || String(f.value || '').trim()) return f;
    const k = DEAL_KEYS.find((x) => x.key === f.deal_key);
    const v = k ? String(k.get(deal) || '') : '';
    return v ? { ...f, value: v, from_deal: true } : f;
  });
}

// A small preview of each field type inside its box: an icon and a label in the signer's color.
// Date and dropdown boxes show sample text in the box's own style, so style changes are visible.
function FieldPreview({ field, color, label, layout }) {
  if (field.type === 'checkbox') return <span className="w-full h-full flex items-center justify-center pointer-events-none"><Check className={`w-3/4 h-3/4 ${field.value === 'X' ? '' : 'opacity-40'}`} strokeWidth={3} style={{ color: field.value === 'X' ? '#111827' : color }} /></span>;
  if (field.type === 'radio') return <span className="w-3/5 h-3/5 rounded-full border-2 pointer-events-none" style={{ borderColor: color, background: field.value === 'X' ? color : 'transparent' }} />;
  if ((field.type === 'date' || field.type === 'dropdown') && layout) {
    const sample = field.type === 'date' ? 'MM/DD/YYYY' : `${(field.options || []).filter(Boolean)[0] || 'Choose'} ▾`;
    return <span className="w-full truncate pointer-events-none" style={{ ...textCss(field, layout.width), padding: '0 4px', opacity: 0.85 }}>{sample}</span>;
  }
  const Icon = FIELD_TYPES.find((t) => t.id === field.type)?.icon;
  const text = field.type === 'attachment' ? (field.label || 'Attach a file') : field.type === 'signature' ? (label === 'Signature' ? 'Sign here' : label) : label;
  return (
    <span className="flex items-center gap-1 min-w-0 px-1.5 pointer-events-none" style={{ color }}>
      {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.2} />}
      <span className={`text-[11px] font-semibold tracking-tight truncate ${field.type === 'signature' || field.type === 'initial' ? 'italic' : ''}`}>{text}</span>
    </span>
  );
}

// Text typed into a field, shown at the size it will print. Grows the box downward when the
// text needs more lines, so nothing is cut off.
function FieldText({ field, layout, color, editing, onChange, onGrow, onDone }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const box = el.parentElement.getBoundingClientRect();
    const need = el.scrollHeight + 2;
    if (need > box.height + 1) onGrow((need / layout.height) * 100);
  }, [field.value, field.width, field.style, layout.width, editing]);
  const style = { ...textCss(field, layout.width), padding: '1px 4px' };
  if (editing) {
    return (
      <textarea ref={ref} autoFocus value={field.value || ''} onChange={(e) => onChange(e.target.value)} onBlur={onDone}
        onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') onDone(); e.stopPropagation(); }}
        placeholder="Type to pre-fill, or leave empty for the signer"
        className="absolute inset-0 w-full resize-none bg-white/90 outline-none overflow-hidden" style={style} />
    );
  }
  return field.value?.trim()
    ? <div ref={ref} className="absolute inset-x-0 top-0 whitespace-pre-wrap break-words pointer-events-none" style={style}>{field.value}</div>
    : (
      <span className="flex items-center gap-1 min-w-0 px-1.5 pointer-events-none w-full" style={{ color, justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[fieldLook(field).align] }}>
        <Type className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.2} />
        <span className="truncate" style={{ fontSize: 11, fontWeight: fieldLook(field).bold ? 800 : 600, fontStyle: fieldLook(field).italic ? 'italic' : 'normal' }}>{field.sender_fill ? 'Agent fills: ' : ''}{field.label || 'Text'}</span>
      </span>
    );
}

// All four sides set separately (React warns when border and borderLeft are mixed between renders).
const edges = (all, left) => ({ borderTop: all, borderRight: all, borderBottom: all, borderLeft: left || all });

export const SIGNER_COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#db2777', '#0891b2'];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Place, move and resize signing fields on a document.
 * Works with mouse and touch. Every field is assigned to a signer; the sidebar
 * shows which signers still have nothing to sign.
 */
// templateMode: setting up a library form (no deal yet); `persist(fields)` saves instead of the document.
export default function ESignFieldEditor({ doc, onComplete, onAutoDetect, onChange, deal, persist, templateMode, autoRun }) {
  const signers = doc.signers || [];
  const [fields, setFields] = useState(() => (doc.fields || []).map((f, i) => ({ ...f, id: f.id || `field-${i}-${Date.now()}` })));
  const [layout, setLayout] = useState(null); // { width, height, ratio }
  const [placing, setPlacing] = useState(null); // field type id
  const [placingValue, setPlacingValue] = useState(null); // deal fact being placed as text
  const [radioGroup, setRadioGroup] = useState(null); // keeps adding options to this group
  const [templateMsg, setTemplateMsg] = useState(null);
  const [activeSigner, setActiveSigner] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
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
    onChange?.(fields);
    const t = setTimeout(() => {
      (persist ? persist(fields) : base44.entities.ESignDocument.update(doc.id, { fields })).catch((err) => console.error('Auto-save failed:', err));
    }, 700);
    return () => clearTimeout(t);
  }, [fields, doc.id]);

  const updateField = useCallback((id, patch) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const selected = fields.find((f) => f.id === selectedId) || null;

  // New boxes start with the last style used (per kind), so a page of boxes looks consistent.
  const lastStyle = useRef({ text: null, strike: null });
  const rememberStyle = useCallback((type, style) => { lastStyle.current[type === 'strike' ? 'strike' : 'text'] = style; }, []);

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
      required: placing !== 'checkbox' && placing !== 'attachment',
      value: placingValue?.value || '',
      ...(placingValue ? { from_deal: true, deal_key: placingValue.key, label: placingValue.label, sender_fill: true } : {}),
      signer_index: activeSigner,
    };
    if (placing === 'dropdown') field.options = ['Option 1', 'Option 2'];
    if (STYLED_TYPES.has(placing) && lastStyle.current.text) field.style = { ...lastStyle.current.text };
    if (placing === 'strike' && lastStyle.current.strike) field.style = { ...lastStyle.current.strike };
    if (placing === 'attachment') field.label = 'Attach a file';
    if (placing === 'radio') {
      // Tap several times to add choices to the same group.
      const group = radioGroup || `group-${Date.now().toString(36)}`;
      const count = fields.filter((f) => f.type === 'radio' && f.group === group).length;
      Object.assign(field, { group, label: `Option ${count + 1}` });
      setRadioGroup(group);
      setFields((prev) => [...prev, field]);
      setSelectedId(field.id);
      return; // stay in "choose one" mode until Done
    }
    setFields((prev) => [...prev, field]);
    setSelectedId(field.id);
    setPlacing(null);
    setPlacingValue(null);
  };

  const stopPlacing = () => { setPlacing(null); setPlacingValue(null); setRadioGroup(null); };

  // Drop a deal fact: into the selected text box, or as a new pre-filled text box.
  const applyFact = (fact) => {
    if (selected?.type === 'text' && !String(selected.value || '').trim() && !selected.deal_key) { updateField(selected.id, { value: fact.value, from_deal: true, deal_key: fact.key, label: fact.label, sender_fill: true }); return; }
    setRadioGroup(null);
    setPlacing('text');
    setPlacingValue(fact);
  };

  // An initials box near the bottom right of every page for the chosen signer.
  const initialsEveryPage = () => {
    if (!layout?.pages?.length) return;
    setError(null);
    const ratio = layout.ratio;
    const hPct = (0.04 / ratio) * 100;
    let offset = 0;
    const add = [];
    layout.pages.forEach((p, i) => {
      const top = offset;
      const bottom = offset + p.height / p.width;
      offset = bottom;
      const has = fields.some((f) => f.type === 'initial' && fieldSignerIndex(f) === activeSigner && (f.y / 100) * ratio >= top && (f.y / 100) * ratio < bottom);
      if (has) return;
      const x = Math.max(4, 84 - (activeSigner % 6) * 11);
      add.push({ id: `field-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`, type: 'initial', x, y: ((bottom - 0.075) / ratio) * 100, width: 9, hPct, required: true, value: '', signer_index: activeSigner });
    });
    if (add.length) setFields((prev) => [...prev, ...add]);
    else setError('Every page already has initials for this signer.');
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
      if (persist) await persist(fields); else await base44.entities.ESignDocument.update(doc.id, { fields });
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
      const name = window.prompt('Name this template', doc.title || 'Template');
      if (!name) return;
      await base44.entities.ESignTemplate.create({
        brokerage_id: doc.brokerage_id,
        title: name.trim(),
        document_url: doc.document_url,
        // Pre-filled deal facts are specific to this deal; keep the boxes but empty them.
        fields: fields.map((f) => ({ ...f, value: f.from_deal ? '' : f.value })),
        roles: signers.map((s, i) => s.role || `Signer ${i + 1}`),
        created_by_email: doc.created_by_email,
      });
      setTemplateMsg(`Saved "${name.trim()}". Pick it next time under "Start from a template".`);
    } catch (err) {
      setError('Failed to save template: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  // Filling a form from an offer or deal: read it and fill the blanks right away.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoRun || !layout || autoRan.current || !onAutoDetect) return;
    autoRan.current = true;
    autoDetect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, layout]);

  const autoDetect = async () => {
    if (!onAutoDetect) return;
    setDetecting(true);
    setError(null);
    try {
      const found = await onAutoDetect({ doc, signers, layout, facts: deal || null, existing: fields });
      if (found?.length) setFields((prev) => [...prev, ...found]);
      else setError('No new blanks were found (or they already have boxes). You can place fields by hand.');
    } catch (err) {
      setError('Auto-detect failed: ' + (err.message || err));
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 py-2">
      <div className="lg:col-span-2 space-y-2 min-w-0">
        {/* Phones: who you're placing for and the field types, right above the document. */}
        <div className="lg:hidden sticky top-0 z-30 -mx-1 px-1 py-1.5 bg-background/95 backdrop-blur space-y-1.5">
          {signers.length > 1 && (
            <select value={activeSigner} onChange={(e) => setActiveSigner(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" style={{ borderLeft: `4px solid ${SIGNER_COLORS[activeSigner % SIGNER_COLORS.length]}` }}>
              {signers.map((sg, i) => <option key={i} value={i}>Placing for: {sg.name || sg.email || sg.role}</option>)}
            </select>
          )}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {FIELD_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.id} type="button" disabled={!layout} onClick={() => { setPlacingValue(null); setRadioGroup(null); setPlacing(placing === t.id ? null : t.id); }}
                  className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1 disabled:opacity-40 ${placing === t.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-border/40'}`}>
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
        {placing && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800 flex justify-between items-center">
            <span>{placing === 'strike' ? 'Tap the text you want to strike out, then drag the corner to cover it.'
              : placing === 'radio' ? 'Tap each choice on the document. The signer can pick only one of them.'
              : placingValue ? `Tap where the ${placingValue.label.toLowerCase()} should go.`
              : `Tap the document where the ${FIELD_TYPES.find((t) => t.id === placing)?.label.toLowerCase()} should go.`}</span>
            <button type="button" className="text-blue-700 underline text-xs" onClick={stopPlacing}>{placing === 'radio' ? 'Done' : 'Cancel'}</button>
          </div>
        )}
        <div className="border border-border/50 rounded-lg overflow-auto bg-slate-100 max-h-[60dvh] lg:max-h-[72dvh]">
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
                  className={`absolute z-20 flex items-center overflow-visible transition-shadow ${['checkbox', 'radio'].includes(field.type) ? 'justify-center' : 'justify-start'} ${field.type === 'radio' ? 'rounded-full' : 'rounded-[4px]'}`}
                  style={{
                    ...fieldStyle(field, layout.ratio),
                    ...(field.type === 'strike'
                      ? { ...edges(isSel ? `1px dashed ${color}` : '1px solid transparent'), background: 'transparent' }
                      : field.type === 'text' && field.value?.trim()
                        ? { ...edges(`1px solid ${isSel ? color : `${color}55`}`), background: 'rgba(255,255,255,0.92)' }
                        : {
                          ...edges(`1.5px solid ${isSel ? color : `${color}8c`}`, ['checkbox', 'radio'].includes(field.type) ? null : `3px solid ${color}`),
                          background: `linear-gradient(180deg, ${color}14, ${color}24)`,
                        }),
                    boxShadow: isSel ? `0 0 0 3px ${color}33, 0 4px 12px rgba(15,23,42,0.12)` : field.type === 'strike' ? 'none' : '0 1px 2px rgba(15,23,42,0.06)',
                    touchAction: 'none',
                    cursor: editingId === field.id ? 'text' : 'move',
                  }}
                  title={field.type === 'text' ? 'Double-click to type' : undefined}
                  onDoubleClick={(e) => { if (field.type === 'text') { e.stopPropagation(); setSelectedId(field.id); setEditingId(field.id); } }}
                  onPointerDown={(e) => { if (editingId === field.id) return; startDrag(e, field, 'move'); }}
                  onPointerMove={onDragMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  {field.type === 'strike' ? (
                    <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 pointer-events-none rounded-full" style={{ background: fieldLook(field).color, height: strikePx(field, layout.width) }} />
                  ) : field.type === 'text' ? (
                    <FieldText field={field} layout={layout} color={color} editing={editingId === field.id}
                      onChange={(v) => updateField(field.id, { value: v })}
                      onGrow={(h) => updateField(field.id, { hPct: Math.min(h, 100 - field.y) })}
                      onDone={() => setEditingId(null)} />
                  ) : (
                    <FieldPreview field={field} color={color} label={field.label || def?.label || field.type} layout={layout} />
                  )}
                  {field.show_if && <span className="absolute -top-2 -left-2 text-[9px] px-1 rounded bg-amber-400 text-white pointer-events-none" title="Only shows when another box is filled">if</span>}
                  {isSel && !dragRef.current && (STYLED_TYPES.has(field.type) || field.type === 'strike') && (
                    <div className={`absolute z-40 ${field.y < 3 ? 'top-full mt-2' : 'bottom-full mb-2'} ${field.x > 55 ? 'right-0' : 'left-0'}`} style={{ whiteSpace: 'nowrap' }}
                      onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                      <FieldStyleBar field={field} onChange={(style) => { updateField(field.id, { style }); rememberStyle(field.type, style); }} />
                    </div>
                  )}
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
                <button key={t.id} type="button" disabled={!layout} onClick={() => { setPlacingValue(null); setRadioGroup(null); setPlacing(placing === t.id ? null : t.id); }}
                  className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 disabled:opacity-40 ${placing === t.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-border/40 hover:border-foreground/40'}`}>
                  <Icon className="w-4 h-4" /> {t.label}
                </button>
              );
            })}
          </div>
          <Button type="button" variant="outline" size="sm" className="w-full mt-2 gap-2" disabled={!layout?.pages?.length} onClick={initialsEveryPage}>
            <Copy className="w-4 h-4" /> <span className="truncate">Initials on every page{signers[activeSigner] ? ` for ${signers[activeSigner].name || signers[activeSigner].email}` : ''}</span>
          </Button>
          {onAutoDetect && (
            <Button variant="outline" className="w-full mt-2 gap-2" disabled={!layout || detecting} onClick={autoDetect}>
              {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {detecting ? (deal ? 'Reading the form and filling it in…' : 'Finding signature lines…') : deal ? 'Find blanks & fill them with AI' : 'Auto-place fields with AI'}
            </Button>
          )}
        </div>

        {(templateMode || dealFacts(deal).length > 0) && (
          <div>
            <p className="text-sm font-medium mb-1 flex items-center gap-1.5"><Home className="w-4 h-4" /> Fill from the deal</p>
            <p className="text-xs text-muted-foreground mb-2">
              {templateMode ? 'Place a box that fills itself in from whichever deal this form is used on.' : selected?.type === 'text' && !String(selected.value || '').trim() && !selected.deal_key ? 'Tap to put it in the selected empty text box.' : 'Tap one, then tap the document.'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(templateMode ? DEAL_KEYS.map((k) => ({ key: k.key, label: k.label, value: '' })) : dealFacts(deal)).map((f) => (
                <button key={f.label} type="button" disabled={!layout} onClick={() => applyFact(f)} title={f.value}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:border-primary hover:text-primary disabled:opacity-40">
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {selected && (
          <div className="rounded-lg border border-border/60 p-3 space-y-3">
            <p className="text-sm font-medium">Selected: {FIELD_TYPES.find((t) => t.id === selected.type)?.label}</p>
            {selected.type === 'strike' && <p className="text-xs text-muted-foreground">A line through the text under it, printed on the signed copy. Drag to move; drag the corner to make it longer.</p>}
            {(STYLED_TYPES.has(selected.type) || selected.type === 'strike') && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{selected.type === 'strike' ? 'Line color and thickness' : 'Text style (prints exactly like this)'}</p>
                <div className="overflow-x-auto"><FieldStyleBar field={selected} className="shadow-none" onChange={(style) => { updateField(selected.id, { style }); rememberStyle(selected.type, style); }} /></div>
                {fields.filter((f) => f.id !== selected.id && (selected.type === 'strike' ? f.type === 'strike' : STYLED_TYPES.has(f.type))).length > 0 && (
                  <button type="button" className="text-xs text-primary hover:underline"
                    onClick={() => setFields((prev) => prev.map((f) => ((selected.type === 'strike' ? f.type === 'strike' : STYLED_TYPES.has(f.type)) ? { ...f, style: { ...(selected.style || {}) } } : f)))}>
                    Use this style for every {selected.type === 'strike' ? 'strike-out' : 'text, date and dropdown box'}
                  </button>
                )}
              </div>
            )}
            {signers.length > 0 && selected.type !== 'strike' && (
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
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={!!selected.sender_fill} onChange={(e) => updateField(selected.id, { sender_fill: e.target.checked })} />
                <span>Filled in by the agent before sending<span className="block text-xs text-muted-foreground">{selected.deal_key ? `Fills itself from the deal (${DEAL_KEYS.find((k) => k.key === selected.deal_key)?.label}). The agent can change it.` : 'Signers see it but can\'t change it.'}</span></span>
              </label>
            )}
            {selected.type === 'text' && (
              <label className="block text-xs text-muted-foreground">
                {templateMode ? 'Default text (optional)' : 'Pre-fill (signer can\'t change it)'}
                <textarea rows={3} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground resize-y"
                  value={selected.value || ''} placeholder="Leave empty for the signer to fill. You can also double-click the box to type in it."
                  onChange={(e) => updateField(selected.id, { value: e.target.value })} />
              </label>
            )}
            {['checkbox', 'radio', 'dropdown', 'attachment', 'text'].includes(selected.type) && (
              <label className="block text-xs text-muted-foreground">
                {selected.type === 'radio' ? 'This choice' : selected.type === 'attachment' ? 'What to attach' : 'Label for the signer (optional)'}
                <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  value={selected.label || ''} placeholder={selected.type === 'attachment' ? 'e.g. Proof of funds' : selected.type === 'radio' ? 'e.g. Cash' : 'e.g. Lender name'}
                  onChange={(e) => updateField(selected.id, { label: e.target.value.slice(0, 80) })} />
              </label>
            )}
            {selected.type === 'checkbox' && (
              <label className="block text-xs text-muted-foreground">
                Who ticks it
                <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  value={selected.deal_key && selected.deal_equals ? `${selected.deal_key}::${selected.deal_equals}` : selected.sender_fill ? 'sender' : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return updateField(selected.id, { sender_fill: false, deal_key: null, deal_equals: null, value: '' });
                    if (v === 'sender') return updateField(selected.id, { sender_fill: true, deal_key: null, deal_equals: null });
                    const [k, eq] = v.split('::');
                    updateField(selected.id, { sender_fill: true, deal_key: k, deal_equals: eq, ...(deal ? fillFromDeal([{ ...selected, deal_key: k, deal_equals: eq }], deal)[0] : {}) });
                  }}>
                  <option value="">The signer</option>
                  <option value="sender">The agent, before sending</option>
                  {CHOICE_KEYS.map((c) => (
                    <optgroup key={c.key} label={`Automatically: ${c.label}`}>
                      {c.options.map((o) => <option key={o} value={`${c.key}::${o}`}>{c.label} is {o}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            {selected.type === 'checkbox' && selected.sender_fill && !templateMode && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.value === 'X'} onChange={(e) => updateField(selected.id, { value: e.target.checked ? 'X' : '' })} /> Ticked
              </label>
            )}
            {selected.type === 'radio' && (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Choices in this group: {fields.filter((f) => f.type === 'radio' && f.group === selected.group).map((f) => f.label || '?').join(' / ')}</p>
                <button type="button" className="text-primary underline" onClick={() => { setRadioGroup(selected.group); setActiveSigner(fieldSignerIndex(selected)); setPlacing('radio'); }}>Add another choice to this group</button>
              </div>
            )}
            {selected.type === 'dropdown' && (
              <label className="block text-xs text-muted-foreground">
                Choices (one per line)
                <textarea rows={4} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground resize-y"
                  value={(selected.options || []).join('\n')}
                  onChange={(e) => updateField(selected.id, { options: e.target.value.split('\n').map((o) => o.slice(0, 80)).slice(0, 30) })}
                  onBlur={(e) => updateField(selected.id, { options: e.target.value.split('\n').map((o) => o.trim()).filter(Boolean) })} />
              </label>
            )}
            {selected.type !== 'strike' && (() => {
              // "Only show when...": a box of the same signer that's ticked, or a dropdown choice.
              const sameSigner = fields.filter((f) => f.id !== selected.id && fieldSignerIndex(f) === fieldSignerIndex(selected));
              const opts = [];
              for (const f of sameSigner) {
                if (f.type === 'checkbox') opts.push({ key: f.id, label: `"${f.label || 'Checkbox'}" is ticked`, cond: { field_id: f.id } });
                if (f.type === 'radio') opts.push({ key: f.id, label: `"${f.label || 'Choice'}" is picked`, cond: { field_id: f.id } });
                if (f.type === 'dropdown') for (const o of (f.options || []).filter(Boolean)) opts.push({ key: `${f.id}::${o}`, label: `Dropdown is "${o}"`, cond: { field_id: f.id, equals: o } });
              }
              if (!opts.length && !selected.show_if) return null;
              const cur = selected.show_if ? `${selected.show_if.field_id}${selected.show_if.equals ? `::${selected.show_if.equals}` : ''}` : '';
              return (
                <label className="block text-xs text-muted-foreground">
                  Only show when
                  <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={cur}
                    onChange={(e) => updateField(selected.id, { show_if: opts.find((o) => o.key === e.target.value)?.cond || null })}>
                    <option value="">Always show</option>
                    {opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </label>
              );
            })()}
            {selected.type !== 'strike' && <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.required !== false}
                onChange={(e) => updateField(selected.id, { required: e.target.checked })} />
              Required
            </label>}
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
          {!templateMode && <Button variant="outline" onClick={saveAsTemplate} disabled={saving || fields.length === 0}>Save as template</Button>}
          {templateMsg && <p className="text-xs text-green-700">{templateMsg}</p>}
        </div>
      </div>
    </div>
  );
}
