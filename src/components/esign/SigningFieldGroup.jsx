import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import ImprovedSignaturePad from './ImprovedSignaturePad';
import { CheckCircle } from 'lucide-react';

export default function SigningFieldGroup({ fields, values, onFieldChange, fullName }) {
  const [expandedField, setExpandedField] = useState(null);

  if (!fields || fields.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {fields.map((field, idx) => {
        const value = values[field.id];
        const isComplete = !!value;
        const isExpanded = expandedField === field.id;

        const fieldConfig = {
          signature: {
            label: 'Signature',
            icon: '✎',
            bgClass: 'bg-blue-100',
            textClass: 'text-blue-600',
          },
          initial: {
            label: 'Initials',
            icon: '◉',
            bgClass: 'bg-cyan-100',
            textClass: 'text-cyan-600',
          },
          date: {
            label: 'Date',
            icon: '📅',
            bgClass: 'bg-orange-100',
            textClass: 'text-orange-600',
          },
          text: {
            label: 'Text',
            icon: '✓',
            bgClass: 'bg-gray-100',
            textClass: 'text-gray-600',
          },
        };

        const config = fieldConfig[field.type];

        return (
          <div key={field.id} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-sm transition-shadow">
            {/* Header */}
            <button
              onClick={() => setExpandedField(isExpanded ? null : field.id)}
              className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-8 h-8 rounded-lg ${config.bgClass} flex items-center justify-center flex-shrink-0 text-sm font-bold ${config.textClass}`}>
                  {config.icon}
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium text-foreground">{config.label} {field.required && '*'}</p>
                  <p className="text-xs text-muted-foreground truncate">{field.placeholder || `Enter ${config.label.toLowerCase()}`}</p>
                </div>
              </div>
              {isComplete && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <CheckCircle className="w-4 h-4 text-accent" />
                  <span className="text-xs text-accent font-medium">Complete</span>
                </div>
              )}
            </button>

            {/* Content */}
            {isExpanded && (
              <div className="border-t border-gray-200 bg-gray-50/50 p-4 space-y-3">
                {field.type === 'signature' && (
                  <ImprovedSignaturePad
                    initialValue={value}
                    onSignatureChange={(sig) => onFieldChange(field.id, sig)}
                    fullName={fullName}
                  />
                )}

                {field.type === 'initial' && (
                  <input
                    type="text"
                    maxLength="3"
                    value={value || ''}
                    onChange={(e) => onFieldChange(field.id, e.target.value.toUpperCase())}
                    placeholder="e.g., ABC"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                )}

                {field.type === 'date' && (
                  <input
                    type="date"
                    value={value || ''}
                    onChange={(e) => onFieldChange(field.id, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                )}

                {field.type === 'text' && (
                  <input
                    type="text"
                    value={value || ''}
                    onChange={(e) => onFieldChange(field.id, e.target.value)}
                    placeholder={field.placeholder || 'Enter text'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}