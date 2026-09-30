import React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Accessible input component with:
 * - Minimum 16px font size to prevent iOS auto-zoom on focus
 * - Proper label association
 * - Enhanced touch target area
 * - ARIA attributes for screen readers
 */
export default function AccessibleInput({
  label,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  helpText,
  error,
  className,
  required = false,
  ...props
}) {
  const inputId = id || `input-${Math.random().toString(36).slice(2, 9)}`;
  const helpTextId = helpText ? `${inputId}-help` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  const describedBy = [helpTextId, errorId, ariaDescribedBy]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label 
          htmlFor={inputId}
          className="block text-sm font-medium text-foreground"
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}
      <Input
        id={inputId}
        {...props}
        aria-label={ariaLabel || label}
        aria-describedby={describedBy || undefined}
        aria-invalid={!!error}
        required={required}
        className={cn(
          'min-h-[44px] text-base sm:text-sm',
          error && 'border-destructive focus:ring-destructive',
          className
        )}
      />
      {helpText && !error && (
        <p id={helpTextId} className="text-xs text-muted-foreground">
          {helpText}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}