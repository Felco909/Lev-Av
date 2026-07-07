'use client';

import { useCallback, useEffect, useState } from 'react';

type SyncState = 'checking' | 'online' | 'offline';

export function useServerSync(pollMs = 45000) {
  const [state, setState] = useState<SyncState>('checking');
  const [lastOkAt, setLastOkAt] = useState<string | null>(null);

  const pulse = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setState('offline');
        return;
      }
      setState('online');
      setLastOkAt(typeof data.at === 'string' ? data.at : new Date().toISOString());
    } catch {
      setState('offline');
    }
  }, []);

  useEffect(() => {
    pulse();
    const id = window.setInterval(pulse, pollMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') pulse();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pollMs, pulse]);

  return { state, lastOkAt, pulse };
}
