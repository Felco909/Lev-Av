'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavState } from '@/hooks/use-nav-state';
import { DayTasksHeader } from './_components/day-tasks-header';
import { LogistPanel } from './_components/logist-panel';
import { AccountantPanel } from './_components/accountant-panel';
import { DirectorPanel } from './_components/director-panel';
import type { DayTasksResponse, PeriodFilter, Priority, TripTask } from './_components/types';

type PanelKey = 'logist' | 'accountant' | 'director';

const LAYOUT_STORAGE_KEY = 'day-tasks-layout-v1';

interface LayoutState {
  expanded: PanelKey | null;
  collapsed: Record<PanelKey, boolean>;
}

const DEFAULT_LAYOUT: LayoutState = { expanded: null, collapsed: { logist: false, accountant: false, director: false } };

function loadLayout(): LayoutState {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_LAYOUT, ...parsed, collapsed: { ...DEFAULT_LAYOUT.collapsed, ...(parsed.collapsed ?? {}) } };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function periodWindow(period: PeriodFilter): { from: Date; to: Date } | null {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === 'today') {
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { from: start, to: end };
  }
  if (period === 'tomorrow') {
    const from = new Date(start);
    from.setDate(from.getDate() + 1);
    const to = new Date(from);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (period === 'week') {
    const to = new Date(start);
    to.setDate(to.getDate() + 7);
    to.setHours(23, 59, 59, 999);
    return { from: start, to };
  }
  return null; // 'all'
}

export default function DayTasksPage() {
  const [data, setData] = useState<DayTasksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [priority, setPriority] = useState<Priority | 'all'>('all');
  const [status, setStatus] = useState('all');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [layout, setLayout] = useState<LayoutState>(DEFAULT_LAYOUT);

  useEffect(() => {
    setLayout(loadLayout());
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('q', debouncedSearch);
      const res = await fetch(`/api/day-tasks?${params.toString()}`);
      if (!res.ok) throw new Error('Не удалось загрузить лист дня');
      const json: DayTasksResponse = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const scrollRef = useRef(0);
  useNavState(
    'day-tasks',
    () => ({ period, priority, status, scrollY: typeof window !== 'undefined' ? window.scrollY : 0 }),
    (s) => {
      if (s.period) setPeriod(s.period);
      if (s.priority) setPriority(s.priority);
      if (s.status) setStatus(s.status);
      scrollRef.current = s.scrollY || 0;
    }
  );
  useEffect(() => {
    if (!loading && scrollRef.current > 0) {
      const y = scrollRef.current;
      scrollRef.current = 0;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [loading]);

  const persistLayout = (next: LayoutState) => {
    setLayout(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next));
    }
  };

  const toggleExpand = (key: PanelKey) => persistLayout({ ...layout, expanded: layout.expanded === key ? null : key });
  const toggleCollapse = (key: PanelKey) => persistLayout({ ...layout, collapsed: { ...layout.collapsed, [key]: !layout.collapsed[key] } });

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const win = useMemo(() => periodWindow(period), [period]);

  const passesFilters = useCallback(
    (task: TripTask): boolean => {
      if (dismissed.has(task.id)) return false;
      if (priority !== 'all' && task.priority !== priority) return false;
      if (status !== 'all' && task.status !== status) return false;
      if (win && task.priority !== 'overdue' && task.dueAt) {
        const d = new Date(task.dueAt);
        if (d < win.from || d > win.to) return false;
      }
      return true;
    },
    [dismissed, priority, status, win]
  );

  const filteredData = useMemo<DayTasksResponse | null>(() => {
    if (!data) return null;
    return {
      ...data,
      logist: data.logist.map((c) => ({ ...c, items: c.items.filter(passesFilters), count: c.items.filter(passesFilters).length })),
      accountant: data.accountant.map((s) => ({ ...s, items: s.items.filter(passesFilters), count: s.items.filter(passesFilters).length })),
    };
  }, [data, passesFilters]);

  const panelOrder: PanelKey[] = ['logist', 'accountant', 'director'];
  const isDimmed = (key: PanelKey) => layout.expanded !== null && layout.expanded !== key;
  const gridColsClass = (key: PanelKey) => {
    if (layout.expanded === key) return 'xl:col-span-3';
    if (layout.expanded !== null) return 'hidden xl:block xl:col-span-0 xl:w-0 xl:overflow-hidden';
    return '';
  };

  return (
    <div className="space-y-4">
      <DayTasksHeader
        summary={data?.summary ?? null}
        loading={loading}
        onRefresh={load}
        search={search}
        onSearchChange={setSearch}
        period={period}
        onPeriodChange={setPeriod}
        priority={priority}
        onPriorityChange={setPriority}
        status={status}
        onStatusChange={setStatus}
      />

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error} <button onClick={load} className="underline">Повторить</button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-96 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : filteredData ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {panelOrder.map((key) => {
            if (layout.expanded !== null && layout.expanded !== key) return null;
            if (key === 'logist') {
              return (
                <div key={key} className={gridColsClass(key)}>
                  <LogistPanel
                    categories={filteredData.logist}
                    isExpanded={layout.expanded === 'logist'}
                    isCollapsed={layout.collapsed.logist}
                    isDimmed={isDimmed('logist')}
                    onToggleExpand={() => toggleExpand('logist')}
                    onToggleCollapse={() => toggleCollapse('logist')}
                    onDismiss={dismiss}
                  />
                </div>
              );
            }
            if (key === 'accountant') {
              return (
                <div key={key} className={gridColsClass(key)}>
                  <AccountantPanel
                    stages={filteredData.accountant}
                    isExpanded={layout.expanded === 'accountant'}
                    isCollapsed={layout.collapsed.accountant}
                    isDimmed={isDimmed('accountant')}
                    onToggleExpand={() => toggleExpand('accountant')}
                    onToggleCollapse={() => toggleCollapse('accountant')}
                    onDismiss={dismiss}
                  />
                </div>
              );
            }
            return (
              <div key={key} className={gridColsClass(key)}>
                <DirectorPanel
                  data={filteredData.director}
                  isExpanded={layout.expanded === 'director'}
                  isCollapsed={layout.collapsed.director}
                  isDimmed={isDimmed('director')}
                  onToggleExpand={() => toggleExpand('director')}
                  onToggleCollapse={() => toggleCollapse('director')}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
