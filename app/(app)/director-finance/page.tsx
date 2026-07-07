'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';
import { DirectorFinancePanels } from './_components/director-finance-panels';
import type { DirectorFinanceResponse } from './_components/types';

export default function DirectorFinancePage() {
  const [data, setData] = useState<DirectorFinanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/director-finance');
      if (!res.ok) throw new Error('Не удалось загрузить финансовый срез');
      const json = (await res.json()) as DirectorFinanceResponse;
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
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Финансы директора</h1>
          <p className="text-sm text-muted-foreground">
            Финансовый срез дня: ключевые показатели, структура доходов и расходов, риски и детализация заявок
          </p>
          {data?.asOf ? (
            <p className="mt-1 text-xs text-muted-foreground">Актуально на: {data.asOf}</p>
          ) : null}
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
          <Link href="/dashboard" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
            В дашборд
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading && !data ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : null}

      {!loading && data ? <DirectorFinancePanels data={data} /> : null}
    </div>
  );
}
