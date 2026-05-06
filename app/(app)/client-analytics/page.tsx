'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, TrendingUp, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Row {
  clientId: string; clientName: string; phone?: string;
  tripCount: number; revenue: number; profit: number;
  avgCheck: number; avgProfit: number; unpaidPct: number;
  debt: number; lastTrip: string | null;
}

type SortKey = 'clientName' | 'tripCount' | 'revenue' | 'profit' | 'avgCheck' | 'avgProfit' | 'unpaidPct' | 'debt';

export default function ClientAnalyticsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/analytics/clients').then(r => r.json()).then(d => setRows(d.rows || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === 'string') return sortDir === 'asc' ? (av as string).localeCompare(bv as string) : (bv as string).localeCompare(av as string);
    return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const totals = rows.reduce((acc, r) => ({
    trips: acc.trips + r.tripCount,
    revenue: acc.revenue + r.revenue,
    profit: acc.profit + r.profit,
    debt: acc.debt + r.debt,
  }), { trips: 0, revenue: 0, profit: 0, debt: 0 });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-950 rounded-xl flex items-center justify-center">
          <Users className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Аналитика по клиентам</h1>
          <p className="text-sm text-muted-foreground">{rows.length} клиентов с заявками</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Заявок', value: totals.trips.toString(), color: 'text-blue-600' },
          { label: 'Выручка', value: formatCurrency(totals.revenue), color: 'text-green-600' },
          { label: 'Прибыль', value: formatCurrency(totals.profit), color: 'text-emerald-600' },
          { label: 'Общий долг', value: formatCurrency(totals.debt), color: 'text-red-600' },
        ].map((c, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-lg font-bold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {[
                { k: 'clientName' as SortKey, label: 'Клиент' },
                { k: 'tripCount' as SortKey, label: 'Заявки' },
                { k: 'revenue' as SortKey, label: 'Выручка' },
                { k: 'profit' as SortKey, label: 'Прибыль' },
                { k: 'avgCheck' as SortKey, label: 'Сред. чек' },
                { k: 'avgProfit' as SortKey, label: 'Сред. прибыль' },
                { k: 'unpaidPct' as SortKey, label: '% неоплач.' },
                { k: 'debt' as SortKey, label: 'Долг' },
              ].map(col => (
                <th key={col.k} className="px-3 py-2.5 text-left font-semibold cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => toggleSort(col.k)}>
                  <span className="inline-flex items-center gap-1">{col.label} <SortIcon k={col.k} /></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.clientId} className="border-b border-border/50 hover:bg-muted/30 transition">
                <td className="px-3 py-2">
                  <Link href={`/clients/${r.clientId}`} className="text-primary hover:underline font-medium">{r.clientName}</Link>
                </td>
                <td className="px-3 py-2 text-center">{r.tripCount}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(r.revenue)}</td>
                <td className={`px-3 py-2 text-right font-mono text-xs ${r.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(r.profit)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(r.avgCheck)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(r.avgProfit)}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    r.unpaidPct > 50 ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' :
                    r.unpaidPct > 20 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
                    'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                  }`}>{Math.round(r.unpaidPct)}%</span>
                </td>
                <td className={`px-3 py-2 text-right font-mono text-xs font-bold ${r.debt > 0 ? 'text-red-600' : ''}`}>{formatCurrency(r.debt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Нет данных</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
