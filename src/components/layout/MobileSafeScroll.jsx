import React, { useRef, useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * iOS-optimized scroll container with refined pull-to-refresh.
 * Handles rubber-band scrolling, prevents layout shift, and provides smooth feedback.
 */
export default function MobileSafeScroll({
  children,
  onRefresh,
  className,
  showRefreshIndicator = true,
  threshold = 80,
}) {
  const scrollRef = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [touchStartY, setTouchStartY] = useState(0);
  const [canPull, setCanPull] = useState(false);

  const handleTouchStart = useCallback((e) => {
    // Only start pull if at top of scroll
    const isAtTop = scrollRef.current?.scrollTop === 0;
    setTouchStartY(e.touches[0].clientY);
    setCanPull(isAtTop);
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!canPull || isRefreshing) {
      setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const distance = Math.max(0, currentY - touchStartY);
    
    // Decelerate pull animation as distance increases (rubber band effect)
    const decelerated = distance * 0.5;
    setPullDistance(Math.min(decelerated, threshold * 1.5));
  }, [canPull, touchStartY, isRefreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!canPull || pullDistance < threshold || isRefreshing) {
      setPullDistance(0);
      return;
    }

    setIsRefreshing(true);
    setPullDistance(0);

    try {
      await onRefresh?.();
    } finally {
      setIsRefreshing(false);
    }
  }, [canPull, pullDistance, isRefreshing, onRefresh, threshold]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    scrollElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    scrollElement.addEventListener('touchmove', handleTouchMove, { passive: true });
    scrollElement.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      scrollElement.removeEventListener('touchstart', handleTouchStart);
      scrollElement.removeEventListener('touchmove', handleTouchMove);
      scrollElement.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        'overflow-y-auto overflow-x-hidden',
        'will-change-transform', // Enable GPU acceleration
        className
      )}
      style={{
        WebkitOverflowScrolling: 'touch', // Smooth momentum scrolling on iOS
      }}
    >
      {/* Pull-to-refresh indicator */}
      {showRefreshIndicator && pullDistance > 0 && (
        <div
          className="flex justify-center pt-4 pb-2 pointer-events-none"
          style={{
            opacity: Math.min(pullDistance / threshold, 1),
          }}
        >
          <div
            className="transform transition-all will-change-transform"
            style={{
              transform: `scale(${Math.min(pullDistance / threshold, 1)}) rotate(${(pullDistance / threshold) * 180}deg)`,
            }}
          >
            <RefreshCw
              className={cn(
                'w-5 h-5 text-primary',
                isRefreshing && 'animate-spin'
              )}
            />
          </div>
        </div>
      )}

      {/* Content */}
      {children}
    </div>
  );
}