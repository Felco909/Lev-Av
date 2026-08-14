'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import CrumbLink from '@/components/nav/crumb-link';
import { useNavState } from '@/hooks/use-nav-state';
import { peekRestore } from '@/lib/nav-history';
import {
  Loader2, AlertTriangle, Download, FileSpreadsheet, Printer, RefreshCw, Search, X,
  TrendingUp, DollarSign, TrendingDown, Wallet, CheckCircle2, Settings2, ChevronRight,
} from 'lucide-react';
import { formatDate, FLEET_EXPENSE_TYPE_MAP } from '@/lib/utils';
import { CurrencyAmount } from '@/components/ui/currency-amount';
import ReportChart from './_components/report-chart';

type Tab = 'overview' | 'profit' | 'own_fleet' | 'debts';
type ChangePeriod = 'today' | 'week' | 'month';
type DebtsSubTab = 'all' | 'clients' | 'carriers' | 'cashgaps';

const WIDGET_KEYS = ['trend', 'changes', 'operational', 'attention', 'events', 'topDebtors', 'fleetSummary'] as const;
type WidgetKey = typeof WIDGET_KEYS[number];
const WIDGET_LABELS: Record<WidgetKey, string> = {
  trend: 'Динамика прибыли',
  changes: 'Что изменилось',
  operational: 'Операционная сводка',
  attention: 'Требует внимания',
  events: 'Последние события',
  topDebtors: 'Топ-5 должников',
  fleetSummary: 'Автопарк кратко',
};

// Локальные компоненты даты, БЕЗ toISOString() — конвертация в UTC сдвигает дату на день
// в часовых поясах впереди UTC (сервер на Windows-машине, локальное время), что уже один раз
// давало "Этот месяц" = 06-30…07-30 вместо 07-01…07-31.
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ReportsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');

  // ═══ Global filters (applied via "Применить" button) ═══
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [globalClientId, setGlobalClientId] = useState('');
  const [globalTripType, setGlobalTripType] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ dateFrom: '', dateTo: '', clientId: '', tripType: '' });
  const [filtersReady, setFiltersReady] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);
  const [allVehicles, setAllVehicles] = useState<{ id: string; plateNumber: string; brand: string; model: string }[]>([]);

  const TRIP_TYPES = [
    { value: '', label: 'Все типы' },
    { value: 'own_transport', label: 'Собственные' },
    { value: 'expedition', label: 'Экспедиция' },
  ];

  const fmtAmd = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ֏`;

  // ═══ Period presets ═══
  const applyPreset = (key: string) => {
    const now = new Date();
    let from = new Date(now), to = new Date(now);
    if (key === 'today') { /* from=to=now */ }
    else if (key === 'yesterday') { from.setDate(from.getDate() - 1); to.setDate(to.getDate() - 1); }
    else if (key === 'week') { from.setDate(from.getDate() - 6); }
    else if (key === 'this_month') { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
    else if (key === 'last_month') { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 0); }
    else if (key === 'this_year') { from = new Date(now.getFullYear(), 0, 1); to = new Date(now.getFullYear(), 11, 31); }
    const f = ymd(from), t = ymd(to);
    setDateFrom(f); setDateTo(t); setActivePreset(key);
    setAppliedFilters(prev => ({ ...prev, dateFrom: f, dateTo: t }));
  };
  const PRESETS = [
    { key: 'today', label: 'Сегодня' },
    { key: 'yesterday', label: 'Вчера' },
    { key: 'week', label: 'Неделя' },
    { key: 'this_month', label: 'Этот месяц' },
    { key: 'last_month', label: 'Прошлый месяц' },
    { key: 'this_year', label: 'Этот год' },
  ];

  // Profit / trips data
  const [profitData, setProfitData] = useState<any>(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [profitError, setProfitError] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [machineFilter, setMachineFilter] = useState('');
  const [sortKey, setSortKey] = useState<'date' | 'revenue' | 'expense' | 'profit'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Previous-period profit data (для тренда KPI на Обзоре) — тот же /api/reports/trips,
  // просто со сдвинутым диапазоном дат; не новая логика, не новый эндпоинт.
  const [prevProfitData, setPrevProfitData] = useState<any>(null);

  // Init dates to current month and auto-apply (skip if restoring saved state)
  useEffect(() => {
    if (peekRestore('reports')) return;
    applyPreset('this_month');
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(data => {
      const list = Array.isArray(data) ? data : data?.clients ?? [];
      setAllClients(list.map((c: any) => ({ id: c.id, name: c.name })));
    }).catch(() => {});
    fetch('/api/vehicles').then(r => r.json()).then(data => {
      const list = Array.isArray(data) ? data : [];
      setAllVehicles(list.map((v: any) => ({ id: v.id, plateNumber: v.plateNumber, brand: v.brand, model: v.model })));
    }).catch(() => {});
  }, []);

  const applyFilters = () => {
    setActivePreset(null);
    setAppliedFilters({ dateFrom, dateTo, clientId: globalClientId, tripType: globalTripType });
  };

  const resetFilters = () => {
    applyPreset('this_month');
    setGlobalClientId('');
    setGlobalTripType('');
    setAppliedFilters(prev => ({ ...prev, clientId: '', tripType: '' }));
  };

  // ═══ Navigation state preservation ═══
  const scrollRef = useRef(0);
  useNavState('reports',
    () => ({
      tab, dateFrom, dateTo, globalClientId, globalTripType,
      appliedFilters, paymentFilter, machineFilter,
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
      if (s.machineFilter !== undefined) setMachineFilter(s.machineFilter);
      scrollRef.current = s.scrollY || 0;
      setFiltersReady(true);
    }
  );

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
    setProfitError(false);
    try {
      const params = new URLSearchParams({ dateFrom: appliedFilters.dateFrom, dateTo: appliedFilters.dateTo });
      if (appliedFilters.clientId) params.set('clientId', appliedFilters.clientId);
      if (appliedFilters.tripType) params.set('tripType', appliedFilters.tripType);
      const res = await fetch(`/api/reports/trips?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProfitData(data);
    } catch { setProfitError(true); } finally { setProfitLoading(false); }
  }, [appliedFilters]);

  useEffect(() => { if (filtersReady) loadProfit(); }, [filtersReady, loadProfit]);

  // Предыдущий период (для тренда на Обзоре) — грузим только когда вкладка "Обзор" открыта
  const loadPrevProfit = useCallback(async () => {
    if (!appliedFilters.dateFrom || !appliedFilters.dateTo) return;
    const from = new Date(appliedFilters.dateFrom);
    const to = new Date(appliedFilters.dateTo);
    const durationMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 86400000);
    const prevFrom = new Date(prevTo.getTime() - durationMs);
    try {
      const params = new URLSearchParams({ dateFrom: ymd(prevFrom), dateTo: ymd(prevTo) });
      if (appliedFilters.clientId) params.set('clientId', appliedFilters.clientId);
      if (appliedFilters.tripType) params.set('tripType', appliedFilters.tripType);
      const res = await fetch(`/api/reports/trips?${params}`);
      const data = await res.json();
      setPrevProfitData(data);
    } catch { /* тренд необязателен — молча пропускаем */ }
  }, [appliedFilters]);

  useEffect(() => { if (tab === 'overview' && filtersReady) loadPrevProfit(); }, [tab, filtersReady, loadPrevProfit]);

  // Profit rows filtered (payment sub-filter + machine filter, global client filter is applied server-side)
  const profitRows = useMemo(() => {
    if (!profitData?.rows) return [];
    let rows = profitData.rows;
    if (paymentFilter === 'not_paid') rows = rows.filter((r: any) => (r.clientPaymentStatus || 'not_paid') === 'not_paid');
    if (paymentFilter === 'partially_paid') rows = rows.filter((r: any) => r.clientPaymentStatus === 'partially_paid');
    if (paymentFilter === 'paid') rows = rows.filter((r: any) => r.clientPaymentStatus === 'paid');
    if (machineFilter) rows = rows.filter((r: any) => r.vehicleId === machineFilter);
    return rows;
  }, [profitData?.rows, paymentFilter, machineFilter]);

  const calcTripProfit = (r: any) => Number(r.profitAmd ?? r.profit ?? 0);

  const profitRowsSorted = useMemo(() => {
    const rows = [...profitRows];
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a: any, b: any) => {
      if (sortKey === 'date') return dir * (new Date(a.date).getTime() - new Date(b.date).getTime());
      if (sortKey === 'revenue') return dir * (Number(a.clientRateAmd || a.clientRate || 0) - Number(b.clientRateAmd || b.clientRate || 0));
      if (sortKey === 'expense') {
        const ea = Number(a.clientRateAmd || a.clientRate || 0) - calcTripProfit(a);
        const eb = Number(b.clientRateAmd || b.clientRate || 0) - calcTripProfit(b);
        return dir * (ea - eb);
      }
      return dir * (calcTripProfit(a) - calcTripProfit(b));
    });
    return rows;
  }, [profitRows, sortKey, sortDir]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  // Period totals — computed from ALL filtered rows (before payment sub-filter, matches global period)
  const allRows = profitData?.rows || [];
  const periodRevenue = allRows.reduce((s: number, r: any) => s + Number(r.clientRateAmd || r.clientRate || 0), 0);
  const periodProfit = allRows.reduce((s: number, r: any) => s + calcTripProfit(r), 0);
  const periodExpense = periodRevenue - periodProfit;
  const periodProfitability = periodRevenue > 0 ? (periodProfit / periodRevenue) * 100 : 0;

  const prevRows = prevProfitData?.rows || [];
  const prevRevenue = prevRows.reduce((s: number, r: any) => s + Number(r.clientRateAmd || r.clientRate || 0), 0);
  const prevProfit = prevRows.reduce((s: number, r: any) => s + calcTripProfit(r), 0);
  const prevExpense = prevRevenue - prevProfit;
  const prevProfitability = prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : 0;
  const trendPct = (cur: number, prev: number): number | null => {
    if (!prevProfitData) return null;
    if (prev === 0) return cur === 0 ? 0 : null;
    return ((cur - prev) / Math.abs(prev)) * 100;
  };

  // Profit tab totals (payment+machine filtered)
  const profitTotalRevenue = profitRows.reduce((s: number, r: any) => s + Number(r.clientRateAmd || r.clientRate || 0), 0);
  const profitTotalProfit = profitRows.reduce((s: number, r: any) => s + calcTripProfit(r), 0);
  const profitTotalExpense = profitTotalRevenue - profitTotalProfit;

  const sverkaRows = useMemo(() => (profitData?.rows || []).filter((r: any) => r.status === 'sverka'), [profitData?.rows]);
  const sverkaRevenue = sverkaRows.reduce((s: number, r: any) => s + Number(r.clientRateAmd || r.clientRate || 0), 0);

  const cashGapRows = useMemo(() => {
    if (!profitData?.rows) return [];
    return profitData.rows.filter((r: any) =>
      r.tripTypeRaw === 'expedition' &&
      (r.clientPaymentStatus || 'not_paid') !== 'paid' &&
      (r.carrierPaymentStatus === 'paid' || Number(r.carrierPaidAmountAmd ?? r.carrierPaidAmount ?? 0) > 0)
    );
  }, [profitData?.rows]);
  const cashGapTotal = cashGapRows.reduce((s: number, r: any) => s + Number(r.carrierPaidAmountAmd ?? r.carrierPaidAmount ?? 0), 0);

  const lossRows = useMemo(() => (profitData?.rows || []).filter((r: any) => calcTripProfit(r) < 0), [profitData?.rows]);

  // ═══ Own fleet (Автопарк) ═══
  const [ownFleetData, setOwnFleetData] = useState<any>(null);
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

  useEffect(() => { if ((tab === 'own_fleet' || tab === 'overview') && filtersReady) loadOwnFleet(); }, [tab, loadOwnFleet, filtersReady]);

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
  const fuelSummary = ownFleetData?.totals.fuel ?? null;
  const fleetExpRows = useMemo(() => ownFleetData?.fleetExpenseRows ?? [], [ownFleetData]);
  const fleetExpBreakdown = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const fe of fleetExpRows) totals[fe.expenseType] = (totals[fe.expenseType] || 0) + Number(fe.amountAmd || 0);
    return totals;
  }, [fleetExpRows]);
  const fleetExpLoading = ownFleetLoading;
  const vtProfitLoading = ownFleetLoading;

  // ═══ Долги и разрывы — единый источник /api/debts (глобальное текущее состояние, без
  // фильтра по периоду отчёта — долг это "сейчас", как и в /debts) ═══
  const [debtsData, setDebtsData] = useState<any>(null);
  const [debtsLoading, setDebtsLoading] = useState(false);
  const [debtsError, setDebtsError] = useState(false);
  const [debtsSubTab, setDebtsSubTab] = useState<DebtsSubTab>('all');

  const loadDebts = useCallback(async () => {
    setDebtsLoading(true);
    setDebtsError(false);
    try {
      const res = await fetch('/api/debts');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDebtsData(data);
    } catch { setDebtsError(true); } finally { setDebtsLoading(false); }
  }, []);

  useEffect(() => { if ((tab === 'overview' || tab === 'debts') && filtersReady) loadDebts(); }, [tab, filtersReady, loadDebts]);

  const topDebtors = useMemo(() => (debtsData?.grouped ?? []).slice(0, 5), [debtsData]);
  const overdueClientDebts = useMemo(() => (debtsData?.clientDebts ?? []).filter((d: any) => d.isOverdue), [debtsData]);
  const allCashGapTrips = useMemo(() => (debtsData?.clientDebts ?? []).filter((d: any) => (d.cashGap || 0) > 0), [debtsData]);

  // ═══ Overview-only extra data (операционная сводка / что изменилось / внимание-топливо / события) ═══
  const [overviewExtra, setOverviewExtra] = useState<any>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState(false);
  const [changePeriod, setChangePeriod] = useState<ChangePeriod>('week');

  const loadOverviewExtra = useCallback(async (period: ChangePeriod) => {
    setOverviewLoading(true);
    setOverviewError(false);
    try {
      const res = await fetch(`/api/reports/overview?changePeriod=${period}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOverviewExtra(data);
      setLastUpdatedAt(new Date());
    } catch { setOverviewError(true); } finally { setOverviewLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'overview') loadOverviewExtra(changePeriod); }, [tab, changePeriod, loadOverviewExtra]);

  // Приблизительные счётчики "новых" долгов/разрывов — из уже загруженного /api/debts,
  // без дополнительных запросов (см. проектную оговорку: долг — состояние, а не событие,
  // поэтому "новое" здесь — заявка с датой рейса в выбранном периоде).
  const isInChangePeriod = useCallback((dateStr: string, period: ChangePeriod): boolean => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    if (period === 'today') { const s = new Date(now); s.setHours(0, 0, 0, 0); return d >= s; }
    if (period === 'week') { const s = new Date(now); s.setDate(s.getDate() - 7); return d >= s; }
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return d >= s;
  }, []);
  const newClientDebtsCount = useMemo(() => (debtsData?.clientDebts ?? []).filter((d: any) => isInChangePeriod(d.tripDate, changePeriod)).length, [debtsData, changePeriod, isInChangePeriod]);
  const newCarrierDebtsCount = useMemo(() => (debtsData?.carrierDebts ?? []).filter((d: any) => isInChangePeriod(d.tripDate, changePeriod)).length, [debtsData, changePeriod, isInChangePeriod]);
  const newCashGapsCount = useMemo(() => (debtsData?.clientDebts ?? []).filter((d: any) => (d.cashGap || 0) > 0 && isInChangePeriod(d.tripDate, changePeriod)).length, [debtsData, changePeriod, isInChangePeriod]);

  // ═══ Last updated / refresh ═══
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([
      loadProfit(),
      (tab === 'own_fleet' || tab === 'overview') ? loadOwnFleet() : Promise.resolve(),
      (tab === 'overview' || tab === 'debts') ? loadDebts() : Promise.resolve(),
      tab === 'overview' ? loadOverviewExtra(changePeriod) : Promise.resolve(),
      tab === 'overview' ? loadPrevProfit() : Promise.resolve(),
    ]);
    setLastUpdatedAt(new Date());
    setRefreshing(false);
  };

  // ═══ Widget visibility (настройка панели) — хранится в существующей таблице Setting,
  // через уже существующий /api/settings (GET все настройки map / PUT { key, value }),
  // ключ персональный по email пользователя. Новой таблицы/эндпоинта нет. ═══
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [widgetVisible, setWidgetVisible] = useState<Record<WidgetKey, boolean>>(
    () => Object.fromEntries(WIDGET_KEYS.map(k => [k, true])) as Record<WidgetKey, boolean>
  );
  const [widgetPanelOpen, setWidgetPanelOpen] = useState(false);
  const widgetSettingKey = userEmail ? `reports_widgets:${userEmail}` : null;

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => setUserEmail(s?.user?.email ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!widgetSettingKey) return;
    fetch('/api/settings').then(r => r.json()).then(map => {
      const raw = map?.[widgetSettingKey];
      if (!raw) return;
      try {
        const hidden: string[] = JSON.parse(raw);
        setWidgetVisible(prev => {
          const next = { ...prev };
          for (const k of WIDGET_KEYS) next[k] = !hidden.includes(k);
          return next;
        });
      } catch { /* игнорируем битое значение */ }
    }).catch(() => {});
  }, [widgetSettingKey]);

  const saveWidgetVisibility = async (next: Record<WidgetKey, boolean>) => {
    setWidgetVisible(next);
    if (!widgetSettingKey) return;
    const hidden = WIDGET_KEYS.filter(k => !next[k]);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: widgetSettingKey, value: JSON.stringify(hidden) }),
      });
    } catch { /* сохранится при следующей попытке */ }
  };

  // ═══ Глобальный поиск — существующий /api/search, расширенный на машины/водителей ═══
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounce = useRef<any>(null);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (searchQuery.trim().length < 2) { setSearchResults(null); return; }
    searchDebounce.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
        const data = await res.json();
        setSearchResults(data);
      } catch { /* */ } finally { setSearchLoading(false); }
    }, 300);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [searchQuery]);

  const closeSearch = () => { setSearchOpen(false); setSearchQuery(''); setSearchResults(null); };

  // ═══ Export ═══
  const exportCsv = () => {
    const rows: string[][] = [];
    if (tab === 'profit') {
      rows.push(['Дата', 'Маршрут', 'Клиент', 'Тип', 'Доход ֏', 'Расход ֏', 'Прибыль ֏']);
      for (const r of profitRowsSorted) {
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
      if (fuelSummary) {
        rows.push([]);
        rows.push(['--- ТОПЛИВО ---']);
        rows.push(['Расход, л', String(fuelSummary.liters)]);
        rows.push(['л/100км', String(fuelSummary.per100Km ?? '')]);
      }
      rows.push([]);
      rows.push(['Итого доход', String(Math.round(ownFleetRevenue))]);
      rows.push(['Итого расходы', String(Math.round(combinedTotalExpenses))]);
      rows.push(['Чистая прибыль', String(Math.round(ownFleetProfit))]);
    } else if (tab === 'debts') {
      rows.push(['--- ДОЛГИ КЛИЕНТОВ ---']);
      rows.push(['Заявка', 'Клиент', 'Дата', 'Долг ֏', 'Просрочено']);
      for (const d of (debtsData?.clientDebts ?? [])) {
        rows.push([d.tripNumber, d.clientName, formatDate(d.tripDate), String(Math.round(d.remaining)), d.isOverdue ? 'да' : 'нет']);
      }
      rows.push([]);
      rows.push(['--- ДОЛГИ ПЕРЕВОЗЧИКАМ ---']);
      rows.push(['Заявка', 'Перевозчик', 'Дата', 'Долг ֏']);
      for (const d of (debtsData?.carrierDebts ?? [])) {
        rows.push([d.tripNumber, d.carrierName, formatDate(d.tripDate), String(Math.round(d.remaining))]);
      }
    } else {
      // overview — сводный лист
      rows.push(['Показатель', 'Значение']);
      rows.push(['Доход за период', String(Math.round(periodRevenue))]);
      rows.push(['Расход за период', String(Math.round(periodExpense))]);
      rows.push(['Прибыль за период', String(Math.round(periodProfit))]);
      rows.push(['Рентабельность, %', periodProfitability.toFixed(1)]);
      rows.push(['Долг клиентов', String(Math.round(debtsData?.totalClientDebt ?? 0))]);
      rows.push(['Долг перевозчикам', String(Math.round(debtsData?.totalCarrierDebt ?? 0))]);
      rows.push(['Кассовый разрыв', String(Math.round(cashGapTotal))]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
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

  // PDF — как и "Печать": существующего PDF-генератора у /reports нет (в отличие от
  // /dashboard/pdf), а заводить новый запрещено условиями задачи ("не делать новый
  // генератор"). Используем системную печать браузера — пользователь может сохранить
  // как PDF через системный диалог печати, без нового рендер-пайплайна на сервере.
  const handlePrint = () => { window.print(); };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Обзор' },
    { key: 'profit', label: 'Прибыль' },
    { key: 'own_fleet', label: 'Автопарк' },
    { key: 'debts', label: 'Долги и разрывы' },
  ];

  const isLoading = tab === 'own_fleet' ? ownFleetLoading : tab === 'debts' ? debtsLoading : profitLoading;

  const goTo = (t: Tab, opts?: { debtsSubTab?: DebtsSubTab; paymentFilter?: string }) => {
    setTab(t);
    if (opts?.debtsSubTab) setDebtsSubTab(opts.debtsSubTab);
    if (opts?.paymentFilter) setPaymentFilter(opts.paymentFilter);
  };

  const trendArrow = (pct: number | null) => {
    if (pct === null) return null;
    const up = pct >= 0;
    return <span className={up ? 'text-emerald-600' : 'text-red-500'}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}% к пред.</span>;
  };

  // Общая карточка KPI — единый интерактивный стиль (курсор/hover/стрелка/клавиатура)
  function KpiCard({ label, value, colorClass, borderClass, trend, onClick, icon: Icon }: any) {
    return (
      <button type="button" onClick={onClick}
        className={`text-left bg-card rounded-xl p-4 shadow-sm border-l-4 ${borderClass} transition hover:shadow-md hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/40 outline-none group relative`}>
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className="w-3.5 h-3.5" />
          <span className="text-[11px] text-muted-foreground">{label}</span>
        </div>
        <p className={`text-lg font-bold font-mono ${colorClass}`}>{value}</p>
        {trend !== undefined && <p className="text-[10px] mt-0.5">{trendArrow(trend)}</p>}
        <ChevronRight className="w-3.5 h-3.5 absolute right-3 bottom-3 text-muted-foreground opacity-0 group-hover:opacity-60 transition" />
      </button>
    );
  }

  // Кликабельная строка (для "Что изменилось"/"Требует внимания"/события/топ-должники)
  function ClickRow({ onClick, children, className = '' }: any) {
    return (
      <button type="button" onClick={onClick} tabIndex={0}
        className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 outline-none group ${className}`}>
        <div className="flex-1 min-w-0">{children}</div>
        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-60 transition shrink-0" />
      </button>
    );
  }

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Отчёты</h1>
          <p className="text-sm text-muted-foreground">Обзор · Прибыль · Автопарк · Долги и разрывы</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Поиск */}
          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-background w-56 sm:w-72">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Заявка, клиент, машина, водитель…"
                className="w-full text-sm bg-transparent outline-none"
              />
              {searchQuery && <button onClick={closeSearch} aria-label="Очистить"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
            </div>
            {searchOpen && searchQuery.trim().length >= 2 && (
              <div className="absolute z-20 mt-1 w-full sm:w-96 right-0 bg-card border rounded-xl shadow-lg max-h-96 overflow-y-auto">
                {searchLoading ? (
                  <div className="p-4 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
                ) : !searchResults ? null : (
                  <>
                    <SearchGroup title="Заявки">
                      {searchResults.trips?.map((t: any) => (
                        <button key={t.id} onClick={() => { router.push(`/trips/${t.id}`); closeSearch(); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition">
                          <span className="font-medium">{t.tripNumber}</span>
                          <span className="text-muted-foreground"> · {t.routeFrom} → {t.routeTo} · {t.client?.name}</span>
                        </button>
                      ))}
                    </SearchGroup>
                    <SearchGroup title="Машины">
                      {searchResults.vehicles?.map((v: any) => (
                        <button key={v.id} onClick={() => { router.push('/vehicles'); closeSearch(); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition">
                          <span className="font-medium">{v.plateNumber}</span>
                          <span className="text-muted-foreground"> · {v.brand} {v.model}</span>
                        </button>
                      ))}
                    </SearchGroup>
                    <SearchGroup title="Водители">
                      {searchResults.drivers?.map((d: any) => (
                        <button key={d.id} onClick={() => { router.push('/drivers'); closeSearch(); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition">
                          <span className="font-medium">{d.fullName}</span>
                        </button>
                      ))}
                    </SearchGroup>
                    <SearchGroup title="Клиенты / Перевозчики">
                      {searchResults.clients?.map((c: any) => (
                        <button key={c.id} onClick={() => { router.push('/clients'); closeSearch(); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition">{c.name}</button>
                      ))}
                      {searchResults.carriers?.map((c: any) => (
                        <button key={c.id} onClick={() => { router.push('/carriers'); closeSearch(); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition">{c.name}</button>
                      ))}
                    </SearchGroup>
                    {['trips', 'vehicles', 'drivers', 'clients', 'carriers'].every(k => !(searchResults[k]?.length)) && (
                      <div className="p-4 text-center text-sm text-muted-foreground">Ничего не найдено</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          {/* Обновлено / статус */}
          <div className="text-right hidden md:block">
            <p className="text-[11px] text-muted-foreground">
              {overviewError ? <span className="text-red-500">Ошибка обновления</span> : refreshing ? 'Обновляется…' : lastUpdatedAt ? `Обновлено: ${lastUpdatedAt.toLocaleDateString('ru-RU')}, ${lastUpdatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ═══ Панель действий (единая для всех вкладок) ═══ */}
      <div className="flex flex-wrap gap-2">
        <button onClick={refreshAll} disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border hover:bg-muted transition disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Обновить</span>
        </button>
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
        <button onClick={handlePrint}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border hover:bg-muted transition">
          <Printer className="w-4 h-4" />
          <span className="hidden sm:inline">PDF / Печать</span>
        </button>
        {tab === 'overview' && (
          <div className="relative ml-auto">
            <button onClick={() => setWidgetPanelOpen(o => !o)}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border hover:bg-muted transition">
              <Settings2 className="w-4 h-4" />
              <span className="hidden sm:inline">Настроить панель</span>
            </button>
            {widgetPanelOpen && (
              <div className="absolute z-20 right-0 mt-1 w-64 bg-card border rounded-xl shadow-lg p-3 space-y-2">
                {WIDGET_KEYS.map(k => (
                  <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={widgetVisible[k]}
                      onChange={e => saveWidgetVisibility({ ...widgetVisible, [k]: e.target.checked })} />
                    {WIDGET_LABELS[k]}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Общие фильтры ═══ */}
      <div className="bg-card rounded-xl p-4 shadow-sm border border-border space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button key={p.key} type="button" onClick={() => applyPreset(p.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${activePreset === p.key ? 'bg-primary text-white border-primary' : 'hover:bg-muted'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Дата от</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePreset(null); }}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Дата до</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePreset(null); }}
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

      {/* ═══ Tab bar ═══ */}
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

      {/* ══════════════════════════ TAB: ОБЗОР ══════════════════════════ */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {/* KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Доход" icon={DollarSign} colorClass="text-emerald-600" borderClass="border-emerald-500"
              value={profitLoading ? '...' : fmtAmd(periodRevenue)} trend={trendPct(periodRevenue, prevRevenue)}
              onClick={() => goTo('profit')} />
            <KpiCard label="Расход" icon={TrendingDown} colorClass="text-red-500" borderClass="border-red-500"
              value={profitLoading ? '...' : fmtAmd(periodExpense)} trend={trendPct(periodExpense, prevExpense)}
              onClick={() => goTo('profit')} />
            <KpiCard label="Прибыль" icon={TrendingUp} colorClass={periodProfit >= 0 ? 'text-green-600' : 'text-red-500'} borderClass={periodProfit >= 0 ? 'border-green-500' : 'border-red-500'}
              value={profitLoading ? '...' : fmtAmd(periodProfit)} trend={trendPct(periodProfit, prevProfit)}
              onClick={() => goTo('profit')} />
            <KpiCard label="Рентабельность" icon={Wallet} colorClass="text-blue-600" borderClass="border-blue-500"
              value={profitLoading ? '...' : `${periodProfitability.toFixed(0)}%`} trend={trendPct(periodProfitability, prevProfitability)}
              onClick={() => goTo('profit')} />
          </div>

          {/* Динамика прибыли */}
          {widgetVisible.trend && (
            <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
              <h3 className="text-sm font-semibold mb-2">Динамика прибыли по месяцам</h3>
              <div className="h-48">
                {profitLoading ? (
                  <div className="h-full flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : (profitData?.monthlyData?.length ?? 0) === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Недостаточно данных для графика</div>
                ) : (
                  <ReportChart data={profitData.monthlyData} />
                )}
              </div>
            </div>
          )}

          {/* Что изменилось */}
          {widgetVisible.changes && (
            <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Что изменилось</h3>
                <div className="flex gap-1">
                  {(['today', 'week', 'month'] as ChangePeriod[]).map(p => (
                    <button key={p} onClick={() => setChangePeriod(p)}
                      className={`px-2.5 py-1 text-[11px] rounded-full border transition ${changePeriod === p ? 'bg-primary text-white border-primary' : 'hover:bg-muted'}`}>
                      {p === 'today' ? 'Сегодня' : p === 'week' ? 'Неделя' : 'Месяц'}
                    </button>
                  ))}
                </div>
              </div>
              {overviewLoading && !overviewExtra ? (
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />)}
                </div>
              ) : overviewError ? (
                <div className="text-sm text-red-500 flex items-center gap-2">Не удалось загрузить изменения. <button onClick={() => loadOverviewExtra(changePeriod)} className="underline">Повторить</button></div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
                  <ChangeTile label="Новых заявок" value={overviewExtra?.changes?.newTrips ?? 0} onClick={() => goTo('profit')} />
                  <ChangeTile label="Завершено рейсов" value={overviewExtra?.changes?.completedVehicleTrips ?? 0} onClick={() => goTo('own_fleet')} />
                  <ChangeTile label="Новых оплат" value={overviewExtra?.changes?.newPayments ?? 0} onClick={() => goTo('profit')} />
                  <ChangeTile label="Новых кассовых разрывов" value={newCashGapsCount} onClick={() => goTo('debts', { debtsSubTab: 'cashgaps' })} />
                  <ChangeTile label="Новых долгов клиентов" value={newClientDebtsCount} onClick={() => goTo('debts', { debtsSubTab: 'clients' })} />
                  <ChangeTile label="Новых долгов перевозчикам" value={newCarrierDebtsCount} onClick={() => goTo('debts', { debtsSubTab: 'carriers' })} />
                </div>
              )}
            </div>
          )}

          {/* Операционная сводка */}
          {widgetVisible.operational && (
            <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
              <h3 className="text-sm font-semibold mb-2">Операционная сводка</h3>
              {overviewLoading && !overviewExtra ? (
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
                  <StatTile label="Машин в рейсе" value={overviewExtra?.operational?.vehiclesInTrip ?? 0} />
                  <StatTile label="Машин свободно" value={overviewExtra?.operational?.vehiclesFree ?? 0} />
                  <StatTile label="Заявок в работе" value={overviewExtra?.operational?.tripsInProgress ?? 0} />
                  <StatTile label="На сверке" value={overviewExtra?.operational?.tripsSverka ?? 0} />
                  <StatTile label="Ожидают оплаты" value={overviewExtra?.operational?.tripsAwaitingPayment ?? 0} />
                  <StatTile label="Завершено сегодня" value={overviewExtra?.operational?.completedToday ?? 0} />
                </div>
              )}
            </div>
          )}

          {/* Требует внимания */}
          {widgetVisible.attention && (
            <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
              <h3 className="text-sm font-semibold mb-2">Требует внимания</h3>
              {(() => {
                const items = [
                  { key: 'gap', count: cashGapRows.length, label: 'Кассовые разрывы', amount: cashGapTotal, onClick: () => goTo('debts', { debtsSubTab: 'cashgaps' }) },
                  { key: 'overdue', count: overdueClientDebts.length, label: 'Просроченные оплаты клиентов', amount: overdueClientDebts.reduce((s: number, d: any) => s + d.remaining, 0), onClick: () => goTo('debts', { debtsSubTab: 'clients' }) },
                  { key: 'carrier', count: debtsData?.carrierDebts?.length ?? 0, label: 'Долги перевозчикам', amount: debtsData?.totalCarrierDebt ?? 0, onClick: () => goTo('debts', { debtsSubTab: 'carriers' }) },
                  { key: 'loss', count: lossRows.length, label: 'Убыточные рейсы', amount: null, onClick: () => goTo('profit') },
                  { key: 'fuel', count: overviewExtra?.fuelOverconsumption?.length ?? 0, label: 'Перерасход топлива', amount: null, onClick: () => goTo('own_fleet') },
                  { key: 'sverka', count: sverkaRows.length, label: 'Заявки на сверке', amount: sverkaRevenue, onClick: () => goTo('profit', { paymentFilter: 'all' }) },
                ];
                const active = items.filter(i => i.count > 0);
                if (debtsLoading || (overviewLoading && !overviewExtra)) {
                  return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-9 rounded-lg bg-muted/40 animate-pulse" />)}</div>;
                }
                if (debtsError) {
                  return <div className="text-sm text-red-500 flex items-center gap-2">Не удалось проверить риски. <button onClick={loadDebts} className="underline">Повторить</button></div>;
                }
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
                          {i.amount != null && <span className="ml-auto font-mono text-xs font-semibold text-red-600">{fmtAmd(i.amount)}</span>}
                        </div>
                      </ClickRow>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Последние события */}
          {widgetVisible.events && (
            <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
              <h3 className="text-sm font-semibold mb-2">Последние события</h3>
              {overviewLoading && !overviewExtra ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 rounded-lg bg-muted/40 animate-pulse" />)}</div>
              ) : overviewError ? (
                <div className="text-sm text-red-500 flex items-center gap-2">Не удалось загрузить события. <button onClick={() => loadOverviewExtra(changePeriod)} className="underline">Повторить</button></div>
              ) : (overviewExtra?.events?.length ?? 0) === 0 ? (
                <div className="text-sm text-muted-foreground">Событий ещё не было</div>
              ) : (
                <div className="space-y-0.5">
                  {overviewExtra.events.map((e: any) => (
                    <ClickRow key={e.id} onClick={() => e.tripId ? router.push(`/trips/${e.tripId}`) : router.push('/vehicle-trips')}>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                          {new Date(e.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="truncate">{e.label}</span>
                      </div>
                    </ClickRow>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Топ-5 должников + Автопарк кратко */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {widgetVisible.topDebtors && (
              <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
                <h3 className="text-sm font-semibold mb-2">Топ-5 должников</h3>
                {debtsLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 rounded-lg bg-muted/40 animate-pulse" />)}</div>
                ) : debtsError ? (
                  <div className="text-sm text-red-500 flex items-center gap-2">Не удалось загрузить список. <button onClick={loadDebts} className="underline">Повторить</button></div>
                ) : topDebtors.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Должников нет</div>
                ) : (
                  <div className="space-y-0.5">
                    {topDebtors.map((g: any, i: number) => (
                      <ClickRow key={g.client.id} onClick={() => goTo('debts', { debtsSubTab: 'clients' })}>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground text-xs w-4">{i + 1}.</span>
                          <span className="truncate flex-1">{g.client.name}</span>
                          <span className="font-mono text-xs font-semibold text-orange-600">{fmtAmd(g.totalDebt)}</span>
                        </div>
                      </ClickRow>
                    ))}
                  </div>
                )}
              </div>
            )}
            {widgetVisible.fleetSummary && (
              <ClickRow onClick={() => goTo('own_fleet')} className="!block bg-card rounded-xl p-4 shadow-sm border border-border">
                <h3 className="text-sm font-semibold mb-2">Автопарк кратко</h3>
                {ownFleetLoading ? (
                  <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-6 rounded bg-muted/40 animate-pulse" />)}</div>
                ) : (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Доход</span><span className="font-mono text-emerald-600">{fmtAmd(ownFleetRevenue)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Расход</span><span className="font-mono text-red-500">{fmtAmd(combinedTotalExpenses)}</span></div>
                    <div className="flex justify-between font-semibold"><span>Прибыль</span><span className={`font-mono ${ownFleetProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtAmd(ownFleetProfit)}</span></div>
                  </div>
                )}
              </ClickRow>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════ TAB: ПРИБЫЛЬ ══════════════════════════ */}
      {tab === 'profit' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}
              className="text-sm border rounded-lg px-3 py-2 bg-background">
              <option value="all">Все оплаты</option>
              <option value="not_paid">Не оплачено</option>
              <option value="partially_paid">Частично</option>
              <option value="paid">Оплачено</option>
            </select>
            <select value={machineFilter} onChange={e => setMachineFilter(e.target.value)}
              className="text-sm border rounded-lg px-3 py-2 bg-background">
              <option value="">Все машины</option>
              {allVehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber} · {v.brand} {v.model}</option>)}
            </select>
          </div>

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

          {profitLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : profitError ? (
            <div className="text-center py-16 text-red-500 text-sm">Не удалось загрузить данные. <button onClick={loadProfit} className="underline">Повторить</button></div>
          ) : profitRowsSorted.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{(profitData?.rows?.length ?? 0) > 0 ? 'Нет заявок для текущего фильтра' : 'Нет заявок за выбранный период'}</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                      <SortableTh label="Дата" active={sortKey === 'date'} dir={sortDir} onClick={() => toggleSort('date')} />
                      <th className="py-3 px-3">Маршрут</th>
                      <th className="py-3 px-3 hidden sm:table-cell">Клиент</th>
                      <th className="py-3 px-3">Тип</th>
                      <SortableTh label="Доход ֏" active={sortKey === 'revenue'} dir={sortDir} onClick={() => toggleSort('revenue')} align="right" />
                      <SortableTh label="Расход ֏" active={sortKey === 'expense'} dir={sortDir} onClick={() => toggleSort('expense')} align="right" />
                      <SortableTh label="Прибыль ֏" active={sortKey === 'profit'} dir={sortDir} onClick={() => toggleSort('profit')} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {profitRowsSorted.map((r: any, i: number) => {
                      const profit = calcTripProfit(r);
                      const exp = Number(r.clientRateAmd || r.clientRate || 0) - profit;
                      return (
                        <tr key={i} className="border-b hover:bg-muted/30 transition">
                          <td className="py-2.5 px-4 text-xs whitespace-nowrap">{r.date}</td>
                          <td className="py-2.5 px-3 max-w-[220px]">
                            <CrumbLink href={`/trips/${r.id}`} fromLabel="Отчёты" fromKey="reports" className="block truncate text-primary hover:underline text-xs" title={`${r.routeFrom} → ${r.routeTo}`}>{r.routeFrom} → {r.routeTo}</CrumbLink>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-muted-foreground hidden sm:table-cell">{r.client}</td>
                          <td className="py-2.5 px-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.tripTypeRaw === 'own_transport' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{r.tripType}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-xs">
                            {r.currency && r.currency !== 'AMD' ? (
                              <CurrencyAmount amount={r.clientRate} currency={r.currency} rate={r.exchangeRate} amountAmd={r.clientRateAmd || r.clientRate} variant="compact" className="items-end ml-auto" />
                            ) : fmtAmd(Number(r.clientRateAmd || r.clientRate || 0))}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs text-red-500">{fmtAmd(exp)}</td>
                          <td className={`py-2.5 px-3 text-right font-mono text-xs font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtAmd(profit)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/20 font-semibold">
                      <td colSpan={4} className="py-3 px-4 text-right text-xs">ИТОГО ({profitRowsSorted.length} заявок):</td>
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

      {/* ══════════════════════════ TAB: АВТОПАРК ══════════════════════════ */}
      {tab === 'own_fleet' && (
        <div className="space-y-4">
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

            {/* Топливо: литры и л/100км — раньше были только в Excel */}
            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Топливо (по данным Wialon):</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-amber-600 mb-0.5">Расход, л</p>
                  <p className="text-sm font-bold font-mono text-foreground">{vtProfitLoading ? '...' : (fuelSummary?.liters != null ? fuelSummary.liters.toLocaleString('ru-RU') : '—')}</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-amber-600 mb-0.5">л/100км</p>
                  <p className="text-sm font-bold font-mono text-foreground">{vtProfitLoading ? '...' : (fuelSummary?.per100Km != null ? fuelSummary.per100Km : '—')}</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-amber-600 mb-0.5">Стоимость</p>
                  <p className="text-sm font-bold font-mono text-foreground">{vtProfitLoading ? '...' : fmtAmd(vtDirectFuel)}</p>
                </div>
              </div>
            </div>

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

            <div className="border-t pt-3">
              <p className="text-[11px] text-muted-foreground">
                Формула: <span className="font-mono">Чистая прибыль = Доход (заявки) − Расходы рейсов (зп + суточные + топливо + прочие) − Доп. расходы автопарка</span>
              </p>
            </div>
          </div>

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
                        <td className="py-2 px-3 max-w-[220px]"><CrumbLink href={`/trips/${r.id}`} fromLabel="Отчёты" fromKey="reports" className="block truncate text-primary hover:underline text-xs" title={`${r.routeFrom} → ${r.routeTo}`}>{r.routeFrom} → {r.routeTo}</CrumbLink></td>
                        <td className="py-2 px-3 text-xs text-muted-foreground hidden sm:table-cell">{r.client}</td>
                        <td className="py-2 px-3 text-right text-xs">
                          {r.currency && r.currency !== 'AMD' ? (
                            <CurrencyAmount amount={r.clientRate} currency={r.currency} rate={r.exchangeRate} amountAmd={r.clientRateAmd || r.clientRate} variant="compact" className="items-end ml-auto" />
                          ) : fmtAmd(Number(r.clientRateAmd || r.clientRate || 0))}
                        </td>
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
                        <td className="py-2 px-3 text-right text-xs">
                          {fe.currency && fe.currency !== 'AMD' ? (
                            <CurrencyAmount amount={fe.amount} currency={fe.currency} rate={fe.exchangeRate} amountAmd={fe.amountAmd} variant="compact" className="items-end ml-auto" />
                          ) : fmtAmd(Number(fe.amountAmd))}
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground hidden md:table-cell max-w-[200px] truncate">{fe.comment || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/20 font-semibold">
                      <td colSpan={3} className="py-2.5 px-4 text-right text-xs">ИТОГО:</td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-red-500">{fmtAmd(fleetTotalExpenses)}</td>
                      <td className="hidden md:table-cell"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════ TAB: ДОЛГИ И РАЗРЫВЫ ══════════════════════════ */}
      {tab === 'debts' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'all', label: 'Все' },
              { key: 'clients', label: 'Клиенты' },
              { key: 'carriers', label: 'Перевозчики' },
              { key: 'cashgaps', label: 'Кассовые разрывы' },
            ] as { key: DebtsSubTab; label: string }[]).map(s => (
              <button key={s.key} onClick={() => setDebtsSubTab(s.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${debtsSubTab === s.key ? 'bg-primary text-white border-primary' : 'hover:bg-muted'}`}>
                {s.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card rounded-xl p-4 shadow-sm border-l-4 border-orange-500">
              <p className="text-xs text-muted-foreground mb-1">Долг клиентов</p>
              <p className="text-lg font-bold font-mono text-orange-600">{debtsLoading ? '...' : fmtAmd(debtsData?.totalClientDebt ?? 0)}</p>
            </div>
            <div className="bg-card rounded-xl p-4 shadow-sm border-l-4 border-orange-500">
              <p className="text-xs text-muted-foreground mb-1">Долг перевозчикам</p>
              <p className="text-lg font-bold font-mono text-orange-600">{debtsLoading ? '...' : fmtAmd(debtsData?.totalCarrierDebt ?? 0)}</p>
            </div>
            <div className="bg-card rounded-xl p-4 shadow-sm border-l-4 border-red-500">
              <p className="text-xs text-muted-foreground mb-1">Кассовый разрыв</p>
              <p className="text-lg font-bold font-mono text-red-600">{debtsLoading ? '...' : fmtAmd(allCashGapTrips.reduce((s: number, d: any) => s + d.cashGap, 0))}</p>
            </div>
          </div>

          {debtsLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : debtsError ? (
            <div className="text-center py-16 text-red-500 text-sm">Не удалось загрузить долги. <button onClick={loadDebts} className="underline">Повторить</button></div>
          ) : (
            <>
              {(debtsSubTab === 'all' || debtsSubTab === 'cashgaps') && (
                <div className="bg-card rounded-xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/20">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Кассовые разрывы ({allCashGapTrips.length})</h4>
                  </div>
                  {allCashGapTrips.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">Кассовых разрывов нет — всё в порядке</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                          <th className="py-2.5 px-4">Дата</th><th className="py-2.5 px-3">Заявка</th><th className="py-2.5 px-3">Клиент</th>
                          <th className="py-2.5 px-3 text-right">Ставка клиента</th><th className="py-2.5 px-3 text-right">Оплата перевозчику</th>
                          <th className="py-2.5 px-3 text-right">Разрыв ֏</th>
                        </tr></thead>
                        <tbody>
                          {allCashGapTrips.map((d: any) => {
                            const carrierCur = d.carrierCurrency || 'AMD';
                            const carrierPaidAmd = d.carrierPaidAmd ?? 0;
                            const carrierPaidOriginal = carrierCur !== 'AMD' && d.carrierExchangeRate ? carrierPaidAmd / d.carrierExchangeRate : carrierPaidAmd;
                            return (
                              <tr key={d.id} className="border-b hover:bg-muted/30 transition">
                                <td className="py-2 px-4 text-xs whitespace-nowrap">{formatDate(d.tripDate)}</td>
                                <td className="py-2 px-3 text-xs"><CrumbLink href={`/trips/${d.id}`} fromLabel="Отчёты" fromKey="reports" className="text-primary hover:underline">{d.tripNumber}</CrumbLink></td>
                                <td className="py-2 px-3 text-xs">{d.clientName}</td>
                                <td className="py-2 px-3 text-right text-xs">
                                  {d.currency && d.currency !== 'AMD' ? (
                                    <CurrencyAmount amount={d.rate} currency={d.currency} rate={d.exchangeRate} amountAmd={d.rateAmd} variant="compact" className="items-end ml-auto" />
                                  ) : fmtAmd(d.rateAmd)}
                                </td>
                                <td className="py-2 px-3 text-right text-xs">
                                  {carrierCur !== 'AMD' ? (
                                    <CurrencyAmount amount={carrierPaidOriginal} currency={carrierCur} rate={d.carrierExchangeRate} amountAmd={carrierPaidAmd} variant="compact" className="items-end ml-auto" />
                                  ) : fmtAmd(carrierPaidAmd)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-red-600">{fmtAmd(d.cashGap)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {(debtsSubTab === 'all' || debtsSubTab === 'clients') && (
                <div className="bg-card rounded-xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/20">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Долги клиентов, по клиенту ({(debtsData?.grouped ?? []).length})</h4>
                  </div>
                  {(debtsData?.grouped ?? []).length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">Долгов клиентов нет</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                          <th className="py-2.5 px-4">Клиент</th><th className="py-2.5 px-3 text-right">Заявок</th><th className="py-2.5 px-3 text-right">Долг ֏</th>
                        </tr></thead>
                        <tbody>
                          {(debtsData?.grouped ?? []).map((g: any) => (
                            <tr key={g.client.id} className="border-b hover:bg-muted/30 transition">
                              <td className="py-2 px-4 text-xs">{g.client.name}</td>
                              <td className="py-2 px-3 text-right text-xs">{g.trips.length}</td>
                              <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-orange-600">{fmtAmd(g.totalDebt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {(debtsSubTab === 'all' || debtsSubTab === 'carriers') && (
                <div className="bg-card rounded-xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/20">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Долги перевозчикам, по перевозчику ({(debtsData?.groupedCarrier ?? []).length})</h4>
                  </div>
                  {(debtsData?.groupedCarrier ?? []).length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">Долгов перевозчикам нет</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                          <th className="py-2.5 px-4">Перевозчик</th><th className="py-2.5 px-3 text-right">Заявок</th><th className="py-2.5 px-3 text-right">Долг ֏</th>
                        </tr></thead>
                        <tbody>
                          {(debtsData?.groupedCarrier ?? []).map((g: any) => (
                            <tr key={g.carrier.id} className="border-b hover:bg-muted/30 transition">
                              <td className="py-2 px-4 text-xs">{g.carrier.name}</td>
                              <td className="py-2 px-3 text-right text-xs">{g.trips.length}</td>
                              <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-orange-600">{fmtAmd(g.totalDebt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SearchGroup({ title, children }: { title: string; children: any }) {
  const flat = (Array.isArray(children) ? children : [children]).flat(2).filter(Boolean);
  if (flat.length === 0) return null;
  return (
    <div className="border-b last:border-b-0">
      <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{title}</p>
      {flat}
    </div>
  );
}

function ChangeTile({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="text-left bg-muted/30 hover:bg-muted/60 transition rounded-lg px-3 py-2.5 cursor-pointer">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-base font-bold font-mono">{value}</p>
    </button>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/30 rounded-lg px-3 py-2.5">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-base font-bold font-mono">{value}</p>
    </div>
  );
}

function SortableTh({ label, active, dir, onClick, align }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void; align?: 'right' }) {
  return (
    <th className={`py-3 px-3 ${align === 'right' ? 'text-right' : ''}`}>
      <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 hover:text-foreground transition ${active ? 'text-foreground font-semibold' : ''}`}>
        {label}{active && <span className="text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  );
}
