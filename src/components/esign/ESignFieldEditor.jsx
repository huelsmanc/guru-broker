import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import InteractiveFieldRenderer from './InteractiveFieldRenderer';
import PDFPageRenderer from './PDFPageRenderer';

const FIELD_TYPES = [
  { id: 'signature', label: 'Signature', color: 'bg-blue-500' },
  { id: 'date', label: 'Date', color: 'bg-green-500' },
  { id: 'text', label: 'Text', color: 'bg-purple-500' },
  { id: 'initial', label: 'Initial', color: 'bg-orange-500' },
];

export default function ESignFieldEditor({ doc, onComplete }) {
  const [activeFieldType, setActiveFieldType] = useState(null);
  const [fields, setFields] = useState(doc.fields || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [docHeight, setDocHeight] = useState(null); // null = loading
  const [signers] = useState(doc.signers || []);

  // containerRef = the inner div that holds the document + fields (position:relative, full height)
  const containerRef = useRef(null);
  // scrollRef = the outer div that clips and scrolls
  const scrollRef = useRef(null);

  // Auto-save fields (debounced)
  useEffect(() => {
    const timeout = setTimeout(async () => {
      try {
        await base44.entities.ESignDocument.update(doc.id, { fields });
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 600);
    return () => clearTimeout(timeout);
  }, [fields, doc.id]);

  // Place a new field on click
  const handleCanvasClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeFieldType || !containerRef.current) return;

    const container = containerRef.current;
    const scroller = scrollRef.current;

    // Use offsetLeft/offsetTop relative to the scrollable container, not getBoundingClientRect
    // getBoundingClientRect gives viewport coords; we need coords within the scrollable container
    const scrollerRect = scroller ? scroller.getBoundingClientRect() : container.getBoundingClientRect();
    const scrollTop = scroller ? scroller.scrollTop : 0;
    const scrollLeft = scroller ? scroller.scrollLeft : 0;

    const xInContainer = e.clientX - scrollerRect.left + scrollLeft;
    const yInContainer = e.clientY - scrollerRect.top + scrollTop;

    const xPct = (xInContainer / container.offsetWidth) * 100;
    const yPct = (yInContainer / container.offsetHeight) * 100;

    const newField = {
      id: `field-${Date.now()}`,
      type: activeFieldType,
      page: 0,
      x: Math.max(0, Math.min(xPct, 82)),
      y: Math.max(0, Math.min(yPct, 98)),
      width: 18,
      height: 40,
      required: true,
      value: '',
    };

    setFields(prev => [...prev, newField]);
    setActiveFieldType(null);
  };

  const updateField = (fieldId, updates) => {
    setFields(prev => prev.map(f => f.id === fieldId ? { ...f, ...updates } : f));
  };

  const updateFieldSigner = (fieldId, signerIndex) => {
    setFields(prev => prev.map(f => f.id === fieldId ? { ...f, signer_index: signerIndex } : f));
  };

  const removeField = (fieldId) => {
    setFields(prev => prev.filter(f => f.id !== fieldId));
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
      onComplete();
    } catch (err) {
      setError('Failed to save template: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const getFieldLabel = (type) => FIELD_TYPES.find(t => t.id === type)?.label || type;

  const isPdf = doc.document_url?.toLowerCase().endsWith('.pdf') || doc.document_url?.includes('application/pdf');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 py-4">
      {/* Document viewer - Left */}
      <div className="lg:col-span-2 space-y-3">

        {/* Scroll wrapper - clips the document and scrolls */}
        <div
          ref={scrollRef}
          className="border border-border/40 rounded-lg overflow-auto"
          style={{ maxHeight: '70vh' }}
        >
          {/* Document + field overlays share the same positioned container */}
          {isPdf ? (
            <PDFPageRenderer
              url={doc.document_url}
              containerRef={containerRef}
              onHeightReady={(h) => setDocHeight(h)}
            >
              {activeFieldType && (
                <div className="absolute inset-0 z-20 cursor-crosshair pointer-events-auto" onClick={handleCanvasClick} />
              )}
              <AnimatePresence>
                {fields.map(field => (
                  <motion.div key={field.id} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
                    className="absolute z-10"
                    style={{ left: `${field.x}%`, top: `${field.y}%`, width: `${field.width}%`, height: `${field.height}px` }}
                  >
                    <InteractiveFieldRenderer field={field} containerRef={containerRef} scrollRef={scrollRef}
                      value={field.value} onChange={(val) => updateField(field.id, { value: val })}
                      onPositionChange={(x, y) => updateField(field.id, { x, y })}
                      onSizeChange={(w, h) => updateField(field.id, { width: w, height: h })}
                      signers={signers} onSignerChange={updateFieldSigner} onDelete={() => removeField(field.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </PDFPageRenderer>
          ) : (
            <div ref={containerRef} className="relative w-full">
              <img src={doc.document_url} alt={doc.title} className="w-full block" style={{ pointerEvents: 'none' }}
                onLoad={(e) => setDocHeight(e.target.offsetHeight)} />
              {activeFieldType && (
                <div className="absolute inset-0 z-20 cursor-crosshair" onClick={handleCanvasClick} />
              )}
              <AnimatePresence>
                {fields.map(field => (
                  <motion.div key={field.id} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
                    className="absolute z-10"
                    style={{ left: `${field.x}%`, top: `${field.y}%`, width: `${field.width}%`, height: `${field.height}px` }}
                  >
                    <InteractiveFieldRenderer field={field} containerRef={containerRef} scrollRef={scrollRef}
                      value={field.value} onChange={(val) => updateField(field.id, { value: val })}
                      onPositionChange={(x, y) => updateField(field.id, { x, y })}
                      onSizeChange={(w, h) => updateField(field.id, { width: w, height: h })}
                      signers={signers} onSignerChange={updateFieldSigner} onDelete={() => removeField(field.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-destructive/10 border border-destructive rounded-lg p-4 flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </motion.div>
        )}
      </div>

      {/* Controls - Right */}
      <div className="lg:col-span-1 space-y-6">
        {/* Field Type Selector */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-3">Select Field Type</label>
          <div className="grid grid-cols-2 gap-2">
            {FIELD_TYPES.map(ft => (
              <button
                key={ft.id}
                onClick={() => docHeight !== null && setActiveFieldType(ft.id)}
                disabled={docHeight === null}
                className={`px-3 py-2 rounded-lg border-2 transition-all font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed ${
                  activeFieldType === ft.id
                    ? `${ft.color} text-white border-white`
                    : 'bg-muted border-border/40 text-foreground hover:border-foreground/50'
                }`}
              >
                {ft.label}
              </button>
            ))}
          </div>
          {activeFieldType && (
            <p className="text-xs text-muted-foreground mt-2">
              Click on the document to place a {getFieldLabel(activeFieldType)} field
            </p>
          )}
        </div>

        {/* Recipients */}
        {signers.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <p className="text-sm font-medium text-foreground">Recipients</p>
            <div className="space-y-1.5">
              {signers.map((signer, idx) => {
                const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-cyan-500'];
                return (
                  <div key={idx} className={`${colors[idx % colors.length]} text-white rounded px-2 py-1.5 text-xs flex items-center gap-2`}>
                    <div className="w-2 h-2 rounded-full bg-white flex-shrink-0" />
                    <span className="font-medium truncate">{signer.name || signer.email}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Fields List */}
        {fields.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <p className="text-sm font-medium text-foreground">Fields: {fields.length}</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {fields.map(field => {
                const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-cyan-500'];
                const assignedSigner = signers[field.signer_index];
                return (
                  <div key={field.id} className={`${colors[(field.signer_index || 0) % colors.length]} text-white rounded px-2 py-1.5 text-xs space-y-1`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{getFieldLabel(field.type)} (P{field.page + 1})</span>
                      <button onClick={() => removeField(field.id)} className="text-white/70 hover:text-white">✕</button>
                    </div>
                    {assignedSigner && (
                      <div className="text-xs opacity-90 truncate">→ {assignedSigner.name || assignedSigner.email}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="lg:col-span-2 flex justify-between gap-3 pt-4 border-t border-border/40">
        <Button variant="outline" onClick={onComplete} disabled={saving}>Skip</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={saveAsTemplate} disabled={saving || fields.length === 0} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save as Template
          </Button>
          <Button onClick={async () => {
            setSaving(true);
            try {
              await base44.entities.ESignDocument.update(doc.id, { fields });
            } catch (err) {
              console.error('Save failed:', err);
            } finally {
              setSaving(false);
            }
            onComplete();
          }} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}