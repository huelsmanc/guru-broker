import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus, Trash2, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function DocumentFieldEditor({ 
  documentUrl, 
  onSave, 
  onCancel,
  onNavigate,
  signerEmails = [],
  loading = false,
  docNumber = 1,
  totalDocs = 1
}) {
  const containerRef = useRef(null);
  const docPreviewRef = useRef(null);
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [fieldType, setFieldType] = useState('signature');
  const [selectedSigner, setSelectedSigner] = useState('');
  const [signers, setSigners] = useState(signerEmails);
  const [newSignerEmail, setNewSignerEmail] = useState('');
  const [fieldPositions, setFieldPositions] = useState({});
  const [draggingField, setDraggingField] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [sequentialSigning, setSequentialSigning] = useState(false);
  const [wasDragging, setWasDragging] = useState(false);
  const [resizingField, setResizingField] = useState(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [fieldText, setFieldText] = useState('');
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [editingFieldValue, setEditingFieldValue] = useState('');

  const handleMouseDown = (e, fieldId) => {
    e.preventDefault();
    if (!docPreviewRef.current) return;
    const element = e.currentTarget;
    const rect = element.getBoundingClientRect();
    setDraggingField(fieldId);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  useEffect(() => {
    if (!draggingField || !docPreviewRef.current) return;
    
    const handleMouseMove = (e) => {
      const rect = docPreviewRef.current.getBoundingClientRect();
      const img = docPreviewRef.current.querySelector('img');
      const docHeight = img ? img.scrollHeight : rect.height;
      const x = Math.max(0, e.clientX - rect.left - dragOffset.x);
      const y = Math.max(0, e.clientY - rect.top - dragOffset.y);
      setFieldPositions(prev => ({
        ...prev,
        [draggingField]: { x, y }
      }));
    };

    const handleMouseUp = () => {
      setDraggingField(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingField, dragOffset]);

  const handleResizeStart = (e, fieldId, corner) => {
    e.stopPropagation();
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;
    
    setResizingField(fieldId);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: field.width || 10,
      height: field.height || 8,
      corner,
    });
  };

  useEffect(() => {
    if (!resizingField || !docPreviewRef.current) return;
    
    const handleMouseMove = (e) => {
      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;
      const rect = docPreviewRef.current.getBoundingClientRect();
      
      setFields(prev => prev.map(f => {
        if (f.id !== resizingField) return f;
        
        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        const pixelsPerPercent = rect.width / 100;
        
        // Only expand right and down (like a notepad)
        if (resizeStart.corner === 'bottom-right') {
          newWidth = Math.max(10, resizeStart.width + deltaX / pixelsPerPercent);
          newHeight = Math.max(8, resizeStart.height + deltaY / (rect.height / 100));
        }
        
        return { ...f, width: newWidth, height: newHeight };
      }));
    };

    const handleMouseUp = () => {
      setResizingField(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingField, resizeStart]);

  const addField = (e) => {
    if (wasDragging || draggingField || resizingField || editingFieldId) return;
    e.preventDefault();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * 100;
    const y = (e.clientY - rect.top) / rect.height * 100;

    if (!selectedSigner) {
      alert('Please select or add a signer first');
      return;
    }

    const newField = {
      id: `field-${Date.now()}`,
      type: fieldType,
      x: Math.min(100, Math.max(0, x)),
      y: Math.min(100, Math.max(0, y)),
      signer_email: selectedSigner,
      signer_name: selectedSigner.split('@')[0],
      signed: false,
      width: 10,
      height: 8,
      value: fieldType === 'text' ? fieldText : '',
    };

    setFields([...fields, newField]);
    setSelectedField(newField.id);
    // Don't clear fieldText—keep it for next field
  };

  const deleteField = (id) => {
    setFields(fields.filter(f => f.id !== id));
    if (selectedField === id) setSelectedField(null);
  };

  const addSigner = () => {
    if (newSignerEmail && !signers.includes(newSignerEmail)) {
      const updatedSigners = [...signers, newSignerEmail];
      setSigners(updatedSigners);
      setSelectedSigner(newSignerEmail);
      setNewSignerEmail('');
    }
  };

  const handleSave = () => {
    if (fields.length === 0) {
      alert('Please add at least one signature field');
      return;
    }

    // Convert pixel positions and sizes back to percentages for saving
    const savedFields = fields.map(field => {
      const pos = fieldPositions[field.id];
      if (pos && docPreviewRef.current) {
        const rect = docPreviewRef.current.getBoundingClientRect();
        return {
          ...field,
          x: (pos.x / rect.width) * 100,
          y: (pos.y / rect.height) * 100,
          width: field.width,
          height: field.height,
        };
      }
      return {
        ...field,
        width: field.width || 10,
        height: field.height || 8,
      };
    });

    onSave({
      signature_fields: savedFields,
      require_sequential_signing: sequentialSigning,
      signatories: signers.map((email, idx) => ({
        id: `sig-${idx}`,
        email,
        name: email.split('@')[0],
        signed: false,
        order: sequentialSigning ? idx + 1 : 0,
      })),
    });
  };

  const getFieldIcon = (type) => {
    switch (type) {
      case 'signature': return '✍️';
      case 'initial': return '📝';
      case 'date': return '📅';
      case 'text': return '📄';
      default: return '💬';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    >
      <div className="bg-card rounded-2xl shadow-xl max-w-5xl w-full max-h-[90dvh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
          <div>
            <h2 className="font-semibold text-foreground">Place Signature Fields</h2>
            {totalDocs > 1 && (
              <p className="text-xs text-muted-foreground mt-1">Document {docNumber} of {totalDocs}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {totalDocs > 1 && (
              <>
                <Button
                  onClick={() => onNavigate && onNavigate(docNumber - 2)}
                  disabled={docNumber === 1 || loading}
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-lg"
                  title="Go to previous document"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => onNavigate && onNavigate(docNumber)}
                  disabled={docNumber === totalDocs || loading}
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-lg"
                  title="Go to next document"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </>
            )}
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden gap-4 p-4">
          {/* Document Preview */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              Click to add fields, drag to move them
              <span className="text-muted-foreground text-xs">(Placed: {fields.length})</span>
            </div>
            <div
              ref={docPreviewRef}
              onClick={addField}
              className="flex-1 bg-muted rounded-lg overflow-auto relative flex items-center justify-center"
            >
              {!imageLoaded && (
                <div className="text-center">
                  <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Loading document...</p>
                </div>
              )}
              <img
                src={documentUrl}
                alt="Document"
                className="w-full h-auto"
                onLoad={() => setImageLoaded(true)}
              />

              {/* Field Overlays */}
              {imageLoaded && fields.map((field) => {
                const pos = fieldPositions[field.id];
                const rect = docPreviewRef.current?.getBoundingClientRect();
                const pixelX = pos ? pos.x : (rect ? (field.x * rect.width / 100) : 0);
                const pixelY = pos ? pos.y : (rect ? (field.y * rect.height / 100) : 0);
                const pixelWidth = (field.width || 30) * (rect?.width ?? 1) / 100;
                const pixelHeight = (field.height || 20) * (rect?.height ?? 1) / 100;
                
                return (
                  <div
                    key={field.id}
                    className={cn(
                      'absolute rounded border-2 flex items-center justify-center text-xs font-bold cursor-grab active:cursor-grabbing group',
                      selectedField === field.id || draggingField === field.id
                        ? 'border-primary bg-primary/20 shadow-lg z-20'
                        : 'border-accent bg-accent/10 hover:bg-accent/20 z-10',
                      draggingField === field.id && 'ring-2 ring-primary'
                    )}
                    style={{
                      left: `${pixelX}px`,
                      top: `${pixelY}px`,
                      width: `${pixelWidth}px`,
                      height: `${pixelHeight}px`,
                      transform: 'translate(-50%, -50%)',
                      pointerEvents: 'auto',
                      willChange: draggingField === field.id ? 'transform' : 'auto',
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (field.type === 'text' && editingFieldId === field.id) return;
                      handleMouseDown(e, field.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (field.type === 'text' && draggingField !== field.id && !editingFieldId) {
                        setEditingFieldId(field.id);
                        setEditingFieldValue(field.value || '');
                      } else if (draggingField !== field.id) {
                        setSelectedField(field.id);
                      }
                    }}
                    title={`${field.type} - Drag to move, resize corner to resize`}
                  >
                    {editingFieldId === field.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={editingFieldValue}
                        onChange={(e) => setEditingFieldValue(e.target.value)}
                        onBlur={() => {
                          setFields(fields.map(f => f.id === field.id ? { ...f, value: editingFieldValue } : f));
                          setEditingFieldId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full h-full text-center text-xs bg-transparent border-none outline-none text-foreground"
                      />
                    ) : (
                      <>
                        {getFieldIcon(field.type)}
                        {field.type === 'text' && field.value && (
                          <span className="absolute text-[10px] break-words p-0.5">{field.value}</span>
                        )}
                      </>
                    )}
                    
                    {/* Resize handle - bottom-right only */}
                    <div
                      onMouseDown={(e) => handleResizeStart(e, field.id, 'bottom-right')}
                      className="absolute bottom-0 right-0 w-3 h-3 bg-primary cursor-nwse-resize opacity-0 group-hover:opacity-100 rounded-full transition-opacity"
                      style={{ pointerEvents: 'auto' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Control Panel */}
          <div className="w-72 flex flex-col gap-4 bg-muted rounded-lg p-4 overflow-y-auto">
            {/* Add Field Section */}
            <div className="space-y-3 pb-4 border-b border-border">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-2">Field Type</label>
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value)}
                  className="w-full text-sm px-3 py-1.5 rounded border border-border bg-background"
                >
                  <option value="signature">✍️ Signature</option>
                  <option value="initial">📝 Initial</option>
                  <option value="date">📅 Date</option>
                  <option value="text">📝 Text Field</option>
                </select>
              </div>

              {fieldType === 'text' && (
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-2">Pre-fill Text (Optional)</label>
                  <Input
                    value={fieldText}
                    onChange={(e) => setFieldText(e.target.value)}
                    placeholder="e.g., Agent Name, License #, etc."
                    className="text-xs"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-foreground block mb-2">Assign to Signer</label>
                <select
                  value={selectedSigner}
                  onChange={(e) => setSelectedSigner(e.target.value)}
                  className="w-full text-sm px-3 py-1.5 rounded border border-border bg-background"
                >
                  <option value="">Select signer...</option>
                  {signers.map((email) => (
                    <option key={email} value={email}>
                      {email}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                onClick={() => {
                  setFieldType('signature');
                  setSelectedField(null);
                }}
                className="w-full text-xs h-8 rounded-lg gap-2"
              >
                <Plus className="w-3 h-3" /> Click to Add Field
              </Button>
            </div>

            {/* Add Signer Section */}
            <div className="space-y-2 pb-4 border-b border-border">
              <label className="text-xs font-semibold text-foreground block">Add Signer</label>
              <div className="flex gap-1">
                <Input
                  value={newSignerEmail}
                  onChange={(e) => setNewSignerEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addSigner()}
                  placeholder="email@example.com"
                  className="text-xs h-8 rounded"
                />
                <Button
                  onClick={addSigner}
                  size="sm"
                  className="h-8 w-8 p-0 rounded"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
              <div className="space-y-1">
                {signers.map((email) => (
                  <div
                    key={email}
                    className={cn(
                      'text-xs p-2 rounded cursor-pointer transition-colors',
                      selectedSigner === email
                        ? 'bg-primary/20 border border-primary text-foreground'
                        : 'bg-background text-muted-foreground hover:bg-background/80'
                    )}
                    onClick={() => setSelectedSigner(email)}
                  >
                    {email}
                  </div>
                ))}
              </div>
            </div>

            {/* Signing Workflow Section */}
            <div className="space-y-2 pb-4 border-b border-border">
              <label className="text-xs font-semibold text-foreground block">Signing Workflow</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sequentialSigning}
                  onChange={(e) => setSequentialSigning(e.target.checked)}
                  className="w-4 h-4 rounded border-border cursor-pointer"
                />
                <label className="text-xs text-foreground cursor-pointer flex-1">
                  Require sequential signing order
                </label>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {sequentialSigning
                  ? 'Signers must sign in order (1st, 2nd, etc.)'
                  : 'All signers can sign simultaneously in any order'}
              </p>
            </div>

            {/* Fields List */}
            <div className="flex-1 space-y-2">
              <label className="text-xs font-semibold text-foreground block">Placed Fields ({fields.length})</label>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                <AnimatePresence>
                  {fields.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No fields added yet
                    </p>
                  ) : (
                    fields.map((field) => (
                      <motion.div
                        key={field.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className={cn(
                          'text-xs p-2 rounded cursor-pointer flex items-center justify-between transition-colors',
                          selectedField === field.id
                            ? 'bg-primary/20 border border-primary'
                            : 'bg-background hover:bg-background/80'
                        )}
                        onClick={() => setSelectedField(field.id)}
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <span>{getFieldIcon(field.type)}</span>
                          <div className="flex-1">
                            <p className="font-medium">{field.type}</p>
                            {field.value && <p className="text-[10px] text-accent truncate">"{field.value}"</p>}
                            <p className="text-[10px] text-muted-foreground">{field.signer_email}</p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteField(field.id);
                          }}
                          className="p-1 hover:bg-destructive/20 rounded"
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </button>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
         <div className="flex justify-between items-center p-4 border-t border-border bg-muted">
           <div className="flex gap-2">
             <Button variant="outline" onClick={onCancel} className="rounded-lg" disabled={loading}>
               Cancel All
             </Button>
           </div>
           <div className="flex gap-2">
             {docNumber < totalDocs && (
               <Button variant="outline" onClick={() => handleSave()} className="gap-2 rounded-lg" disabled={loading || fields.length === 0}>
                 {loading ? 'Saving...' : <><Save className="w-4 h-4" /> Save & Next</>}
               </Button>
             )}
             {docNumber === totalDocs && (
               <Button onClick={handleSave} className="gap-2 rounded-lg" disabled={loading || fields.length === 0}>
                 {loading ? 'Uploading...' : <><Save className="w-4 h-4" /> Finish Upload</>}
               </Button>
             )}
           </div>
         </div>
      </div>
    </motion.div>
  );
}