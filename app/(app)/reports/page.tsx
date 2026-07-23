'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import CrumbLink from '@/components/nav/crumb-link';
import { useNavState } from '@/hooks/use-nav-state';
import { peekRestore } from '@/lib/nav-history';
import {
  Loader2, AlertTriangle, Download, FileSpreadsheet,
  TrendingUp, Car, DollarSign, TrendingDown, Wallet
} from 'lucide-react';
import { formatDate, FLEET_EXPENSE_TYPE_MAP } from '@/lib/utils';

type Tab = 'profit' | 'own_fleet' | 'cash_gaps';

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('profit');

  // ═══ Global filters (applied via "Применить" button) ═══
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [globalClientId, setGlobalClientId] = useState('');
  const [globalTripType, setGlobalTripType] = useState('');
  // "applied" snapshot — data loads only when user clicks Применить
  const [appliedFilters, setAppliedFilters] = useState({ dateFrom: '', dateTo: '', clientId: '', tripType: '' });
  const [filtersReady, setFiltersReady] = useState(false);

  // Client list for filter dropdown
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);

  const TRIP_TYPES = [
    { value: '', label: 'Все типы' },
    { value: 'own_transport', label: 'Собственные' },
    { value: 'expedition', label: 'Экспедиция' },
  ];

  // Profit / trips data
  const [profitData, setProfitData] = useState<any>(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState('all');

  const fmtAmd = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ֏`;

  // Init dates to current month and auto-apply (skip if restoring saved state)
  useEffect(() => {
    // If navigating back, restore handler will set dates + filtersReady
    if (peekRestore('reports')) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const from = `${y}-${m}-01`;
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    const to = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    setDateFrom(from);
    setDateTo(to);
    setAppliedFilters({ dateFrom: from, dateTo: to, clientId: '', tripType: '' });
    setFiltersReady(true);
  }, []);

  // Load clients list once
  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(data => {
      const list = Array.isArray(data) ? data : data?.clients ?? [];
      setAllClients(list.map((c: any) => ({ id: c.id, name: c.name })));
    }).catch(() => {});
  }, []);

  const applyFilters = () => {
    setAppliedFilters({ dateFrom, dateTo, clientId: globalClientId, tripType: globalTripType });
  };

  const resetFilters = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const from = `${y}-${m}-01`;
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    const to = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    setDateFrom(from);
    setDateTo(to);
    setGlobalClientId('');
    setGlobalTripType('');
    setAppliedFilters({ dateFrom: from, dateTo: to, clientId: '', tripType: '' });
  };

  // ═══ Navigation state preservation ═══
  const scrollRef = useRef(0);
  useNavState('reports',
    () => ({
      tab, dateFrom, dateTo, globalClientId, globalTripType,
      appliedFilters, paymentFilter,
      scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
    }),
    (s) => {
      if (s.tab) setTab(s.tab);
      if (s.dateFrom !== undefined) setDateFrom(s.dateFrom);
      if (s.dateTo !== undefined) setDateTo(s.dateTo);
      if (s.globalClientId !== undefined) setGlobalClientId(s.globalClientId);
      if (s.globalTripType !== undefined) setGlobalTripType(s.globalTripType);
      if (s.appliedFilters) setAppliedFilters(s.appliedFilters);
      if (s.paymentFilter !== undefined) setPaymentFilter(s.paymentFilter);
      scrollRef.current = s.scrollY || 0;
      setFiltersReady(true);
    }
  );

  // Scroll restore after data loaded
  useEffect(() => {
    if (!profitLoading && scrollRef.current > 0) {
      const y = scrollRef.current;
      scrollRef.current = 0;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [profitLoading]);

  // Load profit data — uses applied filters
  const loadProfit = useCallback(async () => {
    if (!appliedFilters.dateFrom || !appliedFilters.dateTo) return;
    setProfitLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom: appliedFilters.dateFrom, dateTo: appliedFilters.dateTo });
      if (appliedFilters.clientId) params.set('clientId', appliedFilters.clientId);
      if (appliedFilters.tripType) params.set('tripType', appliedFilters.tripType);
      const res = await fetch(`/api/reports/trips?${params}`);
      const data = await res.json();
      setProfitData(data);
    } catch {} finally { setProfitLoading(false); }
  }, [appliedFilters]);

  useEffect(() => { if (filtersReady) loadProfit(); }, [filtersReady, loadProfit]);

  // Profit rows filtered (by payment sub-filter only — client filter is global now)
  const profitRows = useMemo(() => {
    if (!profitData?.rows) return [];
    let rows = profitData.rows;
    if (paymentFilter === 'not_paid') rows = rows.filter((r: any) => (r.clientPaymentStatus || 'not_paid') === 'not_paid');
    if (paymentFilter === 'partially_paid') rows = rows.filter((r: any) => r.clientPaymentStatus === 'partially_paid');
    if (paymentFilter === 'paid') rows = rows.filter((r: any) => r.clientPaymentStatus === 'paid');
    return rows;
  }, [profitData?.rows, paymentFilter]);

  // Каноническая прибыль — уже посчитана и сохранена на самой заявке (та же формула,
  // что в trip-form.tsx / lib/finance/*). Раньше здесь пересчитывали прибыль заново по
  // плоской сумме всех расходов заявки (без разделения на клиентскую/перевозчицкую
  // сторону), из-за чего перевыставляемые клиенту расходы вычитались как издержка
  // вместо того, чтобы прибавляться к доходу — прибыль на этой странице и в Excel-
  // экспорте была занижена относительно дашборда/финансов директора.
  const calcTripProfit = (r: any) => Number(r.profitAmd ?? r.profit ?? 0);

  // Period totals — computed from ALL filtered rows (not just payment-filtered)
  const allRows = profitData?.rows || [];
  const periodRevenue = allRows.reduce((s: number, r: any) => s + Number(r.clientRateAmd || r.clientRate || 0), 0);
  const periodProfit = allRows.reduce((s: number, r: any) => s + calcTripProfit(r), 0);
  const periodExpense = periodRevenue - periodProfit;

  // Profit tab totals (use payment-filtered rows)
  const profitTotalRevenue = profitRows.reduce((s: number, r: any) => s + Number(r.clientRateAmd || r.clientRate || 0), 0);
  const profitTotalProfit = profitRows.reduce((s: number, r: any) => s + calcTripProfit(r), 0);
  const profitTotalExpense = profitTotalRevenue - profitTotalProfit;

  // Sverka group
  const sverkaRows = useMemo(() => (profitData?.rows || []).filter((r: any) => r.status === 'sverka'), [profitData?.rows]);
  const sverkaRevenue = sverkaRows.reduce((s: number, r: any) => s + Number(r.clientRateAmd || r.clientRate || 0), 0);

  // Cash gap rows
  const cashGapRows = useMemo(() => {
    if (!profitData?.rows) return [];
    return profitData.rows.filter((r: any) =>
      r.tripTypeRaw === 'expedition' &&
      (r.clientPaymentStatus || 'not_paid') !== 'paid' &&
      (r.carrierPaymentStatus === 'paid' || Number(r.carrierPaidAmountAmd ?? r.carrierPaidAmount ?? 0) > 0)
    );
  }, [profitData?.rows]);
  const cashGapTotal = cashGapRows.reduce((s: number, r: any) => s + Number(r.carrierPaidAmountAmd ?? r.carrierPaidAmount ?? 0), 0);

  // Own fleet data (доход/расход/прибыль собственного транспорта) — единый источник
  // /api/reports/own-fleet, та же связка функций, что в director-finance/vehicle-analytics/
  // vehicles/[id]/economics (Trip.vehicleTripId для дохода, computeVehicleTripExpensesAmd для
  // расхода). Раньше здесь доход считался по Trip.tripDate напрямую, а расход — отдельным
  // запросом по VehicleTrip за период; из-за разных выборок цифры могли расходиться с
  // остальными разделами (см. аудит архитектуры). Теперь оба идут по одному и тому же
  // набору рейсов, отфильтрованных по VehicleTrip.departureDate.
  const [ownFleetData, setOwnFleetData] = useState<{
    vehicleTrips: any[]; matchedTrips: any[]; fleetExpenseRows: any[];
    totals: { incomeAmd: number; expensesAmd: number; profitAmd: number; breakdown: { salary: number; perDiem: number; fuel: number; other: number; fleetExpenses: number } };
  } | null>(null);
  const [ownFleetLoading, setOwnFleetLoading] = useState(false);

  const loadOwnFleet = useCallback(async () => {
    if (!appliedFilters.dateFrom || !appliedFilters.dateTo) return;
    setOwnFleetLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom: appliedFilters.dateFrom, dateTo: appliedFilters.dateTo });
      const res = await fetch(`/api/reports/own-fleet?${params}`);
      const data = await res.json();
      setOwnFleetData(data);
    } catch { /* */ }
    setOwnFleetLoading(false);
  }, [appliedFilters]);

  useEffect(() => { if (tab === 'own_fleet' && filtersReady) loadOwnFleet(); }, [tab, loadOwnFleet, filtersReady]);

  const ownFleetRows = ownFleetData?.matchedTrips ?? [];
  const ownFleetRevenue = ownFleetData?.totals.incomeAmd ?? 0;
  const vtDirectSalary = ownFleetData?.totals.breakdown.salary ?? 0;
  const vtDirectPerDiem = ownFleetData?.totals.breakdown.perDiem ?? 0;
  const vtDirectFuel = ownFleetData?.totals.breakdown.fuel ?? 0;
  const vtDirectOther = ownFleetData?.totals.breakdown.other ?? 0;
  const vtDirectTotal = vtDirectSalary + vtDirectPerDiem + vtDirectFuel + vtDirectOther;
  const fleetTotalExpenses = ownFleetData?.totals.breakdown.fleetExpenses ?? 0;
  const combinedTotalExpenses = ownFleetData?.totals.expensesAmd ?? 0;
  const ownFleetProfit = ownFleetData?.totals.profitAmd ?? 0;
  const fleetExpRows = useMemo(() => ownFleetData?.fleetExpenseRows ?? [], [ownFleetData]);
  const fleetExpBreakdown = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const fe of fleetExpRows) totals[fe.expenseType] = (totals[fe.expenseType] || 0) + Number(fe.amountAmd || 0);
    return totals;
  }, [fleetExpRows]);
  const fleetExpLoading = ownFleetLoading;
  const vtProfitLoading = ownFleetLoading;

  // CSV export
  const exportCsv = () => {
    const rows: string[][] = [];
    if (tab === 'profit') {
      rows.push(['Дата', 'Маршрут', 'Клиент', 'Тип', 'Доход ֏', 'Расход ֏', 'Прибыль ֏']);
      for (const r of profitRows) {
        const prof = calcTripProfit(r);
        const exp = Number(r.clientRateAmd || r.clientRate || 0) - prof;
        rows.push([r.date, `${r.routeFrom} → ${r.routeTo}`, r.client, r.tripType, String(Math.round(r.clientRateAmd || r.clientRate)), String(Math.round(exp)), String(Math.round(prof))]);
      }
    } else if (tab === 'own_fleet') {
      rows.push(['--- ДОХОД ПО ЗАЯВКАМ ---']);
      rows.push(['Дата', '№ заявки', 'Маршрут', 'Клиент', 'Доход ֏']);
      for (const r of ownFleetRows) {
        rows.push([r.date, r.tripNumber, `${r.routeFrom} → ${r.routeTo}`, r.client, String(Math.round(Number(r.clientRateAmd || r.clientRate || 0)))]);
      }
      rows.push([]);
      rows.push(['--- РАСХОДЫ АВТОПАРКА ---']);
      rows.push(['Дата', 'Машина', 'Тип', 'Сумма', 'Валюта', 'Сумма AMD', 'Комментарий']);
      for (const fe of (fleetExpRows)) {
        rows.push([formatDate(fe.date), fe.vehicle?.plateNumber || '', FLEET_EXPENSE_TYPE_MAP[fe.expenseType] || fe.expenseType, String(Number(fe.amount)), fe.currency, String(Math.round(Number(fe.amountAmd))), fe.comment || '']);
      }
      rows.push([]);
      rows.push(['Итого доход', String(Math.round(ownFleetRevenue))]);
      rows.push(['Итого расходы', String(Math.round(combinedTotalExpenses))]);
      rows.push(['Чистая прибыль', String(Math.round(ownFleetProfit))]);
    } else {
      rows.push(['Дата', 'Маршрут', 'Клиент', 'Ставка клиента ֏', 'Оплачено перевозчику ֏', 'Статус']);
      for (const r of cashGapRows) {
        rows.push([r.date, `${r.routeFrom} → ${r.routeTo}`, r.client, String(Math.round(Number(r.clientRateAmd ?? r.clientRate ?? 0))), String(Math.round(Number(r.carrierPaidAmountAmd ?? r.carrierPaidAmount ?? 0))), r.carrierPaymentStatus === 'paid' ? 'Оплачено' : 'Частично']);
      }
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `report_${tab}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const [downloading, setDownloading] = useState(false);
  const handleDownloadXLSX = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams({ dateFrom: appliedFilters.dateFrom, dateTo: appliedFilters.dateTo });
      if (appliedFilters.clientId) params.set('clientId', appliedFilters.clientId);
      if (appliedFilters.tripType) params.set('tripType', appliedFilters.tripType);
      const res = await fetch(`/api/reports/trips/xlsx?${params}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Отчёт_${dateFrom}_${dateTo}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { alert('Ошибка скачивания'); }
    finally { setDownloading(false); }
  };

  const TABS: { key: Tab; label: string; icon: any; color: string }[] = [
    { key: 'profit', label: 'Прибыль по заявкам', icon: TrendingUp, color: 'text-green-600' },
    { key: 'own_fleet', label: 'Свой автопарк', icon: Car, color: 'text-blue-600' },
    { key: 'cash_gaps', label: 'Кассовые разрывы', icon: AlertTriangle, color: 'text-red-600' },
  ];

  const isLoading = tab === 'own_fleet' ? ownFleetLoading : profitLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Отчёты</h1>
          <p className="text-sm text-muted-foreground">Аналитика за период: прибыль, автопарк, кассовые разрывы</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDownloadXLSX} disabled={downloading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-60 transition">
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button onClick={exportCsv} disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border hover:bg-muted transition disabled:opacity-50">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      {/* ═══ Global Filter Bar ═══ */}
      <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Дата от</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Дата до</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Клиент</label>
            <select value={globalClientId} onChange={e => setGlobalClientId(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background">
              <option value="">Все клиенты</option>
              {allClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Тип заявки</label>
            <select value={globalTripType} onChange={e => setGlobalTripType(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background">
              {TRIP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2 col-span-2 sm:col-span-2">
            <button type="button" onClick={applyFilters}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition">
              Применить
            </button>
            <button type="button" onClick={resetFilters}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 border text-sm font-medium rounded-lg hover:bg-muted transition">
              Сбросить
            </button>
          </div>
        </div>
      </div>

      {/* ═══ Period Summary Cards (4) ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl p-4 shadow-sm border-l-4 border-emerald-500">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[11px] text-muted-foreground">Доход за период</span>
          </div>
          <p className="text-lg font-bold font-mono text-emerald-600">{profitLoading ? '...' : fmtAmd(periodRevenue)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm border-l-4 border-red-500">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown className="w-3.5 h-3.5 text-red-600" />
            <span className="text-[11px] text-muted-foreground">Расход за период</span>
          </div>
          <p className="text-lg font-bold font-mono text-red-500">{profitLoading ? '...' : fmtAmd(periodExpense)}</p>
        </div>
        <div className={`bg-card rounded-xl p-4 shadow-sm border-l-4 ${periodProfit >= 0 ? 'border-green-500' : 'border-red-500'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className={`w-3.5 h-3.5 ${periodProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            <span className="text-[11px] text-muted-foreground">Прибыль за период</span>
          </div>
          <p className={`text-lg font-bold font-mono ${periodProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{profitLoading ? '...' : fmtAmd(periodProfit)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm border-l-4 border-orange-500">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet className="w-3.5 h-3.5 text-orange-600" />
            <span className="text-[11px] text-muted-foreground">Кассовый разрыв</span>
          </div>
          <p className="text-lg font-bold font-mono text-orange-600">{profitLoading ? '...' : fmtAmd(cashGapTotal)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{cashGapRows.length} заявок</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition whitespace-nowrap flex-1 justify-center ${
              tab === t.key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
            }`}>
            <t.icon className={`w-4 h-4 ${tab === t.key ? t.color : ''}`} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== TAB: Profit ===== */}
      {tab === 'profit' && (
        <div className="space-y-4">
          {/* Sub-filter: payment status */}
          <div className="flex flex-wrap gap-3 items-center">
            <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}
              className="text-sm border rounded-lg px-3 py-2 bg-background">
              <option value="all">Все оплаты</option>
              <option value="not_paid">Не оплачено</option>
              <option value="partially_paid">Частично</option>
              <option value="paid">Оплачено</option>
            </select>
          </div>

          {/* KPI (reflects sub-filter) */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card rounded-xl p-4 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1">Доход</p>
              <p className="text-lg font-bold font-mono text-emerald-600">{profitLoading ? '...' : fmtAmd(profitTotalRevenue)}</p>
            </div>
            <div className="bg-card rounded-xl p-4 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1">Расход</p>
              <p className="text-lg font-bold font-mono text-red-500">{profitLoading ? '...' : fmtAmd(profitTotalExpense)}</p>
            </div>
            <div className="bg-card rounded-xl p-4 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1">Прибыль</p>
              <p className={`text-lg font-bold font-mono ${profitTotalProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {profitLoading ? '...' : fmtAmd(profitTotalProfit)}
              </p>
            </div>
          </div>

          {/* Sverka group card */}
          {sverkaRows.length > 0 && (
            <div className="bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-xl px-4 py-3 flex items-center gap-4">
              <span className="inline-block w-2 h-2 rounded-full bg-teal-500 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">Сверка — {sverkaRows.length} заявк</p>
                <p className="text-xs text-teal-600 dark:text-teal-400 font-mono">{fmtAmd(sverkaRevenue)}</p>
              </div>
              <p className="text-[11px] text-teal-500 dark:text-teal-400 ml-auto">Ожидают завершения</p>
            </div>
          )}

          {/* Table */}
          {profitLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : profitRows.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Нет заявок за выбранный период</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                      <th className="py-3 px-4">Дата</th>
                      <th className="py-3 px-3">Маршрут</th>
                      <th className="py-3 px-3 hidden sm:table-cell">Клиент</th>
                      <th className="py-3 px-3">Тип</th>
                      <th className="py-3 px-3 text-right">Доход ֏</th>
                      <th className="py-3 px-3 text-right">Расход ֏</th>
                      <th className="py-3 px-3 text-right">Прибыль ֏</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitRows.map((r: any, i: number) => {
                      const profit = calcTripProfit(r);
                      const exp = Number(r.clientRateAmd || r.clientRate || 0) - profit;
                      return (
                        <tr key={i} className="border-b hover:bg-muted/30 transition">
                          <td className="py-2.5 px-4 text-xs whitespace-nowrap">{r.date}</td>
                          <td className="py-2.5 px-3">
                            <CrumbLink href={`/trips/${r.id}`} fromLabel="Отчёты" fromKey="reports" className="text-primary hover:underline text-xs">{r.routeFrom} → {r.routeTo}</CrumbLink>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-muted-foreground hidden sm:table-cell">{r.client}</td>
                          <td className="py-2.5 px-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.tripTypeRaw === 'own_transport' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{r.tripType}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs">{fmtAmd(Number(r.clientRateAmd || r.clientRate || 0))}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs text-red-500">{fmtAmd(exp)}</td>
                          <td className={`py-2.5 px-3 text-right font-mono text-xs font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtAmd(profit)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/20 font-semibold">
                      <td colSpan={4} className="py-3 px-4 text-right text-xs">ИТОГО ({profitRows.length} заявок):</td>
                      <td className="py-3 px-3 text-right font-mono text-xs">{fmtAmd(profitTotalRevenue)}</td>
                      <td className="py-3 px-3 text-right font-mono text-xs text-red-500">{fmtAmd(profitTotalExpense)}</td>
                      <td className={`py-3 px-3 text-right font-mono text-xs font-semibold ${profitTotalProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtAmd(profitTotalProfit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== TAB: Own Fleet ===== */}
      {tab === 'own_fleet' && (
        <div className="space-y-4">
          {/* KPI summary cards */}
          <div className="bg-card rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Сводка по собственным машинам</h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3">
                <p className="text-[11px] text-emerald-600 mb-0.5">Доход по заявкам</p>
                <p className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400">{ownFleetLoading ? '...' : fmtAmd(ownFleetRevenue)}</p>
                <p className="text-[9px] text-muted-foreground">{ownFleetRows.length} заявок</p>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
                <p className="text-[11px] text-red-600 mb-0.5">Все расходы</p>
                <p className="text-lg font-bold font-mono text-red-600">{ownFleetLoading ? '...' : fmtAmd(combinedTotalExpenses)}</p>
                <p className="text-[9px] text-muted-foreground">
                  доп: {fmtAmd(fleetTotalExpenses)} + рейсы: {fmtAmd(vtDirectTotal)}
                </p>
              </div>
              <div className={`rounded-lg p-3 ${ownFleetProfit >= 0 ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
                <p className={`text-[11px] mb-0.5 ${ownFleetProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>ЧИСТАЯ ПРИБЫЛЬ</p>
                <p className={`text-lg font-bold font-mono ${ownFleetProfit >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600'}`}>{ownFleetLoading ? '...' : fmtAmd(ownFleetProfit)}</p>
              </div>
            </div>

            {/* Expense breakdown — direct trip expenses */}
            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Расходы по рейсам машин:</p>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-blue-600 mb-0.5">Зарплата</p>
                  <p className="text-sm font-bold font-mono text-foreground">{vtProfitLoading ? '...' : fmtAmd(vtDirectSalary)}</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-purple-600 mb-0.5">Суточные</p>
                  <p className="text-sm font-bold font-mono text-foreground">{vtProfitLoading ? '...' : fmtAmd(vtDirectPerDiem)}</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-amber-600 mb-0.5">Топливо</p>
                  <p className="text-sm font-bold font-mono text-foreground">{vtProfitLoading ? '...' : fmtAmd(vtDirectFuel)}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/30 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-slate-600 mb-0.5">Прочие</p>
                  <p className="text-sm font-bold font-mono text-foreground">{vtProfitLoading ? '...' : fmtAmd(vtDirectOther)}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-red-600 mb-0.5">Итого рейсы</p>
                  <p className="text-sm font-bold font-mono text-red-600">{vtProfitLoading ? '...' : fmtAmd(vtDirectTotal)}</p>
                </div>
              </div>
            </div>

            {/* Expense breakdown — additional fleet expenses */}
            {fleetTotalExpenses > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Доп. расходы автопарка:</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {Object.entries(FLEET_EXPENSE_TYPE_MAP).map(([key, label]) => (
                    <div key={key} className="bg-muted/40 rounded-lg px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                      <p className="text-sm font-bold font-mono text-foreground">{fleetExpLoading ? '...' : fmtAmd(fleetExpBreakdown[key] || 0)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Formula */}
            <div className="border-t pt-3">
              <p className="text-[11px] text-muted-foreground">
                Формула: <span className="font-mono">Чистая прибыль = Доход (заявки) − Расходы рейсов (зп + суточные + топливо + прочие) − Доп. расходы автопарка</span>
              </p>
            </div>
          </div>

          {/* Revenue table (own_transport trips) */}
          <div className="bg-card rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/20">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Доход по заявкам ({ownFleetRows.length})</h4>
            </div>
            {ownFleetLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : ownFleetRows.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">Нет заявок за период</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                      <th className="py-2.5 px-4">Дата</th>
                      <th className="py-2.5 px-3">Маршрут</th>
                      <th className="py-2.5 px-3 hidden sm:table-cell">Клиент</th>
                      <th className="py-2.5 px-3 text-right">Доход ֏</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownFleetRows.map((r: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-muted/30 transition">
                        <td className="py-2 px-4 text-xs whitespace-nowrap">{r.date}</td>
                        <td className="py-2 px-3"><CrumbLink href={`/trips/${r.id}`} fromLabel="Отчёты" fromKey="reports" className="text-primary hover:underline text-xs">{r.routeFrom} → {r.routeTo}</CrumbLink></td>
                        <td className="py-2 px-3 text-xs text-muted-foreground hidden sm:table-cell">{r.client}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs">{fmtAmd(Number(r.clientRateAmd || r.clientRate || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/20 font-semibold">
                      <td colSpan={3} className="py-2.5 px-4 text-right text-xs">ИТОГО:</td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-emerald-600">{fmtAmd(ownFleetRevenue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Fleet expenses table */}
          <div className="bg-card rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Расходы автопарка ({(fleetExpRows).length})</h4>
              <Link href="/vehicle-trips" className="text-[11px] text-primary hover:underline">Рейсы машин →</Link>
            </div>
            {fleetExpLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : (fleetExpRows).length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">Нет расходов за период</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                      <th className="py-2.5 px-4">Дата</th>
                      <th className="py-2.5 px-3">Машина</th>
                      <th className="py-2.5 px-3">Тип</th>
                      <th className="py-2.5 px-3 text-right">Сумма</th>
                      <th className="py-2.5 px-3 text-right hidden sm:table-cell">AMD ֏</th>
                      <th className="py-2.5 px-3 hidden md:table-cell">Комментарий</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fleetExpRows).map((fe: any) => (
                      <tr key={fe.id} className="border-b hover:bg-muted/30 transition">
                        <td className="py-2 px-4 text-xs whitespace-nowrap">{formatDate(fe.date)}</td>
                        <td className="py-2 px-3 text-xs">{fe.vehicle?.plateNumber || '—'}</td>
                        <td className="py-2 px-3 text-xs">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {FLEET_EXPENSE_TYPE_MAP[fe.expenseType] || fe.expenseType}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-xs whitespace-nowrap">
                          {Number(fe.amount).toLocaleString('ru-RU')} {fe.currency === 'AMD' ? '֏' : fe.currency === 'RUB' ? '₽' : '$'}
                          {fe.currency !== 'AMD' && <span className="text-muted-foreground text-[9px] ml-1">(×{Number(fe.exchangeRate)})</span>}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-xs font-medium hidden sm:table-cell">{fmtAmd(Number(fe.amountAmd))}</td>
                        <td className="py-2 px-3 text-xs text-muted-foreground hidden md:table-cell max-w-[200px] truncate">{fe.comment || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/20 font-semibold">
                      <td colSpan={3} className="py-2.5 px-4 text-right text-xs">ИТОГО:</td>
                      <td className="py-2.5 px-3"></td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-red-500 hidden sm:table-cell">{fmtAmd(fleetTotalExpenses)}</td>
                      <td className="hidden md:table-cell"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== TAB: Cash Gaps ===== */}
      {tab === 'cash_gaps' && (
        <div className="space-y-4">
          {/* Summary */}
          {cashGapRows.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span className="font-semibold text-red-800 dark:text-red-300 text-sm">Клиент не оплатил, перевозчику уже оплачено</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-red-600/70">Заявок</p>
                  <p className="text-xl font-bold text-red-700 dark:text-red-400">{cashGapRows.length}</p>
                </div>
                <div>
                  <p className="text-xs text-red-600/70">Оплачено перевозчикам</p>
                  <p className="text-xl font-bold text-red-700 dark:text-red-400">{fmtAmd(cashGapTotal)}</p>
                </div>
              </div>
            </div>
          )}

          {profitLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : cashGapRows.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Кассовых разрывов нет — всё в порядке</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                      <th className="py-3 px-4">Дата</th>
                      <th className="py-3 px-3">Маршрут</th>
                      <th className="py-3 px-3">Клиент</th>
                      <th className="py-3 px-3 text-right">Ставка клиента ֏</th>
                      <th className="py-3 px-3 text-right">Оплачено перевоз. ֏</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashGapRows.map((r: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-muted/30 transition">
                        <td className="py-2.5 px-4 text-xs whitespace-nowrap">{r.date}</td>
                        <td className="py-2.5 px-3">
                          <CrumbLink href={`/trips/${r.id}`} fromLabel="Отчёты" fromKey="reports" className="text-primary hover:underline text-xs">{r.routeFrom} → {r.routeTo}</CrumbLink>
                        </td>
                        <td className="py-2.5 px-3 text-xs">{r.client}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs">{fmtAmd(Number(r.clientRateAmd ?? r.clientRate ?? 0))}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs font-semibold text-red-600">{fmtAmd(Number(r.carrierPaidAmountAmd ?? r.carrierPaidAmount ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/20 font-semibold">
                      <td colSpan={4} className="py-3 px-4 text-right text-xs">ИТОГО:</td>
                      <td className="py-3 px-3 text-right font-mono text-xs text-red-600">{fmtAmd(cashGapTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
