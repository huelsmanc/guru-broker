import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function DocumentFieldPlacement({ 
  documentUrl,
  documentPages = [],
  onFieldsChange, 
  initialFields = [],
  signatories = []
}) {
  // Support both single URL and array of page URLs
  const pages = documentPages.length > 0 ? documentPages : (documentUrl ? [documentUrl] : []);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [fields, setFields] = useState(initialFields);
  const [draggingFieldId, setDraggingFieldId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [newFieldType, setNewFieldType] = useState('signature');
  const [selectedSigner, setSelectedSigner] = useState(signatories[0]?.email || '');
  const docPreviewRef = useRef(null);

  const currentPageUrl = pages[currentPageIndex];
  const pageFieldCount = fields.filter(f => (f.page ?? 0) === currentPageIndex).length;

  const handleAddField = () => {
    if (!selectedSigner) {
      alert('Please select a signer');
      return;
    }
    
    const newField = {
      id: `field-${Date.now()}`,
      type: newFieldType,
      page: currentPageIndex,
      x: 50,
      y: 50,
      signer_email: selectedSigner,
      signer_name: signatories.find(s => s.email === selectedSigner)?.name || selectedSigner,
      signed: false,
    };
    
    const updated = [...fields, newField];
    setFields(updated);
    onFieldsChange(updated);
  };

  const handleNextPage = () => {
    if (currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    }
  };

  const handleMouseDown = (e, fieldId) => {
    if (!docPreviewRef.current) return;
    
    const element = e.currentTarget;
    const rect = element.getBoundingClientRect();
    const docRect = docPreviewRef.current.getBoundingClientRect();
    
    setDraggingFieldId(fieldId);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!draggingFieldId || !docPreviewRef.current) return;
      
      const docRect = docPreviewRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - docRect.left - dragOffset.x, docRect.width - 80));
      const y = Math.max(0, Math.min(e.clientY - docRect.top - dragOffset.y, docRect.height - 40));
      
      setFields(prev => prev.map(f => 
        f.id === draggingFieldId ? { ...f, x, y, page: currentPageIndex } : f
      ));
    };

    const handleMouseUp = () => {
      if (draggingFieldId) {
        const updated = fields;
        onFieldsChange(updated);
      }
      setDraggingFieldId(null);
    };

    if (draggingFieldId) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingFieldId, dragOffset, fields, onFieldsChange]);

  const handleRemoveField = (fieldId) => {
    const updated = fields.filter(f => f.id !== fieldId);
    setFields(updated);
    onFieldsChange(updated);
  };

  const fieldIcons = {
    signature: '✍️',
    initial: '📝',
    date: '📅',
    text: '💬',
  };

  const fieldLabels = {
    signature: 'Signature',
    initial: 'Initial',
    date: 'Date',
    text: 'Text',
  };

  return (
    <div className="space-y-4">
      {/* Field Creation Controls */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-foreground text-sm">Add Signature Fields</h3>
        
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Field Type</label>
            <select
              value={newFieldType}
              onChange={(e) => setNewFieldType(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:ring-1 focus:ring-primary/40 outline-none"
            >
              <option value="signature">Signature</option>
              <option value="initial">Initial</option>
              <option value="date">Date</option>
              <option value="text">Text</option>
            </select>
          </div>
          
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Assign to Signer</label>
            <select
              value={selectedSigner}
              onChange={(e) => setSelectedSigner(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:ring-1 focus:ring-primary/40 outline-none"
            >
              {signatories.map(sig => (
                <option key={sig.email} value={sig.email}>
                  {sig.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end">
            <Button
              onClick={handleAddField}
              className="w-full h-9 rounded-md gap-2 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Field
            </Button>
          </div>
        </div>
      </div>

      {/* PDF Preview with Draggable Fields */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-sm">
              Document Preview ({fields.length} total fields)
            </h3>
            <p className="text-xs text-muted-foreground">Drag fields to reposition them on the document</p>
          </div>
          {pages.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Page {currentPageIndex + 1} of {pages.length} ({pageFieldCount} fields)
              </span>
              <Button
                onClick={handlePrevPage}
                disabled={currentPageIndex === 0}
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                onClick={handleNextPage}
                disabled={currentPageIndex === pages.length - 1}
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        <div
          ref={docPreviewRef}
          className="w-full bg-muted rounded-lg overflow-hidden border border-border relative flex items-center justify-center min-h-96"
        >
          {currentPageUrl && (
            <img
              key={currentPageUrl}
              src={currentPageUrl}
              alt={`Document Preview - Page ${currentPageIndex + 1}`}
              className="max-w-full max-h-96 object-contain"
            />
          )}

          {/* Draggable Field Overlays - Only show fields on current page */}
          <AnimatePresence>
            {fields.filter(f => (f.page ?? 0) === currentPageIndex).map((field) => (
              <motion.div
                key={field.id}
                onMouseDown={(e) => handleMouseDown(e, field.id)}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={cn(
                  'absolute w-20 h-10 rounded border-2 flex items-center justify-center text-[10px] font-bold cursor-move transition-all group',
                  draggingFieldId === field.id
                    ? 'border-primary bg-primary/30 z-20 shadow-xl ring-2 ring-primary/50'
                    : 'border-accent bg-accent/10 hover:bg-accent/20 hover:border-accent/80'
                )}
                style={{
                  left: `${field.x}px`,
                  top: `${field.y}px`,
                  userSelect: 'none',
                }}
              >
                <span className="flex flex-col items-center">
                  <span>{fieldIcons[field.type]}</span>
                  <span className="text-[8px]">{fieldLabels[field.type]}</span>
                </span>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveField(field.id);
                  }}
                  className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 rounded-full bg-destructive text-destructive-foreground w-5 h-5 flex items-center justify-center transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Fields List */}
      {fields.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-semibold text-foreground text-sm mb-3">Field Summary ({fields.length} total)</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {fields.map((field) => {
              const signer = signatories.find(s => s.email === field.signer_email);
              const pageNum = (field.page ?? 0) + 1;
              return (
                <div key={field.id} className={cn("flex items-center justify-between p-3 rounded-lg text-xs transition-colors", 
                  (field.page ?? 0) === currentPageIndex ? "bg-primary/10 border border-primary/30" : "bg-muted/30"
                )}>
                  <div>
                    <p className="font-medium text-foreground">
                      {fieldIcons[field.type]} {fieldLabels[field.type]} 
                      {pages.length > 1 && <span className="text-muted-foreground ml-2">• Page {pageNum}</span>}
                    </p>
                    <p className="text-muted-foreground">{signer?.name} • Position: ({Math.round(field.x)}, {Math.round(field.y)})</p>
                  </div>
                  <button
                    onClick={() => handleRemoveField(field.id)}
                    className="p-1.5 hover:bg-destructive/10 text-destructive rounded transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}