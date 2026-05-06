'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import CrumbLink from '@/components/nav/crumb-link';
import { Wallet, Filter, X } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Payment {
  id: string; type: string; amount: number; amountAmd: number;
  currency: string; exchangeRate: number | null;
  paymentDate: string; method: string | null; description: string | null;
  trip: {
    id: string; tripNumber: string; routeFrom: string; routeTo: string;
    client?: { name: string } | null;
    carrier?: { name: string } | null;
  };
}

export default function PaymentHistoryPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [type, setType] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchData = () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (dateFrom) sp.set('dateFrom', dateFrom);
    if (dateTo) sp.set('dateTo', dateTo);
    if (type) sp.set('type', type);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    fetch(`/api/payments/history${qs}`).then(r => r.json()).then(d => setPayments(d.payments || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const applyFilters = () => fetchData();
  const clearFilters = () => { setDateFrom(''); setDateTo(''); setType(''); setTimeout(fetchData, 0); };
  const hasFilters = !!(dateFrom || dateTo || type);

  const totalAmd = payments.reduce((s, p) => s + (p.amountAmd || 0), 0);
  const clientPayments = payments.filter(p => p.type === 'client');
  const carrierPayments = payments.filter(p => p.type === 'carrier');
  const clientTotal = clientPayments.reduce((s, p) => s + (p.amountAmd || 0), 0);
  const carrierTotal = carrierPayments.reduce((s, p) => s + (p.amountAmd || 0), 0);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-950 rounded-xl flex items-center justify-center">
            <Wallet className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">История платежей</h1>
            <p className="text-sm text-muted-foreground">{payments.length} записей</p>
          </div>
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
            hasFilters ? 'bg-primary text-white border-primary' : 'bg-card border-border text-foreground hover:bg-muted'
          }`}>
          <Filter className="w-3.5 h-3.5" /> Фильтры
        </button>
      </div>

      {showFilters && (
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Дата от</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Дата до</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Тип</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background">
                <option value="">Все</option>
                <option value="client">Клиент</option>
                <option value="carrier">Перевозчик</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button onClick={applyFilters} className="px-4 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition">Применить</button>
              {hasFilters && <button onClick={clearFilters} className="p-1.5 rounded-lg border border-border hover:bg-muted transition"><X className="w-4 h-4" /></button>}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Всего</p>
          <p className="text-lg font-bold mt-1 text-foreground">{formatCurrency(totalAmd)}</p>
          <p className="text-xs text-muted-foreground mt-1">{payments.length} платежей</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">От клиентов</p>
          <p className="text-lg font-bold mt-1 text-green-600">{formatCurrency(clientTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">{clientPayments.length} платежей</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Перевозчикам</p>
          <p className="text-lg font-bold mt-1 text-orange-600">{formatCurrency(carrierTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">{carrierPayments.length} платежей</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2.5 text-left font-semibold">Дата</th>
              <th className="px-3 py-2.5 text-left font-semibold">Заявка</th>
              <th className="px-3 py-2.5 text-left font-semibold">Тип</th>
              <th className="px-3 py-2.5 text-left font-semibold">Контрагент</th>
              <th className="px-3 py-2.5 text-right font-semibold">Сумма (AMD)</th>
              <th className="px-3 py-2.5 text-left font-semibold">Способ</th>
              <th className="px-3 py-2.5 text-left font-semibold">Описание</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition">
                <td className="px-3 py-2 text-xs whitespace-nowrap">{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('ru-RU') : '—'}</td>
                <td className="px-3 py-2">
                  <CrumbLink href={`/trips/${p.trip.id}`} fromLabel="Оплаты" fromKey="payment-history" className="text-primary hover:underline font-mono text-xs">{p.trip.tripNumber}</CrumbLink>
                  <div className="text-[11px] text-muted-foreground">{p.trip.routeFrom} → {p.trip.routeTo}</div>
                </td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    p.type === 'client' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
                  }`}>{p.type === 'client' ? 'Клиент' : 'Перевозчик'}</span>
                </td>
                <td className="px-3 py-2 text-xs">{p.type === 'client' ? p.trip.client?.name : p.trip.carrier?.name}</td>
                <td className="px-3 py-2 text-right font-mono text-xs font-bold">{formatCurrency(p.amountAmd)}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{p.method || '—'}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">{p.description || '—'}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Нет платежей</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
