'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import CrumbLink from '@/components/nav/crumb-link';
import { useNavState } from '@/hooks/use-nav-state';
import { Wallet, ArrowUpRight, ArrowDownRight, Eye, AlertTriangle, Clock } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface TripDebtRow {
  id: string;
  tripNumber: string;
  routeFrom: string;
  routeTo: string;
  rateAmd: number;
  paidAmd: number;
  remaining: number;
  tripDate: string;
  status: string;
  paymentDueDate: string | null;
  daysLeft: number | null;
  isOverdue: boolean;
  isUrgent: boolean;
  cashGap: number;
}

interface GroupedClient {
  client: { id: string; name: string; phone: string | null; email: string | null };
  trips: TripDebtRow[];
  totalDebt: number;
}

interface GroupedCarrier {
  carrier: { id: string; name: string };
  trips: TripDebtRow[];
  totalDebt: number;
}

export default function DebtsPage() {
  const [loading, setLoading] = useState(true);
  const [groupedClient, setGroupedClient] = useState<GroupedClient[]>([]);
  const [groupedCarrier, setGroupedCarrier] = useState<GroupedCarrier[]>([]);
  const [totalClient, setTotalClient] = useState(0);
  const [totalCarrier, setTotalCarrier] = useState(0);

  useEffect(() => {
    fetch('/api/debts')
      .then(r => r.json())
      .then(data => {
        setGroupedClient(data?.grouped ?? []);
        setGroupedCarrier(data?.groupedCarrier ?? []);
        setTotalClient(data?.totalClientDebt ?? 0);
        setTotalCarrier(data?.totalCarrierDebt ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  const totalClientTrips = groupedClient.reduce((s, g) => s + g.trips.length, 0);
  const totalCarrierTrips = groupedCarrier.reduce((s, g) => s + g.trips.length, 0);
  const overdueClientTotal = groupedClient.flatMap(g => g.trips).filter(t => t.isOverdue).reduce((s, t) => s + t.remaining, 0);
  const overdueCarrierTotal = groupedCarrier.flatMap(g => g.trips).filter(t => t.isOverdue).reduce((s, t) => s + t.remaining, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const tripRowBg = (t: TripDebtRow) => {
    if (t.isOverdue) return 'bg-red-50/60 dark:bg-red-950/20';
    if (t.cashGap > 0) return 'bg-orange-50/60 dark:bg-orange-950/20';
    if (t.isUrgent) return 'bg-amber-50/40 dark:bg-amber-950/20';
    return '';
  };

  const remainingClass = (t: TripDebtRow) => {
    if (t.isOverdue) return 'text-red-600 font-bold';
    if (t.cashGap > 0) return 'text-orange-700 dark:text-orange-400 font-semibold';
    if (t.isUrgent) return 'text-amber-700 dark:text-amber-400 font-semibold';
    return 'font-semibold';
  };

  const renderDue = (t: TripDebtRow) => {
    if (!t.paymentDueDate) return <span className="text-xs text-muted-foreground">—</span>;
    const dateStr = new Date(t.paymentDueDate).toLocaleDateString('ru-RU');
    if (t.isOverdue) {
      return (
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs font-mono text-red-700 dark:text-red-400">{dateStr}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-100 dark:bg-red-950/50 dark:text-red-300 px-1.5 py-0.5 rounded">
            <AlertTriangle className="w-2.5 h-2.5" /> просрочено {Math.abs(t.daysLeft ?? 0)} дн.
          </span>
        </div>
      );
    }
    if (t.isUrgent) {
      return (
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs font-mono text-amber-700 dark:text-amber-400">{dateStr}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 px-1.5 py-0.5 rounded">
            <Clock className="w-2.5 h-2.5" /> {t.daysLeft === 0 ? 'сегодня' : `через ${t.daysLeft} дн.`}
          </span>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-xs font-mono text-muted-foreground">{dateStr}</span>
        {t.daysLeft != null && <span className="text-[10px] text-muted-foreground">через {t.daysLeft} дн.</span>}
      </div>
    );
  };

  const sortTrips = (trips: TripDebtRow[]) =>
    [...trips].sort((a, b) => {
      const sa = a.isOverdue ? 0 : a.cashGap > 0 ? 1 : a.isUrgent ? 2 : a.paymentDueDate ? 3 : 4;
      const sb = b.isOverdue ? 0 : b.cashGap > 0 ? 1 : b.isUrgent ? 2 : b.paymentDueDate ? 3 : 4;
      if (sa !== sb) return sa - sb;
      if (a.daysLeft != null && b.daysLeft != null) return a.daysLeft - b.daysLeft;
      return 0;
    });

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
              <p className="text-[10px] text-muted-foreground">{totalClientTrips} заяв{totalClientTrips === 1 ? 'ка' : totalClientTrips < 5 ? 'ки' : 'ок'} · {groupedClient.length} клиент{groupedClient.length === 1 ? '' : groupedClient.length < 5 ? 'а' : 'ов'}</p>
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
              <p className="text-[10px] text-muted-foreground">{totalCarrierTrips} заяв{totalCarrierTrips === 1 ? 'ка' : totalCarrierTrips < 5 ? 'ки' : 'ок'} · {groupedCarrier.length} перевозчик{groupedCarrier.length === 1 ? '' : groupedCarrier.length < 5 ? 'а' : 'ов'}</p>
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
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-500" /> Просрочка</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-orange-400" /> Кассовый разрыв</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-400" /> Срок через 1–3 дня</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-slate-300" /> Без срока / далёкий срок</span>
      </div>

      {/* Client debts — grouped by client */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <ArrowDownRight className="w-4 h-4 text-green-600" />
          Долги клиентов
          <span className="text-xs text-muted-foreground font-normal">(нам должны)</span>
        </h2>

        {groupedClient.length === 0 ? (
          <div className="bg-card rounded-xl p-8 text-center text-muted-foreground text-sm">Нет долгов клиентов</div>
        ) : (
          groupedClient.map(group => (
            <div key={group.client.id} className="bg-card rounded-xl shadow-sm overflow-hidden">
              {/* Client header */}
              <div className="px-5 py-3 bg-muted/30 flex items-center justify-between gap-3 border-b">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold truncate">{group.client.name}</span>
                  {group.client.phone && (
                    <a href={`tel:${group.client.phone}`} className="text-xs text-muted-foreground hover:text-primary hidden sm:block">{group.client.phone}</a>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-sm font-bold font-mono text-red-600">{fmt(group.totalDebt)} ֏</span>
                  <span className="text-[10px] text-muted-foreground ml-1.5">{group.trips.length} заяв.</span>
                </div>
              </div>

              {/* Trips */}
              <div className="divide-y divide-muted">
                {sortTrips(group.trips).map(t => (
                  <div key={t.id} className={`px-4 py-3 flex items-center gap-2 flex-wrap transition-colors ${tripRowBg(t)}`}>
                    {/* Trip number + date */}
                    <div className="min-w-[80px]">
                      <CrumbLink href={`/trips/${t.id}`} fromLabel="Долги" fromKey="debts" className="font-mono text-xs text-primary hover:underline font-semibold">{t.tripNumber}</CrumbLink>
                      <div className="text-[10px] text-muted-foreground">{formatDate(t.tripDate)}</div>
                    </div>

                    {/* Route */}
                    {(t.routeFrom || t.routeTo) && (
                      <div className="flex-1 min-w-[100px] text-xs text-muted-foreground truncate">
                        {t.routeFrom}{t.routeFrom && t.routeTo ? ' → ' : ''}{t.routeTo}
                      </div>
                    )}

                    {/* Cash gap badge */}
                    {t.cashGap > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-700 bg-orange-100 dark:bg-orange-950/50 dark:text-orange-300 px-1.5 py-0.5 rounded whitespace-nowrap">
                        ⚠ разрыв {fmt(t.cashGap)} ֏
                      </span>
                    )}

                    {/* Financials */}
                    <div className="flex items-center gap-3 text-xs ml-auto shrink-0">
                      <span className="text-muted-foreground font-mono">{fmt(t.rateAmd)} ֏</span>
                      <span className="text-green-600 font-mono">{fmt(t.paidAmd)} ֏</span>
                      <span className={`font-mono ${remainingClass(t)}`}>{fmt(t.remaining)} ֏</span>
                    </div>

                    {/* Due date */}
                    <div className="shrink-0">{renderDue(t)}</div>

                    {/* Link */}
                    <CrumbLink href={`/trips/${t.id}`} fromLabel="Долги" fromKey="debts" className="p-1.5 hover:bg-muted rounded-md transition shrink-0" title="Просмотр">
                      <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    </CrumbLink>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {groupedClient.length > 0 && (
          <div className="flex justify-end px-4 py-2 text-sm font-semibold">
            <span className="text-muted-foreground mr-2">Итого клиенты:</span>
            <span className="font-mono text-red-600">{fmt(totalClient)} ֏</span>
          </div>
        )}
      </div>

      {/* Carrier debts — grouped by carrier */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-red-600" />
          Долги перевозчикам
          <span className="text-xs text-muted-foreground font-normal">(мы должны)</span>
        </h2>

        {groupedCarrier.length === 0 ? (
          <div className="bg-card rounded-xl p-8 text-center text-muted-foreground text-sm">Нет долгов перевозчикам</div>
        ) : (
          groupedCarrier.map(group => (
            <div key={group.carrier.id} className="bg-card rounded-xl shadow-sm overflow-hidden">
              {/* Carrier header */}
              <div className="px-5 py-3 bg-muted/30 flex items-center justify-between gap-3 border-b">
                <span className="text-sm font-semibold truncate">{group.carrier.name}</span>
                <div className="shrink-0 text-right">
                  <span className="text-sm font-bold font-mono text-red-600">{fmt(group.totalDebt)} ֏</span>
                  <span className="text-[10px] text-muted-foreground ml-1.5">{group.trips.length} заяв.</span>
                </div>
              </div>

              {/* Trips */}
              <div className="divide-y divide-muted">
                {sortTrips(group.trips).map(t => (
                  <div key={t.id} className={`px-4 py-3 flex items-center gap-2 flex-wrap transition-colors ${tripRowBg(t)}`}>
                    {/* Trip number + date */}
                    <div className="min-w-[80px]">
                      <CrumbLink href={`/trips/${t.id}`} fromLabel="Долги" fromKey="debts" className="font-mono text-xs text-primary hover:underline font-semibold">{t.tripNumber}</CrumbLink>
                      <div className="text-[10px] text-muted-foreground">{formatDate(t.tripDate)}</div>
                    </div>

                    {/* Route */}
                    {(t.routeFrom || t.routeTo) && (
                      <div className="flex-1 min-w-[100px] text-xs text-muted-foreground truncate">
                        {t.routeFrom}{t.routeFrom && t.routeTo ? ' → ' : ''}{t.routeTo}
                      </div>
                    )}

                    {/* Cash gap badge */}
                    {t.cashGap > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-700 bg-orange-100 dark:bg-orange-950/50 dark:text-orange-300 px-1.5 py-0.5 rounded whitespace-nowrap">
                        ⚠ разрыв {fmt(t.cashGap)} ֏
                      </span>
                    )}

                    {/* Financials */}
                    <div className="flex items-center gap-3 text-xs ml-auto shrink-0">
                      <span className="text-muted-foreground font-mono">{fmt(t.rateAmd)} ֏</span>
                      <span className="text-green-600 font-mono">{fmt(t.paidAmd)} ֏</span>
                      <span className={`font-mono ${remainingClass(t)}`}>{fmt(t.remaining)} ֏</span>
                    </div>

                    {/* Due date */}
                    <div className="shrink-0">{renderDue(t)}</div>

                    {/* Link */}
                    <CrumbLink href={`/trips/${t.id}`} fromLabel="Долги" fromKey="debts" className="p-1.5 hover:bg-muted rounded-md transition shrink-0" title="Просмотр">
                      <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    </CrumbLink>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {groupedCarrier.length > 0 && (
          <div className="flex justify-end px-4 py-2 text-sm font-semibold">
            <span className="text-muted-foreground mr-2">Итого перевозчики:</span>
            <span className="font-mono text-red-600">{fmt(totalCarrier)} ֏</span>
          </div>
        )}
      </div>
    </div>
  );
}
