'use client';
import { useEffect, useState, useCallback } from 'react';
import { Truck, UserCheck, Building2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import dynamic from 'next/dynamic';

const TripsBarChart = dynamic(() => import('./_components/stat-charts').then(m => m.TripsBarChart), { ssr: false, loading: () => <div className="h-64 bg-muted animate-pulse rounded-lg" /> });
const ProfitBarChart = dynamic(() => import('./_components/stat-charts').then(m => m.ProfitBarChart), { ssr: false, loading: () => <div className="h-64 bg-muted animate-pulse rounded-lg" /> });
const TripsPieChart = dynamic(() => import('./_components/stat-charts').then(m => m.TripsPieChart), { ssr: false, loading: () => <div className="h-64 bg-muted animate-pulse rounded-lg" /> });

interface StatItem {
  id: string | null;
  name: string;
  trips: number;
  profit: number;
  revenue: number;
  cost?: number;
}

interface FleetStats {
  driverStats: StatItem[];
  vehicleStats: StatItem[];
  carrierStats: StatItem[];
}

export default function StatisticsPage() {
  const [data, setData] = useState<FleetStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'drivers' | 'vehicles' | 'carriers'>('drivers');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/stats/fleet');
      const d = await res.json();
      setData(d);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>;

  const tabs = [
    { key: 'drivers' as const, label: 'Водители', icon: UserCheck, data: data?.driverStats ?? [] },
    { key: 'vehicles' as const, label: 'Машины', icon: Truck, data: data?.vehicleStats ?? [] },
    { key: 'carriers' as const, label: 'Перевозчики', icon: Building2, data: data?.carrierStats ?? [] },
  ];

  const current = tabs.find(t => t.key === tab)!;
  const totalTrips = current.data.reduce((s, d) => s + d.trips, 0);
  const totalProfit = current.data.reduce((s, d) => s + d.profit, 0);
  const totalRevenue = current.data.reduce((s, d) => s + d.revenue, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Статистика</h1>
          <p className="text-sm text-muted-foreground">Аналитика по водителям, машинам и перевозчикам</p>
        </div>
        <Link href="/reports" className="flex items-center gap-1.5 text-sm text-primary hover:underline">
          Отчёты <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.key ? 'bg-primary text-white' : 'bg-card border hover:bg-muted'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Всего заявок</p>
          <p className="text-2xl font-bold font-mono mt-2">{totalTrips}</p>
        </div>
        <div className="bg-card rounded-xl p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Выручка</p>
          <p className="text-2xl font-bold font-mono mt-2">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-card rounded-xl p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Прибыль</p>
          <p className="text-2xl font-bold font-mono text-green-600 mt-2">{formatCurrency(totalProfit)}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold mb-3">Количество заявок</h3>
          <div className="h-64">
            <TripsBarChart data={current.data} label={current.label} />
          </div>
        </div>
        <div className="bg-card rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold mb-3">Финансы</h3>
          <div className="h-64">
            <ProfitBarChart data={current.data} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 pb-0"><h3 className="text-sm font-semibold">Детализация</h3></div>
        <div className="p-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b">
              <th className="text-left py-2 font-medium">Название</th>
              <th className="text-center py-2 font-medium">Заявки</th>
              <th className="text-right py-2 font-medium">Выручка</th>
              <th className="text-right py-2 font-medium">Прибыль</th>
              <th className="text-right py-2 font-medium">Ср. прибыль/заявку</th>
            </tr></thead>
            <tbody>
              {current.data.map((item, i) => (
                <tr key={i} className="border-b border-muted last:border-0 hover:bg-muted/50">
                  <td className="py-2.5 font-medium">{item.name}</td>
                  <td className="py-2.5 text-center font-mono">{item.trips}</td>
                  <td className="py-2.5 text-right font-mono">{formatCurrency(item.revenue)}</td>
                  <td className={`py-2.5 text-right font-mono ${item.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(item.profit)}</td>
                  <td className="py-2.5 text-right font-mono text-muted-foreground">{formatCurrency(item.trips > 0 ? item.profit / item.trips : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
