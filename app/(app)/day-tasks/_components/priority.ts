import type { Priority } from './types';

/** Единая 4-уровневая палитра — та же, что уже используется в /debts (tripRowBg/remainingClass),
 *  переиспользуется здесь для визуальной согласованности между разделами. */
export function priorityRowBg(p: Priority): string {
  if (p === 'overdue') return 'bg-red-50/60 dark:bg-red-950/20';
  if (p === 'urgent') return 'bg-orange-50/60 dark:bg-orange-950/20';
  if (p === 'attention') return 'bg-amber-50/40 dark:bg-amber-950/20';
  return '';
}

export function priorityText(p: Priority): string {
  if (p === 'overdue') return 'text-red-600 font-bold';
  if (p === 'urgent') return 'text-orange-700 dark:text-orange-400 font-semibold';
  if (p === 'attention') return 'text-amber-700 dark:text-amber-400 font-semibold';
  return 'font-semibold';
}

export function priorityBadge(p: Priority): string {
  if (p === 'overdue') return 'text-red-700 bg-red-100 dark:bg-red-950/50 dark:text-red-300';
  if (p === 'urgent') return 'text-orange-800 bg-orange-100 dark:bg-orange-950/50 dark:text-orange-300';
  if (p === 'attention') return 'text-amber-800 bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300';
  return 'text-emerald-700 bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300';
}

export function priorityDot(p: Priority): string {
  if (p === 'overdue') return '🔴';
  if (p === 'urgent') return '🟠';
  if (p === 'attention') return '🟡';
  return '🟢';
}

export function priorityBorder(p: Priority): string {
  if (p === 'overdue') return 'border-red-200 dark:border-red-900';
  if (p === 'urgent') return 'border-orange-200 dark:border-orange-900';
  if (p === 'attention') return 'border-amber-200 dark:border-amber-900';
  return 'border-border';
}
