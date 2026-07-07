'use client';

import type { ReactNode } from 'react';

type AsyncStateProps = {
  loading: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: string;
  onRetry?: () => void;
  skeleton?: ReactNode;
  children?: ReactNode;
};

export function AsyncState({
  loading,
  error,
  empty,
  emptyMessage = 'Данных пока нет.',
  onRetry,
  skeleton,
  children,
}: AsyncStateProps) {
  if (loading) {
    return (
      <>
        {skeleton ?? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        )}
      </>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-medium">Не удалось загрузить данные</p>
        <p className="mt-1 text-red-700">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            Повторить
          </button>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        <p>{emptyMessage}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted/50"
          >
            Обновить
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
