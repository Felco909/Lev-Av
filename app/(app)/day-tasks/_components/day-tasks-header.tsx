'use client';

import Link from 'next/link';
import { Search, RefreshCw, Loader2, LayoutDashboard, CalendarDays, Route, ListChecks, AlertTriangle, Flame } from 'lucide-react';
import type { DayTasksSummary, PeriodFilter, Priority } from './types';

const PERIODS: { key: PeriodFilter; label: string }[] = [
  { key: 'today', label: 'Сегодня' },
  { key: 'tomorrow', label: 'Завтра' },
  { key: 'week', label: 'Неделя' },
  { key: 'all', label: 'Все' },
];

const PRIORITIES: { key: Priority | 'all'; label: string }[] = [
  { key: 'all', label: 'Все приоритеты' },
  { key: 'overdue', label: '🔴 Просрочено' },
  { key: 'urgent', label: '🟠 Срочно' },
  { key: 'attention', label: '🟡 Внимание' },
  { key: 'normal', label: '🟢 Норма' },
];

const STATUSES: { key: string; label: string }[] = [
  { key: 'all', label: 'Все статусы' },
  { key: 'new', label: 'Новая' },
  { key: 'in_progress', label: 'В пути' },
  { key: 'unloaded', label: 'Разгружен' },
  { key: 'awaiting_payment', label: 'На оплату' },
  { key: 'sverka', label: 'Сверка' },
];

function Counter({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: 'danger' | 'warning' }) {
  const cls = tone === 'danger' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : 'text-foreground';
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <b className={`font-mono ${cls}`}>{value}</b>
    </div>
  );
}

export function DayTasksHeader({
  summary,
  loading,
  onRefresh,
  search,
  onSearchChange,
  period,
  onPeriodChange,
  priority,
  onPriorityChange,
  status,
  onStatusChange,
}: {
  summary: DayTasksSummary | null;
  loading: boolean;
  onRefresh: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  period: PeriodFilter;
  onPeriodChange: (v: PeriodFilter) => void;
  priority: Priority | 'all';
  onPriorityChange: (v: Priority | 'all') => void;
  status: string;
  onStatusChange: (v: string) => void;
}) {
  const lastUpdated = summary?.lastUpdated ? new Date(summary.lastUpdated).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-display font-bold tracking-tight lg:text-2xl">
              <CalendarDays className="h-6 w-6 text-primary" /> Лист дня
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary ? `${new Date(summary.date).toLocaleDateString('ru-RU')}, ${summary.weekday}` : 'Daily Workspace'} · обновлено {lastUpdated}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Поиск: заявка, клиент, машина, водитель, перевозчик…"
                className="w-64 rounded-lg border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Обновить
            </button>
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </Link>
          </div>
        </div>

        {summary ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t pt-3 text-sm">
            <Counter icon={<Route className="h-3.5 w-3.5 text-blue-600" />} label="Активных рейсов" value={summary.activeTripsCount} />
            <Counter icon={<ListChecks className="h-3.5 w-3.5 text-primary" />} label="Задач сегодня" value={summary.tasksTodayCount} />
            <Counter icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-600" />} label="Просрочено" value={summary.overdueTasksCount} tone={summary.overdueTasksCount > 0 ? 'warning' : undefined} />
            <Counter icon={<Flame className="h-3.5 w-3.5 text-red-600" />} label="Критично" value={summary.criticalEventsCount} tone={summary.criticalEventsCount > 0 ? 'danger' : undefined} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-sm">
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => onPeriodChange(p.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                period === p.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <select
          value={priority}
          onChange={(e) => onPriorityChange(e.target.value as Priority | 'all')}
          className="rounded-lg border bg-background px-2 py-1.5 text-xs"
        >
          {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="rounded-lg border bg-background px-2 py-1.5 text-xs"
        >
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>
    </div>
  );
}
