'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';
import { DailyReportsPanels } from './_components/daily-reports-panels';
import type { DailyReportsResponse } from './_components/types';

export default function DailyReportsPage() {
  const [data, setData] = useState<DailyReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/daily-reports');
      if (!res.ok) throw new Error('Не удалось загрузить ежедневные отчёты');
      const json = (await res.json()) as DailyReportsResponse;
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка загрузки');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Ежедневные отчёты</h1>
          <p className="text-sm text-muted-foreground">
            Операционный срез дня: план-факт, долги по просрочке, денежный поток и сравнение собственного транспорта с экспедицией
          </p>
          {data?.asOf ? <p className="mt-1 text-xs text-muted-foreground">Актуально на: {data.asOf}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Обновить
          </button>
          <Link href="/reports" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
            В отчёты
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading && !data ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : null}

      {!loading && data ? <DailyReportsPanels data={data} /> : null}
    </div>
  );
}
