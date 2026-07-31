'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import type { TripTask } from './types';
import { TripTaskCard } from './trip-task-card';

export function TaskCategoryBlock({
  icon,
  title,
  count,
  items,
  defaultOpen = true,
  onDismiss,
}: {
  icon?: ReactNode;
  title: string;
  count: number;
  items: TripTask[];
  defaultOpen?: boolean;
  onDismiss?: (id: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen && count > 0);

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted/50"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {icon}
          {title}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${count > 0 ? 'bg-muted text-foreground' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40'}`}>
          {count}
        </span>
      </button>
      {open ? (
        <div className="space-y-2 border-t p-3">
          {items.length === 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Нет задач в этой категории
            </div>
          ) : (
            items.map((item) => <TripTaskCard key={item.id} task={item} onDismiss={onDismiss} />)
          )}
        </div>
      ) : null}
    </div>
  );
}
