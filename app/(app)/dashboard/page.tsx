'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import CrumbLink from '@/components/nav/crumb-link';
import {
  ArrowDownRight, ArrowUpRight, AlertTriangle, Users, Building2, TrendingUp,
  ChevronDown, ChevronUp, Download, Clock, ShieldAlert, Trophy, Truck, Fuel, Banknote,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

/* ── Types ── */
interface KPI { totalClientDebt: number; totalCarrierDebt: number; totalProfit: number; totalCashGap: number; }
interface DebtRow { id: string; tripNumber: string; clientName?: string; carrierName?: string; clientId?: string; rate: number; paid: number; remaining: number; }
interface ProfitRow { id: string; tripNumber: string; clientName: string; income: number; expense: number; profit: number; }
interface ProblemRow { id: string; tripNumber: string; clientName: string; carrierName: string; clientPaid: number; carrierPaid: number; diff: number; }
interface TopDebtor { clientId: string; clientName: string; totalDebt: number; tripCount: number; }
interface Reminder { id: string; tripNumber: string; clientName?: string; carrierName?: string; amount?: number; paymentDueDate?: string; daysLeft?: number; }
interface ExpiringDoc { id: string; docName: string; entityName: string; expiryDate: string; daysLeft: number; }

interface DashData {
  kpi: KPI;
  totals: { totalIncome: number; totalExpense: number };
  topDebtors: TopDebtor[];
  clientDebts: DebtRow[];
  carrierDebts: DebtRow[];
  profitRows: ProfitRow[];
  problemRows: ProblemRow[];
  reminders: { overduePayments: Reminder[]; paymentDueTrips: Reminder[]; carrierOverduePayments?: Reminder[]; carrierPaymentDueTrips?: Reminder[]; };
  expiringDocs: ExpiringDoc[];
  ownFleet?: {
    revenue: number; expenses: number; profit: number;
    breakdown: { salary: number; perDiem: number; fuel: number; other: number };
    tripCount: number; vtCount: number;
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    problems: true, clientDebts: true, carrierDebts: true, profit: false,
  });
  const toggle = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      console.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDownloadXLSX = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/dashboard/xlsx');
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dashboard_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { console.error('XLSX download failed'); }
    finally { setDownloading(false); }
  };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      const res = await fetch('/api/dashboard/pdf');
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dashboard_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { console.error('PDF download failed'); }
    finally { setPdfLoading(false); }
  };

  if (loading && !data) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
      </div>
    );
  }

  const kpi = data?.kpi;

  const kpiCards = [
    {
      label: 'Доход',
      value: data?.totals?.totalIncome ?? 0,
      icon: TrendingUp,
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      border: 'border-emerald-200 dark:border-emerald-800',
      iconColor: 'text-emerald-600',
      valueColor: 'text-emerald-700 dark:text-emerald-300',
    },
    {
      label: 'Расход',
      value: data?.totals?.totalExpense ?? 0,
      icon: ArrowUpRight,
      bg: 'bg-red-50 dark:bg-red-950/40',
      border: 'border-red-200 dark:border-red-800',
      iconColor: 'text-red-600',
      valueColor: 'text-red-700 dark:text-red-300',
    },
    {
      label: 'Прибыль',
      value: kpi?.totalProfit ?? 0,
      icon: TrendingUp,
      bg: 'bg-green-50 dark:bg-green-950/40',
      border: 'border-green-200 dark:border-green-800',
      iconColor: 'text-green-600',
      valueColor: (kpi?.totalProfit ?? 0) >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-600',
    },
    {
      label: 'Нам должны (клиенты)',
      value: kpi?.totalClientDebt ?? 0,
      icon: Users,
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      border: 'border-blue-200 dark:border-blue-800',
      iconColor: 'text-blue-600',
      valueColor: 'text-blue-700 dark:text-blue-300',
    },
    {
      label: 'Мы должны (перевозчикам)',
      value: kpi?.totalCarrierDebt ?? 0,
      icon: Building2,
      bg: 'bg-orange-50 dark:bg-orange-950/40',
      border: 'border-orange-200 dark:border-orange-800',
      iconColor: 'text-orange-600',
      valueColor: 'text-orange-700 dark:text-orange-300',
    },
    {
      label: 'Кассовый разрыв',
      value: kpi?.totalCashGap ?? 0,
      icon: AlertTriangle,
      bg: 'bg-red-50 dark:bg-red-950/40',
      border: 'border-red-200 dark:border-red-800',
      iconColor: 'text-red-600',
      valueColor: 'text-red-700 dark:text-red-300',
    },
  ];

  const hasReminders =
    (data?.reminders?.overduePayments?.length ?? 0) > 0
    || (data?.reminders?.paymentDueTrips?.length ?? 0) > 0
    || (data?.reminders?.carrierOverduePayments?.length ?? 0) > 0
    || (data?.reminders?.carrierPaymentDueTrips?.length ?? 0) > 0;
  const hasExpiringDocs = (data?.expiringDocs?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Дашборд</h1>
          <p className="text-sm text-muted-foreground">Общая финансовая картина бизнеса</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={handleDownloadXLSX} disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 transition disabled:opacity-50 dark:bg-green-950/40 dark:border-green-800 dark:text-green-300">
            <Download className="w-3.5 h-3.5" />
            {downloading ? 'Скачивание...' : 'Excel'}
          </button>
          <button type="button" onClick={handleDownloadPDF} disabled={pdfLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition disabled:opacity-50 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300">
            <Download className="w-3.5 h-3.5" />
            {pdfLoading ? 'Генерация...' : 'PDF'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiCards.map((card, i) => (
          <div key={i} className={`rounded-xl p-5 border ${card.bg} ${card.border}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
              <card.icon className={`w-5 h-5 ${card.iconColor}`} />
            </div>
            <p className={`text-xl font-bold font-mono ${card.valueColor}`}>
              {formatCurrency(card.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Own Fleet Summary */}
      {data?.ownFleet && (data.ownFleet.revenue > 0 || data.ownFleet.expenses > 0) && (() => {
        const f = data.ownFleet!;
        return (
          <div className="bg-card rounded-xl p-5 shadow-sm border border-border space-y-4">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold text-foreground">{'Собственный автопарк'}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs text-emerald-600 mb-1">{'Доход'}</p>
                <p className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400">{formatCurrency(f.revenue)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{f.tripCount} {'заявок'}</p>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-4 border border-red-200 dark:border-red-800">
                <p className="text-xs text-red-600 mb-1">{'Расход'}</p>
                <p className="text-xl font-bold font-mono text-red-600">{formatCurrency(f.expenses)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{f.vtCount} {'рейсов машин'}</p>
              </div>
              <div className={`rounded-lg p-4 border ${f.profit >= 0 ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'}`}>
                <p className={`text-xs mb-1 ${f.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{'Чистая прибыль'}</p>
                <p className={`text-xl font-bold font-mono ${f.profit >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600'}`}>{formatCurrency(f.profit)}</p>
              </div>
            </div>
            {f.expenses > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2 font-medium">{'Детализация расходов:'}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-amber-600">{'Топливо'}</p>
                    <p className="text-sm font-bold font-mono">{formatCurrency(f.breakdown.fuel)}</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-blue-600">{'Зарплата'}</p>
                    <p className="text-sm font-bold font-mono">{formatCurrency(f.breakdown.salary)}</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-950/20 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-purple-600">{'Суточные'}</p>
                    <p className="text-sm font-bold font-mono">{formatCurrency(f.breakdown.perDiem)}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/20 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-slate-600">{'Прочие'}</p>
                    <p className="text-sm font-bold font-mono">{formatCurrency(f.breakdown.other)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Alerts row: Reminders + Expiring Docs + Top Debtors */}
      {(hasReminders || hasExpiringDocs || (data?.topDebtors?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Reminders */}
          {hasReminders && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">Напоминания по оплатам</span>
              </div>

              {(data?.reminders?.overduePayments?.length ?? 0) > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Просрочено клиентами ({data!.reminders.overduePayments.length})
                  </p>
                  <div className="space-y-1">
                    {data!.reminders.overduePayments.slice(0, 5).map(t => (
                      <CrumbLink key={t.id} href={`/trips/${t.id}`} fromLabel="Дашборд" fromKey="dashboard"
                        className="flex items-center justify-between text-xs hover:bg-red-100/60 dark:hover:bg-red-950/40 rounded px-2 py-1 transition">
                        <span>
                          <span className="font-mono text-red-700 dark:text-red-300">{t.tripNumber}</span>
                          <span className="text-red-600 dark:text-red-400 ml-1">{t.clientName}</span>
                        </span>
                        <span className="font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                          <span className="font-mono">{formatCurrency(t.amount ?? 0)}</span>
                          <span className="text-[10px]">−{Math.abs(t.daysLeft ?? 0)} дн.</span>
                        </span>
                      </CrumbLink>
                    ))}
                  </div>
                </div>
              )}

              {(data?.reminders?.paymentDueTrips?.length ?? 0) > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">
                    Срок оплаты от клиентов ({data!.reminders.paymentDueTrips.length})
                  </p>
                  <div className="space-y-1">
                    {data!.reminders.paymentDueTrips.slice(0, 5).map(t => {
                      const urgent = (t.daysLeft ?? 99) <= 3;
                      return (
                        <CrumbLink key={t.id} href={`/trips/${t.id}`} fromLabel="Дашборд" fromKey="dashboard"
                          className="flex items-center justify-between text-xs hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded px-2 py-1 transition">
                          <span>
                            <span className="font-mono text-amber-700 dark:text-amber-300">{t.tripNumber}</span>
                            <span className="text-amber-600 dark:text-amber-400 ml-1">{t.clientName}</span>
                          </span>
                          <span className={`font-semibold ${urgent ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500'}`}>
                            {(t.daysLeft ?? 0) === 0 ? 'сегодня!' : `через ${t.daysLeft} дн.`}
                          </span>
                        </CrumbLink>
                      );
                    })}
                  </div>
                </div>
              )}

              {(data?.reminders?.carrierOverduePayments?.length ?? 0) > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Просрочено перевозчикам ({data!.reminders.carrierOverduePayments!.length})
                  </p>
                  <div className="space-y-1">
                    {data!.reminders.carrierOverduePayments!.slice(0, 5).map(t => (
                      <CrumbLink key={t.id} href={`/trips/${t.id}`} fromLabel="Дашборд" fromKey="dashboard"
                        className="flex items-center justify-between text-xs hover:bg-red-100/60 dark:hover:bg-red-950/40 rounded px-2 py-1 transition">
                        <span>
                          <span className="font-mono text-red-700 dark:text-red-300">{t.tripNumber}</span>
                          <span className="text-red-600 dark:text-red-400 ml-1">{t.carrierName}</span>
                        </span>
                        <span className="font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                          <span className="font-mono">{formatCurrency(t.amount ?? 0)}</span>
                          <span className="text-[10px]">−{Math.abs(t.daysLeft ?? 0)} дн.</span>
                        </span>
                      </CrumbLink>
                    ))}
                  </div>
                </div>
              )}

              {(data?.reminders?.carrierPaymentDueTrips?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">
                    Срок оплаты перевозчикам ({data!.reminders.carrierPaymentDueTrips!.length})
                  </p>
                  <div className="space-y-1">
                    {data!.reminders.carrierPaymentDueTrips!.slice(0, 5).map(t => {
                      const urgent = (t.daysLeft ?? 99) <= 3;
                      return (
                        <CrumbLink key={t.id} href={`/trips/${t.id}`} fromLabel="Дашборд" fromKey="dashboard"
                          className="flex items-center justify-between text-xs hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded px-2 py-1 transition">
                          <span>
                            <span className="font-mono text-amber-700 dark:text-amber-300">{t.tripNumber}</span>
                            <span className="text-amber-600 dark:text-amber-400 ml-1">{t.carrierName}</span>
                          </span>
                          <span className={`font-semibold ${urgent ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500'}`}>
                            {(t.daysLeft ?? 0) === 0 ? 'сегодня!' : `через ${t.daysLeft} дн.`}
                          </span>
                        </CrumbLink>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Top-5 debtors */}
          {(data?.topDebtors?.length ?? 0) > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">Топ-5 должников</span>
              </div>
              <div className="space-y-2">
                {data!.topDebtors.map((d, i) => (
                  <div key={d.clientId} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center text-[10px] font-bold text-blue-700 dark:text-blue-300">
                        {i + 1}
                      </span>
                      <span className="text-blue-800 dark:text-blue-200 font-medium">{d.clientName}</span>
                      <span className="text-blue-500 dark:text-blue-400">({d.tripCount} заявок)</span>
                    </div>
                    <span className="font-mono font-bold text-blue-700 dark:text-blue-300">{formatCurrency(d.totalDebt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expiring docs */}
          {hasExpiringDocs && (
            <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="w-4 h-4 text-violet-600" />
                <span className="text-sm font-semibold text-violet-900 dark:text-violet-200">Истекающие документы</span>
              </div>
              <div className="space-y-1.5">
                {data!.expiringDocs.slice(0, 5).map(doc => {
                  const overdue = doc.daysLeft < 0;
                  return (
                    <Link key={doc.id} href="/expiry"
                      className="flex items-center justify-between text-xs hover:bg-violet-100 dark:hover:bg-violet-900/30 rounded px-2 py-1 transition">
                      <div>
                        <span className="font-medium text-violet-800 dark:text-violet-200">{doc.docName}</span>
                        <span className="text-violet-500 dark:text-violet-400 ml-1.5">{doc.entityName}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        overdue ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400'
                      }`}>
                        {overdue ? `Просрочено ${Math.abs(doc.daysLeft)} дн.` : `Через ${doc.daysLeft} дн.`}
                      </span>
                    </Link>
                  );
                })}
                {(data!.expiringDocs.length > 5) && (
                  <Link href="/expiry" className="text-xs text-violet-600 hover:underline mt-1 block">Все документы →</Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section: Problem Trips */}
      {(data?.problemRows?.length ?? 0) > 0 && (
        <Section
          title={`Проблемные заявки (${data!.problemRows.length})`}
          subtitle="Оплачено перевозчику > оплачено клиентом"
          icon={AlertTriangle}
          iconColor="text-red-500"
          isOpen={openSections.problems}
          onToggle={() => toggle('problems')}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-2 font-medium">Заявка</th>
                  <th className="text-left py-2 font-medium">Клиент</th>
                  <th className="text-left py-2 font-medium">Перевозчик</th>
                  <th className="text-right py-2 font-medium">Опл. клиентом</th>
                  <th className="text-right py-2 font-medium">Опл. перевозчику</th>
                  <th className="text-right py-2 font-medium">Разница</th>
                </tr>
              </thead>
              <tbody>
                {data!.problemRows.map(row => (
                  <tr key={row.id} className="border-b last:border-0 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100/50 dark:hover:bg-red-900/20">
                    <td className="py-2"><CrumbLink href={`/trips/${row.id}`} fromLabel="Дашборд" fromKey="dashboard" className="font-mono text-xs text-primary hover:underline">{row.tripNumber}</CrumbLink></td>
                    <td className="py-2 text-muted-foreground">{row.clientName}</td>
                    <td className="py-2 text-muted-foreground">{row.carrierName}</td>
                    <td className="py-2 text-right font-mono text-xs">{formatCurrency(row.clientPaid)}</td>
                    <td className="py-2 text-right font-mono text-xs">{formatCurrency(row.carrierPaid)}</td>
                    <td className="py-2 text-right font-mono text-xs font-bold text-red-600">{formatCurrency(row.diff)}</td>
                  </tr>
                ))}
                <TotalRow cols={6} numCols={[3, 4, 5]} rows={data!.problemRows.map(r => [r.clientPaid, r.carrierPaid, r.diff])} />
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Section: Client Debts */}
      <Section
        title={`Долги клиентов (${data?.clientDebts?.length ?? 0})`}
        icon={ArrowDownRight}
        iconColor="text-blue-500"
        isOpen={openSections.clientDebts}
        onToggle={() => toggle('clientDebts')}
      >
        {(data?.clientDebts?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Нет задолженностей</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-2 font-medium">Заявка</th>
                  <th className="text-left py-2 font-medium">Клиент</th>
                  <th className="text-right py-2 font-medium">Ставка ֏</th>
                  <th className="text-right py-2 font-medium">Оплачено ֏</th>
                  <th className="text-right py-2 font-medium">Остаток ֏</th>
                </tr>
              </thead>
              <tbody>
                {data!.clientDebts.map(row => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2"><CrumbLink href={`/trips/${row.id}`} fromLabel="Дашборд" fromKey="dashboard" className="font-mono text-xs text-primary hover:underline">{row.tripNumber}</CrumbLink></td>
                    <td className="py-2 text-muted-foreground">{row.clientName}</td>
                    <td className="py-2 text-right font-mono text-xs">{formatCurrency(row.rate)}</td>
                    <td className="py-2 text-right font-mono text-xs">{formatCurrency(row.paid)}</td>
                    <td className="py-2 text-right font-mono text-xs font-bold text-blue-600">{formatCurrency(row.remaining)}</td>
                  </tr>
                ))}
                <TotalRow cols={5} numCols={[2, 3, 4]} rows={data!.clientDebts.map(r => [r.rate, r.paid, r.remaining])} />
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Section: Carrier Debts */}
      <Section
        title={`Долги перевозчикам (${data?.carrierDebts?.length ?? 0})`}
        icon={ArrowUpRight}
        iconColor="text-orange-500"
        isOpen={openSections.carrierDebts}
        onToggle={() => toggle('carrierDebts')}
      >
        {(data?.carrierDebts?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Нет задолженностей</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-2 font-medium">Заявка</th>
                  <th className="text-left py-2 font-medium">Перевозчик</th>
                  <th className="text-right py-2 font-medium">Сумма ֏</th>
                  <th className="text-right py-2 font-medium">Оплачено ֏</th>
                  <th className="text-right py-2 font-medium">Остаток ֏</th>
                </tr>
              </thead>
              <tbody>
                {data!.carrierDebts.map(row => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2"><CrumbLink href={`/trips/${row.id}`} fromLabel="Дашборд" fromKey="dashboard" className="font-mono text-xs text-primary hover:underline">{row.tripNumber}</CrumbLink></td>
                    <td className="py-2 text-muted-foreground">{row.carrierName}</td>
                    <td className="py-2 text-right font-mono text-xs">{formatCurrency(row.rate)}</td>
                    <td className="py-2 text-right font-mono text-xs">{formatCurrency(row.paid)}</td>
                    <td className="py-2 text-right font-mono text-xs font-bold text-orange-600">{formatCurrency(row.remaining)}</td>
                  </tr>
                ))}
                <TotalRow cols={5} numCols={[2, 3, 4]} rows={data!.carrierDebts.map(r => [r.rate, r.paid, r.remaining])} />
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Section: Profit */}
      <Section
        title={`Прибыль по заявкам (${data?.profitRows?.length ?? 0})`}
        icon={TrendingUp}
        iconColor="text-green-500"
        isOpen={openSections.profit}
        onToggle={() => toggle('profit')}
      >
        {(data?.profitRows?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Нет данных</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-2 font-medium">Заявка</th>
                  <th className="text-left py-2 font-medium">Клиент</th>
                  <th className="text-right py-2 font-medium">Доход ֏</th>
                  <th className="text-right py-2 font-medium">Расход ֏</th>
                  <th className="text-right py-2 font-medium">Прибыль ֏</th>
                </tr>
              </thead>
              <tbody>
                {data!.profitRows.map(row => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2"><CrumbLink href={`/trips/${row.id}`} fromLabel="Дашборд" fromKey="dashboard" className="font-mono text-xs text-primary hover:underline">{row.tripNumber}</CrumbLink></td>
                    <td className="py-2 text-muted-foreground">{row.clientName}</td>
                    <td className="py-2 text-right font-mono text-xs">{formatCurrency(row.income)}</td>
                    <td className="py-2 text-right font-mono text-xs">{formatCurrency(row.expense)}</td>
                    <td className={`py-2 text-right font-mono text-xs font-bold ${row.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(row.profit)}</td>
                  </tr>
                ))}
                <TotalRow cols={5} numCols={[2, 3, 4]} rows={data!.profitRows.map(r => [r.income, r.expense, r.profit])} />
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ── Collapsible section wrapper ── */
function Section({
  title, subtitle, icon: Icon, iconColor, isOpen, onToggle, children,
}: {
  title: string; subtitle?: string; icon: any; iconColor: string;
  isOpen: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl shadow-sm overflow-hidden">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${iconColor}`} />
          <div>
            <span className="text-sm font-semibold">{title}</span>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {isOpen && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

/* ── ИТОГО row ── */
function TotalRow({ cols, numCols, rows }: { cols: number; numCols: number[]; rows: number[][] }) {
  const totals: number[] = [];
  for (let i = 0; i < (numCols.length); i++) totals.push(0);
  for (const row of rows) {
    row.forEach((v, i) => { totals[i] += v; });
  }

  return (
    <tr className="border-t-2 border-border bg-muted/30">
      {Array.from({ length: cols }).map((_, i) => {
        const numIdx = numCols.indexOf(i);
        if (i === 0) return <td key={i} className="py-2 text-xs font-bold">ИТОГО</td>;
        if (numIdx >= 0) return (
          <td key={i} className="py-2 text-right font-mono text-xs font-bold">
            {formatCurrency(totals[numIdx])}
          </td>
        );
        return <td key={i} className="py-2" />;
      })}
    </tr>
  );
}
