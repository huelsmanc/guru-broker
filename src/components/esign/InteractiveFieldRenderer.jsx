import React, { useState, useEffect } from 'react';

const SIGNER_COLORS = [
  { bg: 'bg-blue-500', border: 'border-blue-500', rgba: '59,130,246' },
  { bg: 'bg-green-500', border: 'border-green-500', rgba: '34,197,94' },
  { bg: 'bg-purple-500', border: 'border-purple-500', rgba: '168,85,247' },
  { bg: 'bg-orange-500', border: 'border-orange-500', rgba: '249,115,22' },
  { bg: 'bg-pink-500', border: 'border-pink-500', rgba: '236,72,153' },
  { bg: 'bg-cyan-500', border: 'border-cyan-500', rgba: '34,211,238' },
];

export default function InteractiveFieldRenderer({
  field, containerRef, scrollRef, value, onChange,
  onPositionChange, onSizeChange, signers = [], onSignerChange, onDelete
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, fx: 0, fy: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0 });

  const getContainerSize = () => {
    if (!containerRef?.current) return { width: 1, height: 1 };
    return {
      width: containerRef.current.offsetWidth,
      height: containerRef.current.offsetHeight,
    };
  };

  const getScrollTop = () => scrollRef?.current?.scrollTop || 0;

  const handleDragStart = (e) => {
    if (e.target.closest('[data-resize]')) return;
    e.preventDefault();
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      fx: field.x,
      fy: field.y,
      scrollTop: getScrollTop(),
    });
    setIsDragging(true);
    e.stopPropagation();
  };

  const handleResizeStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setResizeStart({ x: e.clientX, y: e.clientY, w: field.width, h: field.height });
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => {
      const { width, height } = getContainerSize();
      const dxPct = ((e.clientX - dragStart.x) / width) * 100;
      const dyPct = ((e.clientY - dragStart.y) / height) * 100;
      onPositionChange(
        Math.max(0, Math.min(dragStart.fx + dxPct, 100 - field.width)),
        Math.max(0, Math.min(dragStart.fy + dyPct, 100 - (field.height / height * 100)))
      );
    };
    const onUp = () => setIsDragging(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, dragStart, field.width, field.height]);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e) => {
      const { width } = getContainerSize();
      const dxPct = ((e.clientX - resizeStart.x) / width) * 100;
      const dyPx = e.clientY - resizeStart.y;
      onSizeChange(
        Math.max(5, resizeStart.w + dxPct),
        Math.max(20, resizeStart.h + dyPx)
      );
    };
    const onUp = () => setIsResizing(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isResizing, resizeStart]);

  const signerIdx = field.signer_index ?? 0;
  const color = SIGNER_COLORS[signerIdx % SIGNER_COLORS.length];

  return (
    <div
      className={`w-full h-full border-2 ${color.border} rounded group cursor-move select-none relative`}
      style={{ backgroundColor: `rgba(${color.rgba},0.08)` }}
      onMouseDown={handleDragStart}
    >
      {field.type === 'signature' && (
        <div className="w-full h-full flex flex-col items-center justify-center text-xs text-gray-600 gap-1">
          <span className="font-medium">✍ Signature</span>
          {signers.length > 0 && (
            <select
              value={signerIdx}
              onChange={(e) => onSignerChange?.(field.id, parseInt(e.target.value))}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="text-xs px-1 py-0.5 rounded bg-white border border-gray-300 max-w-full"
            >
              {signers.map((s, i) => (
                <option key={i} value={i}>{s.name || s.email}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {field.type === 'initial' && (
        <div className="w-full h-full flex items-center justify-center text-xs text-gray-600 font-semibold">
          Init
        </div>
      )}

      {field.type === 'date' && (
        <div className="w-full h-full flex items-center justify-center text-xs text-gray-600">
          📅 Date
        </div>
      )}

      {field.type === 'text' && (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="Text..."
          className="w-full h-full bg-transparent text-xs p-1 outline-none border-0 resize-none"
        />
      )}

      {/* Delete button */}
      {onDelete && (
        <button
          data-resize
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-red-600"
          style={{ lineHeight: 1 }}
        >
          ✕
        </button>
      )}

      {/* Resize handle */}
      <div
        data-resize
        onMouseDown={handleResizeStart}
        className="absolute bottom-0 right-0 w-3 h-3 bg-primary cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity rounded-tl"
      />
    </div>
  );
}