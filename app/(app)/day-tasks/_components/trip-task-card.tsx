'use client';

import CrumbLink from '@/components/nav/crumb-link';
import { Phone, FolderOpen, Pencil, CheckCircle2, WifiOff } from 'lucide-react';
import type { TripTask } from './types';
import { priorityRowBg, priorityText, priorityBadge, priorityDot, priorityBorder } from './priority';

const STATUS_LABEL: Record<string, string> = {
  new: 'Новая',
  in_progress: 'В пути',
  unloaded: 'Разгружен',
  awaiting_payment: 'На оплату',
  sverka: 'Сверка',
  completed: 'Завершён',
};

function fmtAmd(v: number): string {
  return `${Math.round(v).toLocaleString('ru-RU')} ֏`;
}

function fmtDue(dueAt: string | null): string | null {
  if (!dueAt) return null;
  try {
    return new Date(dueAt).toLocaleDateString('ru-RU');
  } catch {
    return dueAt;
  }
}

export function TripTaskCard({ task, onDismiss }: { task: TripTask; onDismiss?: (id: string) => void }) {
  const due = fmtDue(task.dueAt);

  return (
    <div className={`rounded-lg border p-3 text-sm transition-colors ${priorityRowBg(task.priority)} ${priorityBorder(task.priority)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span>{priorityDot(task.priority)}</span>
            <CrumbLink href={`/trips/${task.tripId}`} fromLabel="Лист дня" fromKey="day-tasks" className="font-mono text-xs font-semibold text-primary hover:underline">
              {task.tripNumber}
            </CrumbLink>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${priorityBadge(task.priority)}`}>
              {STATUS_LABEL[task.status] ?? task.status}
            </span>
            {task.gpsStatus === 'no_signal' ? (
              <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                <WifiOff className="h-2.5 w-2.5" /> нет связи
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{task.route}</p>
        </div>
        {task.amountAmd != null ? (
          <span className={`shrink-0 font-mono text-xs ${priorityText(task.priority)}`}>{fmtAmd(task.amountAmd)}</span>
        ) : null}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {task.clientName ? <span className="truncate">Клиент: {task.clientName}</span> : null}
        {task.carrierName ? <span className="truncate">Перевозчик: {task.carrierName}</span> : null}
        {task.vehiclePlate ? <span className="truncate">Машина: {task.vehiclePlate}</span> : null}
        {task.driverName ? <span className="truncate">Водитель: {task.driverName}</span> : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium">→ {task.nextAction}{due ? ` (${due})` : ''}</p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1 border-t pt-2">
        <CrumbLink href={`/trips/${task.tripId}`} fromLabel="Лист дня" fromKey="day-tasks" className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted" title="Открыть заявку">
          <FolderOpen className="h-3 w-3" /> Открыть
        </CrumbLink>
        {task.clientPhone ? (
          <a href={`tel:${task.clientPhone}`} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-blue-600 hover:bg-muted" title="Позвонить клиенту">
            <Phone className="h-3 w-3" /> Клиент
          </a>
        ) : null}
        {task.driverPhone ? (
          <a href={`tel:${task.driverPhone}`} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-blue-600 hover:bg-muted" title="Позвонить водителю">
            <Phone className="h-3 w-3" /> Водитель
          </a>
        ) : null}
        <CrumbLink href={`/trips/${task.tripId}/edit`} fromLabel="Лист дня" fromKey="day-tasks" className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted" title="Изменить статус">
          <Pencil className="h-3 w-3" /> Статус
        </CrumbLink>
        <button
          type="button"
          onClick={() => onDismiss?.(task.id)}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
          title="Скрыть до следующего обновления (данные заявки при этом не меняются)"
        >
          <CheckCircle2 className="h-3 w-3" /> Готово
        </button>
      </div>
    </div>
  );
}
