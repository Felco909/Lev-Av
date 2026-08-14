'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import CrumbLink from '@/components/nav/crumb-link';
import { useNavState } from '@/hooks/use-nav-state';
import {
  Wallet, Eye, AlertTriangle, Clock, ChevronRight,
  CheckCircle2, Loader2, Truck,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { CurrencyAmount } from '@/components/ui/currency-amount';

type Tab = 'overview' | 'clients' | 'carriers' | 'suppliers' | 'cashgaps';

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
  // Единый слой отображения валют — см. lib/finance/debts-service.ts.
  rate?: number;
  currency?: string;
  exchangeRate?: number;
  carrierRate?: number;
  carrierCurrency?: string;
  carrierExchangeRate?: number;
  carrierPaidAmd?: number;
}

interface GroupedClient { client: { id: string; name: string; phone: string | null; email: string | null }; trips: TripDebtRow[]; totalDebt: number; }
interface GroupedCarrier { carrier: { id: string; name: string }; trips: TripDebtRow[]; totalDebt: number; }

const LARGE_DEBT_THRESHOLD_AMD = 3_000_000;

export default function DebtsPage() {
  const [tab, setTab] = useState<Tab>('overview');

  const [debtsData, setDebtsData] = useState<any>(null);
  const [debtsLoading, setDebtsLoading] = useState(true);
  const [debtsError, setDebtsError] = useState(false);

  const [supplierData, setSupplierData] = useState<any>(null);
  const [supplierLoading, setSupplierLoading] = useState(false);

  const [auditData, setAuditData] = useState<any>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);

  const loadDebts = () => {
    setDebtsLoading(true);
    setDebtsError(false);
    fetch('/api/debts')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => setDebtsData(data))
      .catch(() => setDebtsError(true))
      .finally(() => setDebtsLoading(false));
  };

  const loadSuppliers = () => {
    setSupplierLoading(true);
    fetch('/api/reports/supplier-debts')
      .then(r => r.json())
      .then(data => setSupplierData(data))
      .catch(() => {})
      .finally(() => setSupplierLoading(false));
  };

  // Finance Audit — не скрывать конфликты (см. проектирование "Долги", 28.07.2026).
  // Тот же /api/finance/audit, что уже используется на "Листе дня".
  const loadAudit = () => {
    setAuditLoading(true);
    fetch('/api/finance/audit')
      .then(r => r.json())
      .then(data => setAuditData(data))
      .catch(() => {})
      .finally(() => setAuditLoading(false));
  };

  useEffect(() => { loadDebts(); loadSuppliers(); loadAudit(); }, []);

  const scrollRef = useRef(0);
  useNavState('debts',
    () => ({ tab, scrollY: typeof window !== 'undefined' ? window.scrollY : 0 }),
    (s) => { if (s.tab) setTab(s.tab); scrollRef.current = s.scrollY || 0; }
  );

  useEffect(() => {
    if (!debtsLoading && scrollRef.current > 0) {
      const y = scrollRef.current;
      scrollRef.current = 0;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [debtsLoading]);

  const fmt = (v: number) => Math.round(v).toLocaleString('ru-RU', { maximumFractionDigits: 0 });

  const groupedClient: GroupedClient[] = debtsData?.grouped ?? [];
  const groupedCarrier: GroupedCarrier[] = debtsData?.groupedCarrier ?? [];
  const clientDebts: TripDebtRow[] = debtsData?.clientDebts ?? [];
  const carrierDebts: TripDebtRow[] = debtsData?.carrierDebts ?? [];
  const totalClient = debtsData?.totalClientDebt ?? 0;
  const totalCarrier = debtsData?.totalCarrierDebt ?? 0;
  const reminders = debtsData?.reminders ?? null;

  const totalSupplierDebt = supplierData?.totals?.grandDebt ?? 0;
  const supplierRows = supplierData?.rows ?? [];
  const supplierGrouped = supplierData?.suppliers ?? [];

  const totalCashGap = useMemo(() => clientDebts.reduce((s, t) => s + (t.cashGap || 0), 0), [clientDebts]);
  const cashGapRows = useMemo(() => clientDebts.filter(t => (t.cashGap || 0) > 0).sort((a, b) => b.cashGap - a.cashGap), [clientDebts]);

  const overdueClient = useMemo(() => clientDebts.filter(t => t.isOverdue), [clientDebts]);
  const overdueCarrier = useMemo(() => carrierDebts.filter(t => t.isOverdue), [carrierDebts]);
  const largeClientDebtors = useMemo(() => groupedClient.filter(g => g.totalDebt > LARGE_DEBT_THRESHOLD_AMD), [groupedClient]);

  const conflictCount = auditData?.summary?.tripConflictCount ?? 0;
  const hasConflicts = auditData?.summary?.hasConflicts ?? false;

  const goTo = (t: Tab) => setTab(t);

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

  function TripRow({ t }: { t: TripDebtRow }) {
    return (
      <div className={`px-4 py-3 flex items-center gap-2 flex-wrap transition-colors ${tripRowBg(t)}`}>
        <div className="min-w-[80px]">
          <CrumbLink href={`/trips/${t.id}`} fromLabel="Долги" fromKey="debts" className="font-mono text-xs text-primary hover:underline font-semibold">{t.tripNumber}</CrumbLink>
          <div className="text-[10px] text-muted-foreground">{formatDate(t.tripDate)}</div>
        </div>
        {(t.routeFrom || t.routeTo) && (
          <div className="flex-1 min-w-[100px] text-xs text-muted-foreground truncate">
            {t.routeFrom}{t.routeFrom && t.routeTo ? ' → ' : ''}{t.routeTo}
          </div>
        )}
        {t.cashGap > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-700 bg-orange-100 dark:bg-orange-950/50 dark:text-orange-300 px-1.5 py-0.5 rounded whitespace-nowrap">
            ⚠ разрыв {fmt(t.cashGap)} ֏
          </span>
        )}
        <div className="flex items-center gap-3 text-xs ml-auto shrink-0">
          {t.currency && t.currency !== 'AMD' ? (
            <CurrencyAmount amount={t.rate} currency={t.currency} rate={t.exchangeRate} amountAmd={t.rateAmd} variant="compact" className="items-end text-muted-foreground" />
          ) : (
            <span className="text-muted-foreground font-mono">{fmt(t.rateAmd)} ֏</span>
          )}
          <span className="text-green-600 font-mono">{fmt(t.paidAmd)} ֏</span>
          <span className={`font-mono ${remainingClass(t)}`}>{fmt(t.remaining)} ֏</span>
        </div>
        <div className="shrink-0">{renderDue(t)}</div>
        <CrumbLink href={`/trips/${t.id}`} fromLabel="Долги" fromKey="debts" className="p-1.5 hover:bg-muted rounded-md transition shrink-0" title="Просмотр">
          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
        </CrumbLink>
      </div>
    );
  }

  function ClickRow({ onClick, children }: any) {
    return (
      <button type="button" onClick={onClick}
        className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 outline-none group">
        <div className="flex-1 min-w-0">{children}</div>
        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-60 transition shrink-0" />
      </button>
    );
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Обзор' },
    { key: 'clients', label: 'Клиенты' },
    { key: 'carriers', label: 'Перевозчики' },
    { key: 'suppliers', label: 'Поставщики' },
    { key: 'cashgaps', label: 'Кассовые разрывы' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" /> Долги
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Единый финансовый центр — кто должен нам, кому должны мы</p>
        </div>
        <Link href="/payment-history" className="text-sm text-primary hover:underline">История оплат →</Link>
      </div>

      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition whitespace-nowrap flex-1 text-center ${
              tab === t.key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {debtsLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : debtsError ? (
        <div className="text-center py-16 text-red-500 text-sm">Не удалось загрузить долги. <button onClick={loadDebts} className="underline">Повторить</button></div>
      ) : (
        <>
          {/* ══════════════════ ОБЗОР ══════════════════ */}
          {tab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <button onClick={() => goTo('clients')} className="text-left bg-card rounded-xl p-4 shadow-sm border-l-4 border-green-500 hover:shadow-md hover:-translate-y-0.5 transition">
                  <p className="text-xs text-muted-foreground mb-1">Нам должны</p>
                  <p className="text-lg font-bold font-mono text-green-700 dark:text-green-400">{fmt(totalClient)} ֏</p>
                  <p className="text-[10px] text-muted-foreground">{clientDebts.length} заявок · {groupedClient.length} клиентов</p>
                </button>
                <button onClick={() => goTo('carriers')} className="text-left bg-card rounded-xl p-4 shadow-sm border-l-4 border-red-500 hover:shadow-md hover:-translate-y-0.5 transition">
                  <p className="text-xs text-muted-foreground mb-1">Компания должна</p>
                  <p className="text-lg font-bold font-mono text-red-700 dark:text-red-400">{fmt(totalCarrier + totalSupplierDebt)} ֏</p>
                  <p className="text-[10px] text-muted-foreground">перевозчикам {fmt(totalCarrier)} ֏ + поставщикам {fmt(totalSupplierDebt)} ֏</p>
                </button>
                <button onClick={() => goTo('clients')} className="text-left bg-card rounded-xl p-4 shadow-sm border-l-4 border-red-500 hover:shadow-md hover:-translate-y-0.5 transition">
                  <p className="text-xs text-muted-foreground mb-1">Просрочено</p>
                  <p className="text-lg font-bold font-mono text-red-600">{fmt(overdueClient.reduce((s, t) => s + t.remaining, 0) + overdueCarrier.reduce((s, t) => s + t.remaining, 0))} ֏</p>
                  <p className="text-[10px] text-muted-foreground">{overdueClient.length + overdueCarrier.length} заявок</p>
                </button>
                <button onClick={() => goTo('cashgaps')} className="text-left bg-card rounded-xl p-4 shadow-sm border-l-4 border-orange-500 hover:shadow-md hover:-translate-y-0.5 transition">
                  <p className="text-xs text-muted-foreground mb-1">Кассовый разрыв</p>
                  <p className="text-lg font-bold font-mono text-orange-600">{fmt(totalCashGap)} ֏</p>
                  <p className="text-[10px] text-muted-foreground">{cashGapRows.length} заявок</p>
                </button>
              </div>

              {reminders && (reminders.clientDueSoon.length > 0 || reminders.carrierDueSoon.length > 0) && (
                <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
                  <h3 className="text-sm font-semibold mb-2">Ожидаются платежи (ближайшие дни)</h3>
                  <div className="flex flex-wrap gap-6 text-sm">
                    <div>От клиентов: <b>{reminders.clientDueSoon.length}</b> заявок · <span className="font-mono">{fmt(reminders.clientDueSoon.reduce((s: number, r: any) => s + r.amount, 0))} ֏</span></div>
                    <div>Перевозчикам: <b>{reminders.carrierDueSoon.length}</b> заявок · <span className="font-mono">{fmt(reminders.carrierDueSoon.reduce((s: number, r: any) => s + r.amount, 0))} ֏</span></div>
                  </div>
                </div>
              )}

              {/* Finance Audit — не скрывать конфликты */}
              {!auditLoading && hasConflicts && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4">
                  <button onClick={() => setShowConflicts(v => !v)} className="w-full flex items-center gap-3 text-left">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                    <span className="text-sm font-semibold text-red-800 dark:text-red-300 flex-1">
                      Обнаружено {conflictCount} {conflictCount === 1 ? 'конфликт расчётов' : 'конфликта расчётов'} — сумма долга по журналу платежей расходится с сохранённым значением на заявке
                    </span>
                    <span className="text-xs text-red-600 underline shrink-0">{showConflicts ? 'Скрыть' : 'Посмотреть →'}</span>
                  </button>
                  {showConflicts && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-left text-red-700/70 dark:text-red-400/70">
                          <th className="py-1.5 pr-3">Заявка</th><th className="py-1.5 pr-3">Поле</th>
                          <th className="py-1.5 pr-3 text-right">Сохранено</th><th className="py-1.5 pr-3 text-right">По журналу</th>
                        </tr></thead>
                        <tbody>
                          {(auditData?.tripConflicts ?? []).slice(0, 20).map((c: any) => (
                            <tr key={c.tripId} className="border-t border-red-200/50 dark:border-red-800/50">
                              <td className="py-1.5 pr-3"><CrumbLink href={`/trips/${c.tripId}`} fromLabel="Долги" fromKey="debts" className="text-primary hover:underline">{c.tripNumber}</CrumbLink></td>
                              <td className="py-1.5 pr-3">{c.conflictFields.join(', ')}</td>
                              <td className="py-1.5 pr-3 text-right font-mono">{fmt(c.old.clientPaidAmd)} ֏</td>
                              <td className="py-1.5 pr-3 text-right font-mono">{fmt(c.canonical.clientPaidAmd)} ֏</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Требует внимания */}
              <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
                <h3 className="text-sm font-semibold mb-2">Требует внимания</h3>
                {(() => {
                  const items = [
                    { key: 'overdueClient', count: overdueClient.length, label: 'Просроченные оплаты клиентов', amount: overdueClient.reduce((s, t) => s + t.remaining, 0), onClick: () => goTo('clients') },
                    { key: 'overdueCarrier', count: overdueCarrier.length, label: 'Просроченные выплаты перевозчикам', amount: overdueCarrier.reduce((s, t) => s + t.remaining, 0), onClick: () => goTo('carriers') },
                    { key: 'large', count: largeClientDebtors.length, label: `Крупные долги (> ${fmt(LARGE_DEBT_THRESHOLD_AMD)} ֏)`, amount: null, onClick: () => goTo('clients') },
                    { key: 'gap', count: cashGapRows.length, label: 'Кассовые разрывы', amount: totalCashGap, onClick: () => goTo('cashgaps') },
                    { key: 'supplier', count: supplierRows.filter((r: any) => r.paymentStatus !== 'paid').length, label: 'Долги поставщикам запчастей', amount: totalSupplierDebt, onClick: () => goTo('suppliers') },
                    { key: 'conflicts', count: conflictCount, label: 'Конфликты расчётов (Finance Audit)', amount: null, onClick: () => setShowConflicts(true) },
                  ];
                  const active = items.filter(i => i.count > 0);
                  if (active.length === 0) {
                    return <div className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="w-4 h-4" /> Всё в порядке — открытых рисков нет</div>;
                  }
                  return (
                    <div className="space-y-1">
                      {active.map(i => (
                        <ClickRow key={i.key} onClick={i.onClick}>
                          <div className="flex items-center gap-2 text-sm">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            <span>{i.label}</span>
                            <span className="text-muted-foreground text-xs">· {i.count} {i.count === 1 ? 'заявка' : 'заявок'}</span>
                            {i.amount != null && <span className="ml-auto font-mono text-xs font-semibold text-red-600">{fmt(i.amount)} ֏</span>}
                          </div>
                        </ClickRow>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
                  <h3 className="text-sm font-semibold mb-2">Топ-5 должников (клиенты)</h3>
                  {groupedClient.length === 0 ? <div className="text-sm text-muted-foreground">Должников нет</div> : (
                    <div className="space-y-0.5">
                      {groupedClient.slice(0, 5).map((g, i) => (
                        <ClickRow key={g.client.id} onClick={() => goTo('clients')}>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground text-xs w-4">{i + 1}.</span>
                            <span className="truncate flex-1">{g.client.name}</span>
                            <span className="font-mono text-xs font-semibold text-orange-600">{fmt(g.totalDebt)} ֏</span>
                          </div>
                        </ClickRow>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
                  <h3 className="text-sm font-semibold mb-2">Топ (перевозчики + поставщики)</h3>
                  <div className="space-y-0.5">
                    {[...groupedCarrier.map(g => ({ id: g.carrier.id, name: g.carrier.name, debt: g.totalDebt, onClick: () => goTo('carriers') })),
                      ...supplierGrouped.map((s: any) => ({ id: s.supplier.id, name: s.supplier.name, debt: s.debtAmount, onClick: () => goTo('suppliers') }))]
                      .sort((a, b) => b.debt - a.debt).slice(0, 5).map((x, i) => (
                        <ClickRow key={x.id} onClick={x.onClick}>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground text-xs w-4">{i + 1}.</span>
                            <span className="truncate flex-1">{x.name}</span>
                            <span className="font-mono text-xs font-semibold text-orange-600">{fmt(x.debt)} ֏</span>
                          </div>
                        </ClickRow>
                      ))}
                    {groupedCarrier.length === 0 && supplierGrouped.length === 0 && <div className="text-sm text-muted-foreground">Должников нет</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════ КЛИЕНТЫ ══════════════════ */}
          {tab === 'clients' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-500" /> Просрочка</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-orange-400" /> Кассовый разрыв</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-400" /> Срок через 1–3 дня</span>
              </div>
              {groupedClient.length === 0 ? (
                <div className="bg-card rounded-xl p-8 text-center text-muted-foreground text-sm">Нет долгов клиентов</div>
              ) : groupedClient.map(group => (
                <div key={group.client.id} className="bg-card rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 bg-muted/30 flex items-center justify-between gap-3 border-b">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold truncate">{group.client.name}</span>
                      {group.client.phone && <a href={`tel:${group.client.phone}`} className="text-xs text-muted-foreground hover:text-primary hidden sm:block">{group.client.phone}</a>}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-sm font-bold font-mono text-red-600">{fmt(group.totalDebt)} ֏</span>
                      <span className="text-[10px] text-muted-foreground ml-1.5">{group.trips.length} заяв.</span>
                    </div>
                  </div>
                  <div className="divide-y divide-muted">
                    {sortTrips(group.trips).map(t => <TripRow key={t.id} t={t} />)}
                  </div>
                </div>
              ))}
              {groupedClient.length > 0 && (
                <div className="flex justify-end px-4 py-2 text-sm font-semibold">
                  <span className="text-muted-foreground mr-2">Итого клиенты:</span>
                  <span className="font-mono text-red-600">{fmt(totalClient)} ֏</span>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════ ПЕРЕВОЗЧИКИ ══════════════════ */}
          {tab === 'carriers' && (
            <div className="space-y-3">
              {groupedCarrier.length === 0 ? (
                <div className="bg-card rounded-xl p-8 text-center text-muted-foreground text-sm">Нет долгов перевозчикам</div>
              ) : groupedCarrier.map(group => (
                <div key={group.carrier.id} className="bg-card rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 bg-muted/30 flex items-center justify-between gap-3 border-b">
                    <span className="text-sm font-semibold truncate">{group.carrier.name}</span>
                    <div className="shrink-0 text-right">
                      <span className="text-sm font-bold font-mono text-red-600">{fmt(group.totalDebt)} ֏</span>
                      <span className="text-[10px] text-muted-foreground ml-1.5">{group.trips.length} заяв.</span>
                    </div>
                  </div>
                  <div className="divide-y divide-muted">
                    {sortTrips(group.trips).map(t => <TripRow key={t.id} t={t} />)}
                  </div>
                </div>
              ))}
              {groupedCarrier.length > 0 && (
                <div className="flex justify-end px-4 py-2 text-sm font-semibold">
                  <span className="text-muted-foreground mr-2">Итого перевозчики:</span>
                  <span className="font-mono text-red-600">{fmt(totalCarrier)} ֏</span>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════ ПОСТАВЩИКИ (+ будущие обязательства) ══════════════════ */}
          {tab === 'suppliers' && (
            <div className="space-y-4">
              <div className="bg-card rounded-xl p-4 shadow-sm border-l-4 border-orange-500">
                <p className="text-xs text-muted-foreground mb-1">Долг поставщикам запчастей</p>
                <p className="text-lg font-bold font-mono text-orange-600">{supplierLoading ? '...' : `${fmt(totalSupplierDebt)} ֏`}</p>
                <p className="text-[10px] text-muted-foreground">{supplierRows.length} закупок · {supplierGrouped.length} поставщиков</p>
              </div>

              {supplierLoading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : supplierGrouped.length === 0 ? (
                <div className="bg-card rounded-xl p-8 text-center text-muted-foreground text-sm">Долгов поставщикам нет</div>
              ) : (
                <div className="bg-card rounded-xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                        <th className="py-2.5 px-4">Поставщик</th><th className="py-2.5 px-3 text-right">Закупок</th><th className="py-2.5 px-3 text-right">Долг ֏</th>
                      </tr></thead>
                      <tbody>
                        {supplierGrouped.map((s: any) => (
                          <tr key={s.supplier.id} className="border-b hover:bg-muted/30 transition">
                            <td className="py-2 px-4 text-xs">{s.supplier.name}</td>
                            <td className="py-2 px-3 text-right text-xs">{s.count}</td>
                            <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-orange-600">{fmt(s.debtAmount)} ֏</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Архитектура готова к будущим категориям обязательств (проектирование "Долги",
                  28.07.2026): пока с полем оплаты полноценно отслеживаются только запчасти —
                  остальное показано как расход за период (Ремонт/ТО/ФлитЭкспенс), а не долг,
                  без выдумывания несуществующей суммы "к оплате". */}
              <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Truck className="w-4 h-4 text-muted-foreground" /> Другие обязательства компании</h3>
                <p className="text-xs text-muted-foreground mb-3">Отслеживаются как расход за период — не как долг с датой оплаты (данные с полем «оплачено» для этих категорий пока не ведутся).</p>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                  {['Ремонт', 'Техобслуживание', 'Штрафы', 'Страхование', 'Налоги', 'Топливо'].map(cat => (
                    <div key={cat} className="bg-muted/30 rounded-lg px-3 py-2.5">
                      <p className="text-xs text-muted-foreground">{cat}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {cat === 'Топливо' ? <Link href="/reports" className="text-primary hover:underline">см. Отчёты → Автопарк</Link> : 'недоступно — данные не ведутся'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════ КАССОВЫЕ РАЗРЫВЫ ══════════════════ */}
          {tab === 'cashgaps' && (
            <div className="space-y-4">
              <div className="bg-card rounded-xl p-4 shadow-sm border-l-4 border-orange-500">
                <p className="text-xs text-muted-foreground mb-1">Кассовый разрыв — перевозчику уже оплачено, клиент ещё не оплатил</p>
                <p className="text-lg font-bold font-mono text-orange-600">{fmt(totalCashGap)} ֏</p>
                <p className="text-[10px] text-muted-foreground">{cashGapRows.length} заявок</p>
              </div>
              {cashGapRows.length === 0 ? (
                <div className="bg-card rounded-xl p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-8 h-8 opacity-40" /> Кассовых разрывов нет — всё в порядке
                </div>
              ) : (
                <div className="bg-card rounded-xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                        <th className="py-2.5 px-4">Дата</th><th className="py-2.5 px-3">Заявка</th><th className="py-2.5 px-3">Маршрут</th>
                        <th className="py-2.5 px-3 text-right">Ставка клиента</th><th className="py-2.5 px-3 text-right">Оплата перевозчику</th>
                        <th className="py-2.5 px-3 text-right">Разрыв ֏</th>
                      </tr></thead>
                      <tbody>
                        {cashGapRows.map(t => {
                          const carrierCur = t.carrierCurrency || 'AMD';
                          const carrierPaidAmd = t.carrierPaidAmd ?? 0;
                          const carrierPaidOriginal = carrierCur !== 'AMD' && t.carrierExchangeRate
                            ? carrierPaidAmd / t.carrierExchangeRate
                            : carrierPaidAmd;
                          return (
                            <tr key={t.id} className="border-b hover:bg-muted/30 transition">
                              <td className="py-2 px-4 text-xs whitespace-nowrap">{formatDate(t.tripDate)}</td>
                              <td className="py-2 px-3 text-xs"><CrumbLink href={`/trips/${t.id}`} fromLabel="Долги" fromKey="debts" className="text-primary hover:underline">{t.tripNumber}</CrumbLink></td>
                              <td className="py-2 px-3 text-xs text-muted-foreground truncate max-w-[220px]">{t.routeFrom} → {t.routeTo}</td>
                              <td className="py-2 px-3 text-right text-xs">
                                {t.currency && t.currency !== 'AMD' ? (
                                  <CurrencyAmount amount={t.rate} currency={t.currency} rate={t.exchangeRate} amountAmd={t.rateAmd} variant="compact" className="items-end ml-auto" />
                                ) : `${fmt(t.rateAmd)} ֏`}
                              </td>
                              <td className="py-2 px-3 text-right text-xs">
                                {carrierCur !== 'AMD' ? (
                                  <CurrencyAmount amount={carrierPaidOriginal} currency={carrierCur} rate={t.carrierExchangeRate} amountAmd={carrierPaidAmd} variant="compact" className="items-end ml-auto" />
                                ) : `${fmt(carrierPaidAmd)} ֏`}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-orange-600">{fmt(t.cashGap)} ֏</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
