import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Accessible button component ensuring 44x44px minimum tap target on mobile,
 * proper ARIA attributes, and iOS-friendly touch feedback.
 */
export default function AccessibleButton({
  children,
  aria-label,
  aria-disabled,
  role = 'button',
  className,
  disabled = false,
  ...props
}) {
  return (
    <Button
      {...props}
      disabled={disabled}
      aria-label={aria-label}
      aria-disabled={disabled || aria-disabled}
      role={role}
      className={cn(
        'min-h-[44px] min-w-[44px] font-medium text-sm active:opacity-70 transition-opacity',
        'touch-manipulation',
        className
      )}
    >
      {children}
    </Button>
  );
}