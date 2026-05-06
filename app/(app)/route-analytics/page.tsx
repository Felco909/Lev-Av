'use client';
import { useEffect, useState } from 'react';
import { MapPinned, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Row {
  route: string; tripCount: number; totalRevenue: number;
  totalProfit: number; avgRate: number; avgProfit: number;
  lastTrip: string | null;
}

type SortKey = 'route' | 'tripCount' | 'totalRevenue' | 'totalProfit' | 'avgRate' | 'avgProfit';

export default function RouteAnalyticsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('totalRevenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/analytics/routes').then(r => r.json()).then(d => setRows(d.rows || [])).catch(() => {}).finally(() => setLoading(false));
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
    revenue: acc.revenue + r.totalRevenue,
    profit: acc.profit + r.totalProfit,
  }), { trips: 0, revenue: 0, profit: 0 });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-violet-100 dark:bg-violet-950 rounded-xl flex items-center justify-center">
          <MapPinned className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Аналитика по маршрутам</h1>
          <p className="text-sm text-muted-foreground">{rows.length} маршрутов</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: 'Всего заявок', value: totals.trips.toString(), color: 'text-violet-600' },
          { label: 'Выручка', value: formatCurrency(totals.revenue), color: 'text-green-600' },
          { label: 'Прибыль', value: formatCurrency(totals.profit), color: 'text-emerald-600' },
        ].map((c, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-lg font-bold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {[
                { k: 'route' as SortKey, label: 'Маршрут' },
                { k: 'tripCount' as SortKey, label: 'Заявки' },
                { k: 'totalRevenue' as SortKey, label: 'Выручка' },
                { k: 'totalProfit' as SortKey, label: 'Прибыль' },
                { k: 'avgRate' as SortKey, label: 'Сред. ставка' },
                { k: 'avgProfit' as SortKey, label: 'Сред. прибыль' },
              ].map(col => (
                <th key={col.k} className="px-3 py-2.5 text-left font-semibold cursor-pointer hover:bg-muted/80 whitespace-nowrap" onClick={() => toggleSort(col.k)}>
                  <span className="inline-flex items-center gap-1">{col.label} <SortIcon k={col.k} /></span>
                </th>
              ))}
              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Послед. заявка</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.route} className="border-b border-border/50 hover:bg-muted/30 transition">
                <td className="px-3 py-2 font-medium">{r.route}</td>
                <td className="px-3 py-2 text-center">{r.tripCount}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(r.totalRevenue)}</td>
                <td className={`px-3 py-2 text-right font-mono text-xs ${r.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(r.totalProfit)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(r.avgRate)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(r.avgProfit)}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.lastTrip ? new Date(r.lastTrip).toLocaleDateString('ru-RU') : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Нет данных</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
