'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import CrumbLink from '@/components/nav/crumb-link';
import { useNavState } from '@/hooks/use-nav-state';
import { Wallet, ArrowUpRight, ArrowDownRight, Eye, AlertTriangle, Clock } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface DebtRow {
  id: string;
  tripNumber: string;
  clientName?: string;
  carrierName?: string;
  rateAmd: number;
  paidAmd: number;
  remaining: number;
  tripDate: string;
  status: string;
  paymentDueDate: string | null;
  daysLeft: number | null;
  isOverdue: boolean;
  isUrgent: boolean;
}

export default function DebtsPage() {
  const [loading, setLoading] = useState(true);
  const [clientDebts, setClientDebts] = useState<DebtRow[]>([]);
  const [carrierDebts, setCarrierDebts] = useState<DebtRow[]>([]);
  const [totalClient, setTotalClient] = useState(0);
  const [totalCarrier, setTotalCarrier] = useState(0);

  useEffect(() => {
    fetch('/api/debts')
      .then(r => r.json())
      .then(data => {
        setClientDebts(data?.clientDebts ?? []);
        setCarrierDebts(data?.carrierDebts ?? []);
        setTotalClient(data?.totalClientDebt ?? 0);
        setTotalCarrier(data?.totalCarrierDebt ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ═══ Navigation state preservation (scroll only) ═══
  const scrollRef = useRef(0);
  useNavState('debts',
    () => ({ scrollY: typeof window !== 'undefined' ? window.scrollY : 0 }),
    (s) => { scrollRef.current = s.scrollY || 0; }
  );

  useEffect(() => {
    if (!loading && scrollRef.current > 0) {
      const y = scrollRef.current;
      scrollRef.current = 0;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [loading]);

  const fmt = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 0 });

  // Sort: overdue first, then urgent, then normal, then no-date
  const sortByUrgency = (a: DebtRow, b: DebtRow) => {
    const scoreA = a.isOverdue ? 0 : a.isUrgent ? 1 : a.paymentDueDate ? 2 : 3;
    const scoreB = b.isOverdue ? 0 : b.isUrgent ? 1 : b.paymentDueDate ? 2 : 3;
    if (scoreA !== scoreB) return scoreA - scoreB;
    if (a.daysLeft != null && b.daysLeft != null) return a.daysLeft - b.daysLeft;
    return 0;
  };
  const sortedClient = [...clientDebts].sort(sortByUrgency);
  const sortedCarrier = [...carrierDebts].sort(sortByUrgency);

  // Totals only for truly OVERDUE debt (красная строка банка)
  const overdueClientTotal = sortedClient.filter(d => d.isOverdue).reduce((s, d) => s + d.remaining, 0);
  const overdueCarrierTotal = sortedCarrier.filter(d => d.isOverdue).reduce((s, d) => s + d.remaining, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const renderDueCell = (d: DebtRow) => {
    if (!d.paymentDueDate) {
      return <span className="text-xs text-muted-foreground">—</span>;
    }
    const dateStr = new Date(d.paymentDueDate).toLocaleDateString('ru-RU');
    if (d.isOverdue) {
      return (
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs font-mono text-red-700 dark:text-red-400">{dateStr}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-100 dark:bg-red-950/50 dark:text-red-300 px-1.5 py-0.5 rounded">
            <AlertTriangle className="w-2.5 h-2.5" /> просрочено {Math.abs(d.daysLeft ?? 0)} дн.
          </span>
        </div>
      );
    }
    if (d.isUrgent) {
      return (
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs font-mono text-amber-700 dark:text-amber-400">{dateStr}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 px-1.5 py-0.5 rounded">
            <Clock className="w-2.5 h-2.5" /> {d.daysLeft === 0 ? 'сегодня' : `через ${d.daysLeft} дн.`}
          </span>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-xs font-mono text-muted-foreground">{dateStr}</span>
        {d.daysLeft != null && <span className="text-[10px] text-muted-foreground">через {d.daysLeft} дн.</span>}
      </div>
    );
  };

  const remainingCellClass = (d: DebtRow) =>
    d.isOverdue
      ? 'text-red-600 font-bold'
      : d.isUrgent
      ? 'text-amber-700 dark:text-amber-400 font-semibold'
      : 'text-foreground font-semibold';

  const rowBgClass = (d: DebtRow) =>
    d.isOverdue
      ? 'bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30'
      : d.isUrgent
      ? 'bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30'
      : 'hover:bg-muted/30';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight flex items-center gap-2">
          <Wallet className="w-6 h-6 text-primary" /> Долги
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Кто должен нам и кому должны мы</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl shadow-sm p-5 border-l-4 border-green-500">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/30">
              <ArrowDownRight className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Нам должны</p>
              <p className="text-2xl font-bold font-mono text-green-700 dark:text-green-400">{fmt(totalClient)} ֏</p>
              <p className="text-[10px] text-muted-foreground">{clientDebts.length} заяв{clientDebts.length === 1 ? 'ка' : clientDebts.length < 5 ? 'ки' : 'ок'}</p>
              {overdueClientTotal > 0 && (
                <p className="mt-1 text-[11px] font-semibold text-red-700 dark:text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Просрочено: {fmt(overdueClientTotal)} ֏
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-5 border-l-4 border-red-500">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/30">
              <ArrowUpRight className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Мы должны</p>
              <p className="text-2xl font-bold font-mono text-red-700 dark:text-red-400">{fmt(totalCarrier)} ֏</p>
              <p className="text-[10px] text-muted-foreground">{carrierDebts.length} заяв{carrierDebts.length === 1 ? 'ка' : carrierDebts.length < 5 ? 'ки' : 'ок'}</p>
              {overdueCarrierTotal > 0 && (
                <p className="mt-1 text-[11px] font-semibold text-red-700 dark:text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Просрочено: {fmt(overdueCarrierTotal)} ֏
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-red-500" /> Просрочка (срок оплаты прошёл)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-amber-500" /> Срок через 1–3 дня
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-slate-300" /> Без установленного срока или срок далёкий
        </span>
      </div>

      {/* Client debts table */}
      <div className="bg-card rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <ArrowDownRight className="w-4 h-4 text-green-600" />
            Долги клиентов
            <span className="text-xs text-muted-foreground font-normal">(нам должны)</span>
          </h2>
        </div>
        {sortedClient.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Нет долгов клиентов</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Заявка</th>
                  <th className="text-left px-4 py-3 font-medium">Клиент</th>
                  <th className="text-right px-4 py-3 font-medium">Ставка</th>
                  <th className="text-right px-4 py-3 font-medium">Оплачено</th>
                  <th className="text-right px-4 py-3 font-medium">Остаток</th>
                  <th className="text-right px-4 py-3 font-medium">Срок оплаты</th>
                  <th className="text-right px-4 py-3 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sortedClient.map(d => (
                  <tr key={d.id} className={`border-b border-muted last:border-0 transition-colors ${rowBgClass(d)}`}>
                    <td className="px-4 py-3">
                      <CrumbLink href={`/trips/${d.id}`} fromLabel="Долги" fromKey="debts" className="font-mono text-xs text-primary hover:underline">{d.tripNumber}</CrumbLink>
                      <div className="text-[10px] text-muted-foreground">{formatDate(d.tripDate)}</div>
                    </td>
                    <td className="px-4 py-3">{d.clientName}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(d.rateAmd)} ֏</td>
                    <td className="px-4 py-3 text-right font-mono text-green-600">{fmt(d.paidAmd)} ֏</td>
                    <td className={`px-4 py-3 text-right font-mono ${remainingCellClass(d)}`}>{fmt(d.remaining)} ֏</td>
                    <td className="px-4 py-3 text-right">{renderDueCell(d)}</td>
                    <td className="px-4 py-3 text-right">
                      <CrumbLink href={`/trips/${d.id}`} fromLabel="Долги" fromKey="debts" className="p-1.5 hover:bg-muted rounded-md transition inline-block" title="Просмотр">
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      </CrumbLink>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 font-semibold">
                  <td className="px-4 py-3" colSpan={4}>Итого</td>
                  <td className="px-4 py-3 text-right font-mono text-red-600">{fmt(totalClient)} ֏</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Carrier debts table */}
      <div className="bg-card rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-red-600" />
            Долги перевозчикам
            <span className="text-xs text-muted-foreground font-normal">(мы должны)</span>
          </h2>
        </div>
        {sortedCarrier.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Нет долгов перевозчикам</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Заявка</th>
                  <th className="text-left px-4 py-3 font-medium">Перевозчик</th>
                  <th className="text-right px-4 py-3 font-medium">Сумма</th>
                  <th className="text-right px-4 py-3 font-medium">Оплачено</th>
                  <th className="text-right px-4 py-3 font-medium">Остаток</th>
                  <th className="text-right px-4 py-3 font-medium">Срок оплаты</th>
                  <th className="text-right px-4 py-3 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sortedCarrier.map(d => (
                  <tr key={d.id} className={`border-b border-muted last:border-0 transition-colors ${rowBgClass(d)}`}>
                    <td className="px-4 py-3">
                      <CrumbLink href={`/trips/${d.id}`} fromLabel="Долги" fromKey="debts" className="font-mono text-xs text-primary hover:underline">{d.tripNumber}</CrumbLink>
                      <div className="text-[10px] text-muted-foreground">{formatDate(d.tripDate)}</div>
                    </td>
                    <td className="px-4 py-3">{d.carrierName}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(d.rateAmd)} ֏</td>
                    <td className="px-4 py-3 text-right font-mono text-green-600">{fmt(d.paidAmd)} ֏</td>
                    <td className={`px-4 py-3 text-right font-mono ${remainingCellClass(d)}`}>{fmt(d.remaining)} ֏</td>
                    <td className="px-4 py-3 text-right">{renderDueCell(d)}</td>
                    <td className="px-4 py-3 text-right">
                      <CrumbLink href={`/trips/${d.id}`} fromLabel="Долги" fromKey="debts" className="p-1.5 hover:bg-muted rounded-md transition inline-block" title="Просмотр">
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      </CrumbLink>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 font-semibold">
                  <td className="px-4 py-3" colSpan={4}>Итого</td>
                  <td className="px-4 py-3 text-right font-mono text-red-600">{fmt(totalCarrier)} ֏</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
