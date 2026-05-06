// Client-side navigation history (trail of breadcrumbs) + page state save/restore.
// Uses sessionStorage so state survives route changes within a tab but not across tabs.

export type Crumb = {
  label: string;
  href: string;
  /** Optional stable key used to save/restore page state on that URL. */
  pageKey?: string;
};

const TRAIL_KEY = '__navTrail__';
const RESTORE_PREFIX = '__navRestore:';
const STATE_PREFIX = '__navState:';

function isClient() {
  return typeof window !== 'undefined';
}

// ===== Trail =====

export function getTrail(): Crumb[] {
  if (!isClient()) return [];
  try {
    const raw = sessionStorage.getItem(TRAIL_KEY);
    return raw ? (JSON.parse(raw) as Crumb[]) : [];
  } catch {
    return [];
  }
}

export function setTrail(trail: Crumb[]) {
  if (!isClient()) return;
  try { sessionStorage.setItem(TRAIL_KEY, JSON.stringify(trail)); } catch {}
}

export function pushCrumb(crumb: Crumb) {
  const trail = getTrail();
  // If the last crumb is the same page (same pageKey OR same href), replace it
  // rather than creating duplicates (e.g. when user navigates Reports -> trip -> back -> Reports -> trip).
  const last = trail[trail.length - 1];
  if (last && ((crumb.pageKey && last.pageKey === crumb.pageKey) || last.href === crumb.href)) {
    trail[trail.length - 1] = crumb;
  } else {
    trail.push(crumb);
  }
  setTrail(trail);
}

export function popCrumb(): Crumb | null {
  const trail = getTrail();
  const c = trail.pop() ?? null;
  setTrail(trail);
  return c;
}

/** Keep the first `count` crumbs, drop the rest. */
export function truncateTrail(count: number) {
  const trail = getTrail();
  setTrail(trail.slice(0, Math.max(0, count)));
}

export function clearTrail() {
  if (!isClient()) return;
  try { sessionStorage.removeItem(TRAIL_KEY); } catch {}
}

// ===== Page state (filters/sort/scroll) =====

export function saveState(pageKey: string, state: unknown) {
  if (!isClient()) return;
  try { sessionStorage.setItem(STATE_PREFIX + pageKey, JSON.stringify(state)); } catch {}
}

export function loadState<T = any>(pageKey: string): T | null {
  if (!isClient()) return null;
  try {
    const raw = sessionStorage.getItem(STATE_PREFIX + pageKey);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

export function clearState(pageKey: string) {
  if (!isClient()) return;
  try { sessionStorage.removeItem(STATE_PREFIX + pageKey); } catch {}
}

// ===== Restore flags =====
// When navigating BACK to a page, we set a restore flag; the target page reads
// and consumes it to decide whether to apply saved state on mount.

export function markRestore(pageKey: string) {
  if (!isClient()) return;
  try { sessionStorage.setItem(RESTORE_PREFIX + pageKey, '1'); } catch {}
}

export function consumeRestore(pageKey: string): boolean {
  if (!isClient()) return false;
  try {
    const key = RESTORE_PREFIX + pageKey;
    const v = sessionStorage.getItem(key);
    if (v) {
      sessionStorage.removeItem(key);
      return true;
    }
  } catch {}
  return false;
}

/** Check restore flag without consuming it. Useful for skipping default init. */
export function peekRestore(pageKey: string): boolean {
  if (!isClient()) return false;
  try { return !!sessionStorage.getItem(RESTORE_PREFIX + pageKey); } catch { return false; }
}

// ===== Capture registry (for components that want to capture state on nav) =====
// A page registers a snapshot function; before navigating away through a CrumbLink,
// we call the snapshot to grab the current state and stash it in storage.

const captures: Record<string, () => unknown> = {};

export function registerCapture(pageKey: string, fn: () => unknown) {
  captures[pageKey] = fn;
}

export function unregisterCapture(pageKey: string) {
  delete captures[pageKey];
}

export function captureAndSave(pageKey: string) {
  const fn = captures[pageKey];
  if (!fn) return;
  try { saveState(pageKey, fn()); } catch {}
}
