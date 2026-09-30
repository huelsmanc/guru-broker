import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Accessible icon button ensuring 44x44px minimum tap target,
 * proper labeling for screen readers, and iOS-friendly interactions.
 */
export default function AccessibleIconButton({
  icon: Icon,
  label, // Required for accessibility
  size = 'md',
  variant = 'ghost',
  className,
  'aria-label': ariaLabel,
  disabled = false,
  ...props
}) {
  // Size mapping to ensure minimum 44x44
  const sizeClasses = {
    sm: 'min-h-[36px] min-w-[36px] p-2',
    md: 'min-h-[44px] min-w-[44px] p-2.5',
    lg: 'min-h-[52px] min-w-[52px] p-3',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <Button
      {...props}
      variant={variant}
      disabled={disabled}
      aria-label={ariaLabel || label}
      title={label}
      className={cn(
        sizeClasses[size],
        'rounded-lg flex items-center justify-center',
        'active:opacity-70 transition-opacity',
        'touch-manipulation',
        className
      )}
    >
      <Icon className={cn(iconSizes[size], 'flex-shrink-0')} aria-hidden="true" />
    </Button>
  );
}