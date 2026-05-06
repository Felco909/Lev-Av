'use client';
import { useEffect, useRef } from 'react';
import { registerCapture, unregisterCapture, consumeRestore, loadState } from '@/lib/nav-history';

/**
 * Auto-captures the current page state into sessionStorage when the user
 * navigates away through a CrumbLink. On mount, if the page was navigated-back
 * to (via a crumb click or the SmartBack button), it calls `restore` with the
 * previously-saved state so the page can apply filters, sort, tab, scroll, etc.
 *
 * @param pageKey        Stable key identifying the page (e.g. 'reports').
 * @param snapshot       Returns the current page state to save.
 * @param restore        Applies a saved state object to the page.
 */
export function useNavState<T>(
  pageKey: string,
  snapshot: () => T,
  restore: (s: T) => void,
) {
  // Always keep the latest snapshot fn in the registry so CrumbLink can capture it.
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    registerCapture(pageKey, () => snapshotRef.current());
    return () => unregisterCapture(pageKey);
  }, [pageKey]);

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (consumeRestore(pageKey)) {
      const state = loadState<T>(pageKey);
      if (state) {
        try { restore(state); } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);
}
