import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

// Calls onChange({ type, id, data }) whenever a row in the entity changes (Supabase realtime).
export function useLiveTable(entity, onChange) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    const unsub = base44.entities[entity].subscribe((e) => cb.current?.(e));
    return () => unsub?.();
  }, [entity]);
}
