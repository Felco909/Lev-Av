'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowDownRight, ArrowUpRight, AlertTriangle, TrendingUp, TrendingDown,
  Download, Clock, ShieldAlert, Truck, Search, RefreshCw, Bell,
  ChevronRight, CheckCircle2, Loader2, Percent, FileWarning, Sparkles,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import ReportChart from '../reports/_components/report-chart';

const FleetMap = dynamic(() => import('../telematics/monitoring/_components/fleet-map'), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Загрузка карты…</div>,
});

/* ══════════════════════════ Types ══════════════════════════ */
interface KPI { totalClientDebt: number; totalCarrierDebt: number; totalProfit: number; totalCashGap: number; }
interface DebtRow { id: string; tripNumber: string; clientName?: string; carrierName?: string; clientId?: string; rate: number; paid: number; remaining: number; }
interface ProfitRow { id: string; tripNumber: string; clientName: string; income: number; expense: number; profit: number; }
interface ProblemRow { id: string; tripNumber: string; clientName: string; carrierName: string; clientPaid: number; carrierPaid: number; diff: number; }
interface TopDebtor { clientId: string; clientName: string; totalDebt: number; tripCount: number; }
interface Reminder { id: string; tripNumber: string; clientName?: string; carrierName?: string; amount?: number; paymentDueDate?: string; daysLeft?: number; }
interface ExpiringDoc { id: string; docName: string; entityName: string; expiryDate: string; daysLeft: number; docType: string; }
interface IdleVehicle { vehicleId: string; plateNumber: string; daysIdle: number; }
interface StuckTrip { vehicleTripId: string; plateNumber: string; tripNumber: string; daysOpen: number; }
interface OperationalSummary { vehiclesInTrip: number; vehiclesFree: number; totalActiveVehicles: number; tripsInProgress: number; tripsSverka: number; tripsAwaitingPayment: number; completedToday: number; }

interface DashData {
  kpi: KPI;
  prevKpi: KPI | null;
  totals: { totalIncome: number; totalExpense: number };
  topDebtors: TopDebtor[];
  clientDebts: DebtRow[];
  carrierDebts: DebtRow[];
  profitRows: ProfitRow[];
  problemRows: ProblemRow[];
  reminders: { overduePayments: Reminder[]; paymentDueTrips: Reminder[]; carrierOverduePayments?: Reminder[]; carrierPaymentDueTrips?: Reminder[]; };
  expiringDocs: ExpiringDoc[];
  clients: { id: string; name: string }[];
  ownFleet?: { revenue: number; expenses: number; profit: number; breakdown: { salary: number; perDiem: number; fuel: number; other: number }; tripCount: number; vtCount: number; };
  commandCenter: { attention: { noInvoiceActTrips: any[]; noAttachmentTrips: any[] }; idleVehicles: IdleVehicle[]; stuckVehicleTrips: StuckTrip[] };
  operational: OperationalSummary;
  lastWialonSyncAt: string | null;
}

type Mode = 'director' | 'finance' | 'logist';
type Tab = 'clients' | 'vehicles' | 'drivers' | 'carriers';

const MODE_LABELS: Record<Mode, string> = { director: 'Директор', finance: 'Финансы', logist: 'Логист' };

// Виджеты, скрываемые в каждом режиме (Setting-подход, тот же, что уже принят для «Отчётов»).
const MODE_HIDDEN: Record<Mode, string[]> = {
  director: [],
  finance: ['online-map', 'fleet-gauges', 'heatmap-fleet', 'calendar-docs'],
  logist: ['finance-center', 'ai-insights'],
};

function ymd(d: Date): string {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const fmt = formatCurrency;

/* ══════════════════════════ Small building blocks ══════════════════════════ */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (!points || points.length < 2) return <div className="h-5" />;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const step = 100 / (points.length - 1);
  const coords = points.map((p, i) => `${i * step},${26 - ((p - min) / range) * 24 - 1}`).join(' ');
  return (
    <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="w-full h-5">
      <polyline points={coords} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}

function HideWidgetBtn({ onHide }: { onHide: () => void }) {
  return <button onClick={onHide} title="Скрыть виджет" className="text-[10px] text-muted-foreground hover:text-foreground ml-auto px-1">✕</button>;
}

function DQDot({ state }: { state: 'ok' | 'loading' | 'error' }) {
  const cls = state === 'ok' ? 'bg-emerald-500' : state === 'loading' ? 'bg-amber-500 animate-pulse' : 'bg-red-500';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${cls}`} title={state === 'ok' ? 'Данные актуальны' : state === 'loading' ? 'Обновляется' : 'Ошибка получения данных'} />;
}

function KpiCard({ label, value, icon: Icon, colorClass, borderClass, trendPct, sparkPoints, sparkColor, onClick }: any) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left bg-card rounded-xl p-3.5 shadow-sm border-l-4 ${borderClass} hover:shadow-md hover:-translate-y-0.5 transition focus-visible:ring-2 focus-visible:ring-primary/40 outline-none group relative`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-muted-foreground">{label}</span>
        <Icon className={`w-4 h-4 ${colorClass}`} />
      </div>
      <p className={`text-base font-bold font-mono ${colorClass}`}>{value}</p>
      {trendPct != null && (
        <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-1 ${trendPct >= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'}`}>
          {trendPct >= 0 ? '▲' : '▼'} {Math.abs(trendPct).toFixed(0)}%
        </span>
      )}
      {sparkPoints && <Sparkline points={sparkPoints} color={sparkColor} />}
      <ChevronRight className="w-3.5 h-3.5 absolute right-2.5 bottom-2.5 text-muted-foreground opacity-0 group-hover:opacity-60 transition" />
    </button>
  );
}

type Severity = 'crit' | 'high' | 'med' | 'info';
interface RiskItem { key: string; severity: Severity; icon: any; title: string; sub: string; impact?: string; owner: string; amount?: number; onClick: () => void; }

const SEV_ORDER: Record<Severity, number> = { crit: 0, high: 1, med: 2, info: 3 };
const SEV_LABEL: Record<Severity, string> = { crit: '🔴 Критический', high: '🟠 Высокий приоритет', med: '🟡 Средний приоритет', info: '🟢 Информационный' };
const SEV_BORDER: Record<Severity, string> = { crit: 'border-red-600', high: 'border-red-400', med: 'border-amber-400', info: 'border-blue-400' };
const SEV_ICON_BG: Record<Severity, string> = {
  crit: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
  high: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400',
  med: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
};

function RiskRow({ r }: { r: RiskItem }) {
  return (
    <button type="button" onClick={r.onClick}
      className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg border-l-2 ${SEV_BORDER[r.severity]} hover:bg-muted/50 transition group`}>
      <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${SEV_ICON_BG[r.severity]}`}><r.icon className="w-3.5 h-3.5" /></span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate">{r.title}</p>
        <p className="text-[10px] text-muted-foreground truncate">{r.sub}</p>
        {r.impact && <p className="text-[9.5px] text-muted-foreground italic truncate">влияние: {r.impact}</p>}
      </div>
      <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full whitespace-nowrap hidden sm:inline">{r.owner}</span>
      {r.amount != null && <span className="text-xs font-mono font-bold text-red-600 whitespace-nowrap">{fmt(r.amount)}</span>}
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-60 transition shrink-0" />
    </button>
  );
}

function GaugeRing({ value, max, label, unit, color }: { value: number; max: number; label: string; unit?: string; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="text-center">
      <div className="w-16 h-16 rounded-full mx-auto relative flex items-center justify-center"
        style={{ background: `conic-gradient(${color} 0 ${pct}%, var(--muted, #E7EBF2) ${pct}% 100%)` }}>
        <div className="absolute inset-[7px] rounded-full bg-card flex items-center justify-center">
          <span className="text-[11px] font-mono font-bold">{Math.round(value)}{unit}</span>
        </div>
      </div>
      <p className="text-[9.5px] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

/* ══════════════════════════ Main page ══════════════════════════ */
export default function DashboardPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('director');
  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');

  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [auditData, setAuditData] = useState<any>(null);
  const [auditState, setAuditState] = useState<'loading' | 'ok' | 'error'>('loading');

  const [expandRisks, setExpandRisks] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // ── период по умолчанию: этот месяц (нужен для prevKpi-тренда) ──
  useEffect(() => {
    const now = new Date();
    const from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    const to = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    setDateFrom(from); setDateTo(to); setAppliedFrom(from); setAppliedTo(to);
  }, []);

  // ── настройка/режим — тот же паттерн Setting, что и в «Отчётах» ──
  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => setUserEmail(s?.user?.email ?? null)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!userEmail) return;
    fetch('/api/settings').then(r => r.json()).then(map => {
      const raw = map?.[`dashboard_mode:${userEmail}`];
      if (raw) { try { setMode(JSON.parse(raw)); } catch {} }
      const rawHidden = map?.[`dashboard_widgets:${userEmail}`];
      if (rawHidden) { try { setHiddenWidgets(JSON.parse(rawHidden)); } catch {} }
    }).catch(() => {});
  }, [userEmail]);
  const applyMode = (m: Mode) => {
    setMode(m);
    if (userEmail) fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: `dashboard_mode:${userEmail}`, value: JSON.stringify(m) }) }).catch(() => {});
  };
  const toggleWidget = (id: string) => {
    const next = hiddenWidgets.includes(id) ? hiddenWidgets.filter(w => w !== id) : [...hiddenWidgets, id];
    setHiddenWidgets(next);
    if (userEmail) fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: `dashboard_widgets:${userEmail}`, value: JSON.stringify(next) }) }).catch(() => {});
  };
  const modeHidden = MODE_HIDDEN[mode];
  const isHidden = (id: string) => hiddenWidgets.includes(id) || modeHidden.includes(id);

  // ── первый экран: 1 запрос /api/dashboard (KPI + Status Bar + Command Center источники) ──
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const params = new URLSearchParams({ dateFrom: appliedFrom, dateTo: appliedTo });
      const res = await fetch(`/api/dashboard?${params}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
      setLastUpdatedAt(new Date());
    } catch { setError(true); } finally { setLoading(false); }
  }, [appliedFrom, appliedTo]);

  useEffect(() => { if (appliedFrom && appliedTo) load(); }, [appliedFrom, appliedTo, load]);

  // Finance Audit — отдельный параллельный запрос (не блокирует первый экран, тяжелее по расчёту).
  const loadAudit = useCallback(() => {
    setAuditState('loading');
    fetch('/api/finance/audit').then(r => r.json()).then(d => { setAuditData(d); setAuditState('ok'); }).catch(() => setAuditState('error'));
  }, []);
  useEffect(() => { loadAudit(); }, [loadAudit]);

  const refreshAll = async () => { setRefreshing(true); await Promise.all([load(), Promise.resolve(loadAudit())]); setRefreshing(false); };

  // ── Финансовый центр (area chart) + Топ клиентов — лениво, 1 запрос, широкое окно (6 мес.) ──
  const [financeData, setFinanceData] = useState<any>(null);
  const [financeState, setFinanceState] = useState<'loading' | 'ok' | 'error'>('loading');
  const loadFinance = useCallback(() => {
    setFinanceState('loading');
    const now = new Date();
    const from = ymd(new Date(now.getFullYear(), now.getMonth() - 5, 1));
    const to = ymd(now);
    fetch(`/api/reports/trips?dateFrom=${from}&dateTo=${to}`).then(r => r.json()).then(d => { setFinanceData(d); setFinanceState('ok'); }).catch(() => setFinanceState('error'));
  }, []);
  useEffect(() => { loadFinance(); }, [loadFinance]);

  // ── Онлайн-карта — лениво, через intersection observer ──
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [mapVehicles, setMapVehicles] = useState<any[]>([]);
  const [mapState, setMapState] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => {
    if (mapVisible) return;
    const el = mapRef.current; if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) { setMapVisible(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [data, mapVisible]);
  useEffect(() => {
    if (!mapVisible) return;
    const load = () => fetch('/api/wialon/fleet-snapshot').then(r => r.json()).then(d => { setMapVehicles(d.vehicles ?? []); setMapState('ok'); }).catch(() => setMapState('error'));
    load();
    const t = setInterval(load, 90000);
    return () => clearInterval(t);
  }, [mapVisible]);

  // ── Timeline — лениво ──
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [timelineState, setTimelineState] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => {
    fetch('/api/reports/overview?changePeriod=week&eventsLimit=10').then(r => r.json()).then(d => { setTimelineEvents(d.events ?? []); setTimelineState('ok'); }).catch(() => setTimelineState('error'));
  }, []);

  // ── Календарь — лениво ──
  const [calDays, setCalDays] = useState<any[]>([]);
  const [calState, setCalState] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    fetch(`/api/trips/calendar?month=${month}`).then(r => r.json()).then(d => { setCalDays(Array.isArray(d) ? d : (d.days ?? [])); setCalState('ok'); }).catch(() => setCalState('error'));
  }, []);

  // ── Heatmap — лениво ──
  const heatRef = useRef<HTMLDivElement>(null);
  const [heatVisible, setHeatVisible] = useState(false);
  const [heatData, setHeatData] = useState<any>(null);
  const [heatState, setHeatState] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => {
    if (heatVisible) return;
    const el = heatRef.current; if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) { setHeatVisible(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [data, heatVisible]);
  useEffect(() => {
    if (!heatVisible) return;
    fetch('/api/reports/fleet-heatmap').then(r => r.json()).then(d => { setHeatData(d); setHeatState('ok'); }).catch(() => setHeatState('error'));
  }, [heatVisible]);

  // ── Рейтинги — по табу ──
  const [rankTab, setRankTab] = useState<Tab>('clients');
  const [rankCache, setRankCache] = useState<Record<Tab, any>>({ clients: null, vehicles: null, drivers: null, carriers: null });
  const [rankState, setRankState] = useState<Record<Tab, 'loading' | 'ok' | 'error'>>({ clients: 'loading', vehicles: 'loading', drivers: 'loading', carriers: 'loading' });
  const loadRankTab = useCallback((t: Tab) => {
    if (rankCache[t]) return;
    setRankState(s => ({ ...s, [t]: 'loading' }));
    const urls: Record<Tab, string> = {
      clients: `/api/reports/trips?dateFrom=${appliedFrom}&dateTo=${appliedTo}`,
      vehicles: '/api/vehicle-analytics',
      drivers: '/api/driver-analytics',
      carriers: `/api/reports/carrier-ranking?dateFrom=${appliedFrom}&dateTo=${appliedTo}`,
    };
    fetch(urls[t]).then(r => r.json()).then(d => { setRankCache(c => ({ ...c, [t]: d })); setRankState(s => ({ ...s, [t]: 'ok' })); }).catch(() => setRankState(s => ({ ...s, [t]: 'error' })));
  }, [rankCache, appliedFrom, appliedTo]);
  useEffect(() => { loadRankTab('clients'); }, []); // eslint-disable-line
  useEffect(() => { loadRankTab(rankTab); }, [rankTab, loadRankTab]);

  const applyFilters = () => { setAppliedFrom(dateFrom); setAppliedTo(dateTo); };

  const handleDownloadXLSX = async () => {
    const params = new URLSearchParams({ dateFrom: appliedFrom, dateTo: appliedTo });
    const res = await fetch(`/api/dashboard/xlsx?${params}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `dashboard_${ymd(new Date())}.xlsx`; a.click(); URL.revokeObjectURL(url);
  };
  const handleDownloadPDF = async () => {
    const params = new URLSearchParams({ dateFrom: appliedFrom, dateTo: appliedTo });
    const res = await fetch(`/api/dashboard/pdf?${params}`);
    if (!res.ok) return;
    const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `dashboard_${ymd(new Date())}.pdf`; a.click(); URL.revokeObjectURL(url);
  };

  /* ══════ Derived: KPI trend ══════ */
  const kpi = data?.kpi; const prevKpi = data?.prevKpi;
  const income = data?.totals?.totalIncome ?? 0;
  const expense = data?.totals?.totalExpense ?? 0;
  const profit = kpi?.totalProfit ?? 0;
  const margin = income > 0 ? (profit / income) * 100 : 0;
  const trendPct = (cur: number, prevVal: number | undefined | null) => {
    if (prevVal == null) return null;
    if (prevVal === 0) return cur === 0 ? 0 : null;
    return ((cur - prevVal) / Math.abs(prevVal)) * 100;
  };
  const sparkFor = (key: 'own' | 'exp' | 'revenue' | 'costs' | 'profit') => {
    const md = financeData?.monthlyData as any[] | undefined;
    if (!md || md.length < 2) return undefined;
    if (key === 'profit') return md.map(m => (m.own ?? 0) + (m.exp ?? 0));
    return md.map(m => m[key] ?? 0);
  };

  /* ══════ Derived: Command Center risks ══════ */
  const risks: RiskItem[] = useMemo(() => {
    if (!data) return [];
    const list: RiskItem[] = [];
    const overdueClient = data.reminders?.overduePayments ?? [];
    const overdueCarrier = data.reminders?.carrierOverduePayments ?? [];
    const cashGapTotal = (data.problemRows ?? []).reduce((s, r) => s + r.diff, 0);

    if (auditState === 'ok' && auditData?.summary?.hasConflicts) {
      list.push({ key: 'audit', severity: 'crit', icon: AlertTriangle, title: 'Finance Audit — конфликт расчётов',
        sub: `${auditData.summary.tripConflictCount} расхождение(й) · обнаружено сегодня`, impact: 'сумма долга в отчётах может быть неверной',
        owner: 'бухгалтер', onClick: () => router.push('/debts') });
    }
    if (cashGapTotal > 3_000_000) {
      list.push({ key: 'gap-crit', severity: 'crit', icon: AlertTriangle, title: 'Крупный кассовый разрыв', sub: `${data.problemRows.length} заявок`, impact: 'перевозчику уже оплачено, деньги не вернулись', owner: 'директор', amount: cashGapTotal, onClick: () => router.push('/debts') });
    } else if (cashGapTotal > 0) {
      list.push({ key: 'gap', severity: 'high', icon: AlertTriangle, title: 'Кассовые разрывы', sub: `${data.problemRows.length} заявок`, impact: 'перевозчику уже оплачено, деньги не вернулись', owner: 'директор', amount: cashGapTotal, onClick: () => router.push('/debts') });
    }
    if (overdueClient.length > 0) {
      list.push({ key: 'overdue-client', severity: 'high', icon: Clock, title: 'Просроченные оплаты клиентов', sub: `${overdueClient.length} заявок`, impact: 'риск невозврата растёт со временем', owner: 'бухгалтер', amount: overdueClient.reduce((s, r) => s + (r.amount ?? 0), 0), onClick: () => router.push('/debts') });
    }
    if (overdueCarrier.length > 0) {
      list.push({ key: 'overdue-carrier', severity: 'high', icon: Clock, title: 'Просроченные выплаты перевозчикам', sub: `${overdueCarrier.length} заявок`, owner: 'бухгалтер', amount: overdueCarrier.reduce((s, r) => s + (r.amount ?? 0), 0), onClick: () => router.push('/debts') });
    }
    const noInvoice = data.commandCenter?.attention?.noInvoiceActTrips ?? [];
    if (noInvoice.length > 0) {
      list.push({ key: 'no-invoice', severity: 'med', icon: FileWarning, title: 'Заявки без счёта/акта', sub: `${noInvoice.length} заявок`, impact: 'задерживает получение оплаты', owner: 'логист', onClick: () => noInvoice[0] && router.push(`/trips/${noInvoice[0].id}`) });
    }
    const noAttach = data.commandCenter?.attention?.noAttachmentTrips ?? [];
    if (noAttach.length > 0) {
      list.push({ key: 'no-attach', severity: 'med', icon: FileWarning, title: 'Заявки без вложений', sub: `${noAttach.length} заявок`, owner: 'логист', onClick: () => noAttach[0] && router.push(`/trips/${noAttach[0].id}`) });
    }
    const docs = data.expiringDocs ?? [];
    const insurance = docs.filter(d => d.docType === 'osago' || d.docType === 'kasko');
    const permits = docs.filter(d => d.docType === 'license' || d.docType === 'permit');
    const inspections = docs.filter(d => d.docType === 'techosmotr');
    if (insurance.length > 0) list.push({ key: 'ins', severity: 'med', icon: ShieldAlert, title: 'Истекающие страховки', sub: `${insurance.length} машин · ближайшая через ${Math.min(...insurance.map(d => d.daysLeft))} дн.`, owner: 'автопарк', onClick: () => router.push('/expiry') });
    if (permits.length > 0) list.push({ key: 'perm', severity: 'med', icon: ShieldAlert, title: 'Истекающие разрешения/лицензии', sub: `${permits.length} · ближайшее через ${Math.min(...permits.map(d => d.daysLeft))} дн.`, owner: 'автопарк', onClick: () => router.push('/expiry') });
    if (inspections.length > 0) list.push({ key: 'techo', severity: 'info', icon: ShieldAlert, title: 'Истекающие техосмотры', sub: `${inspections.length} · ближайший через ${Math.min(...inspections.map(d => d.daysLeft))} дн.`, owner: 'автопарк', onClick: () => router.push('/expiry') });

    const idle = data.commandCenter?.idleVehicles ?? [];
    if (idle.length > 0) list.push({ key: 'idle', severity: 'info', icon: Truck, title: 'Длительный простой машин', sub: `${idle.length} машин · дольше всех — ${idle[0].plateNumber} (${idle[0].daysIdle} дн.)`, owner: 'логист', onClick: () => router.push('/vehicle-trips') });
    const stuck = data.commandCenter?.stuckVehicleTrips ?? [];
    if (stuck.length > 0) list.push({ key: 'stuck', severity: 'info', icon: Truck, title: 'Аномально долгие рейсы', sub: `${stuck.length} · открыт дольше всех — ${stuck[0].tripNumber} (${stuck[0].daysOpen} дн.)`, owner: 'логист', onClick: () => router.push('/vehicle-trips') });

    if (data.lastWialonSyncAt) {
      const minsAgo = Math.floor((Date.now() - new Date(data.lastWialonSyncAt).getTime()) / 60000);
      if (minsAgo > 30) list.push({ key: 'wialon', severity: 'info', icon: AlertTriangle, title: 'Wialon: давно нет синхронизации', sub: `последняя ${minsAgo} мин назад`, owner: 'автопарк/IT', onClick: () => router.push('/telematics/monitoring') });
    }

    return list.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  }, [data, auditData, auditState, router]);

  const visibleRisks = expandRisks ? risks : risks.slice(0, 5);

  /* ══════ AI Insights (текстовые правила, без новых расчётов) ══════ */
  const insights = useMemo(() => {
    if (!data) return [];
    const out: { icon: any; text: React.ReactNode; src: string }[] = [];
    const pTrend = trendPct(profit, prevKpi?.totalProfit);
    if (pTrend != null && Math.abs(pTrend) > 5) {
      out.push({ icon: pTrend >= 0 ? TrendingUp : TrendingDown, text: <>Прибыль {pTrend >= 0 ? 'выросла' : 'снизилась'} на <b>{Math.abs(pTrend).toFixed(0)}%</b> к прошлому периоду</>, src: 'kpi.totalProfit vs prevKpi' });
    }
    if (prevKpi && kpi && kpi.totalClientDebt > prevKpi.totalClientDebt) {
      out.push({ icon: AlertTriangle, text: <>Дебиторская задолженность <b>увеличилась</b> относительно прошлого периода</>, src: 'kpi.totalClientDebt vs prevKpi' });
    }
    const idle = data.commandCenter?.idleVehicles ?? [];
    if (idle.length > 0) out.push({ icon: Truck, text: <>Простаивает <b>{idle.length} {idle.length === 1 ? 'машина' : 'машин(ы)'}</b> без рейса — проверьте причину</>, src: 'commandCenter.idleVehicles' });
    const loss = (data.profitRows ?? []).filter(r => r.profit < 0);
    if (loss.length > 0) out.push({ icon: TrendingDown, text: <>Обнаружены <b>{loss.length} убыточных {loss.length === 1 ? 'рейс' : 'рейса'}</b> за период</>, src: 'profitRows < 0' });
    const noInvoice = data.commandCenter?.attention?.noInvoiceActTrips ?? [];
    if (noInvoice.length > 0) out.push({ icon: FileWarning, text: <><b>Рекомендуется выставить счета</b> — {noInvoice.length} укомплектованных заявок без документов</>, src: 'commandCenter.attention' });
    return out.slice(0, 5);
  }, [data, prevKpi, kpi, profit]);

  /* ══════ Status bar derived ══════ */
  const op = data?.operational;
  const openTasks = risks.length;
  const isHealthy = !risks.some(r => r.severity === 'crit');
  const expectedIncome = (data?.reminders?.paymentDueTrips ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  const overdueTotal = (data?.reminders?.overduePayments ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  const wialonAgoMin = data?.lastWialonSyncAt ? Math.floor((Date.now() - new Date(data.lastWialonSyncAt).getTime()) / 60000) : null;

  /* ══════ Rankings derived rows ══════ */
  const rankRows = useMemo(() => {
    const d = rankCache[rankTab];
    if (!d) return [];
    if (rankTab === 'clients') return (d.topClients ?? []).map((c: any) => ({ name: c.name, profit: c.profit, sub: `${c.trips} рейсов` }));
    if (rankTab === 'vehicles') return (Array.isArray(d) ? d : []).map((v: any) => ({ name: v.vehicle?.plateNumber, profit: v.profit, sub: `${v.tripsCount} рейсов · ${fmt(v.profitPerKm)}/км` }));
    if (rankTab === 'drivers') return (Array.isArray(d) ? d : []).map((dr: any) => ({ name: dr.driver?.fullName ?? dr.fullName, profit: dr.totalProfit, sub: `${dr.totalTrips ?? ''}` }));
    if (rankTab === 'carriers') return (d.ranking ?? []).map((c: any) => ({ name: c.carrierName, profit: c.profit, sub: `${c.trips} рейсов` }));
    return [];
  }, [rankCache, rankTab]);
  const rankMax = Math.max(1, ...rankRows.map((r: any) => Math.abs(r.profit || 0)));

  /* ══════ Search ══════ */
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchDebounce = useRef<any>(null);
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (searchQuery.trim().length < 2) { setSearchResults(null); return; }
    searchDebounce.current = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`).then(r => r.json()).then(setSearchResults).catch(() => {});
    }, 300);
  }, [searchQuery]);

  const notifItems = useMemo(() => {
    const items: { icon: any; text: string; color: string }[] = [];
    for (const e of timelineEvents.slice(0, 6)) items.push({ icon: Bell, text: e.label, color: 'text-blue-500' });
    return items;
  }, [timelineEvents]);

  if (loading && !data) {
    return <div className="space-y-4">{[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}</div>;
  }
  if (error && !data) {
    return <div className="text-center py-20 text-red-500 text-sm">Не удалось загрузить Dashboard. <button onClick={load} className="underline">Повторить</button></div>;
  }

  return (
    <div className="space-y-4">
      {/* ═══ Header ═══ */}
      <div className="bg-card rounded-xl border p-2.5 shadow-sm flex items-center gap-3 flex-wrap">
        <span className="font-display font-bold text-primary text-sm whitespace-nowrap px-1">LEV&AV TMS</span>
        <div className="relative flex-1 min-w-[160px]">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/50 text-xs text-muted-foreground">
            <Search className="w-3.5 h-3.5 shrink-0" />
            <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)}
              placeholder="Заявка, счёт, клиент, машина, водитель, телефон…" className="bg-transparent outline-none w-full" />
          </div>
          {searchOpen && searchQuery.trim().length >= 2 && searchResults && (
            <div className="absolute z-20 mt-1 w-full sm:w-96 bg-card border rounded-xl shadow-lg max-h-80 overflow-y-auto text-xs">
              {['trips', 'vehicles', 'drivers', 'clients', 'carriers'].map(k => (searchResults[k] ?? []).length > 0 && (
                <div key={k} className="border-b last:border-b-0 py-1">
                  {(searchResults[k] as any[]).map((item: any) => (
                    <button key={item.id} onClick={() => { setSearchOpen(false); setSearchQuery(''); router.push(k === 'trips' ? `/trips/${item.id}` : k === 'vehicles' ? '/vehicles' : k === 'drivers' ? '/drivers' : k === 'clients' ? '/clients' : '/carriers'); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-muted/50">
                      {item.tripNumber ?? item.plateNumber ?? item.fullName ?? item.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
          {(['director', 'finance', 'logist'] as Mode[]).map(m => (
            <button key={m} onClick={() => applyMode(m)} className={`text-[10.5px] px-2 py-1 rounded-md transition ${mode === m ? 'bg-primary text-white font-semibold' : 'text-muted-foreground'}`}>{MODE_LABELS[m]}</button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Link href="/trips/new" className="text-[10.5px] px-2 py-1.5 rounded-lg bg-primary/10 text-primary font-semibold whitespace-nowrap">＋ Заявка</Link>
          <Link href="/vehicle-trips" className="text-[10.5px] px-2 py-1.5 rounded-lg bg-primary/10 text-primary font-semibold whitespace-nowrap hidden md:inline">＋ Рейс</Link>
          <Link href="/payment-history" className="text-[10.5px] px-2 py-1.5 rounded-lg bg-primary/10 text-primary font-semibold whitespace-nowrap hidden lg:inline">＋ Платёж</Link>
          <Link href="/fleet-expenses" className="text-[10.5px] px-2 py-1.5 rounded-lg bg-primary/10 text-primary font-semibold whitespace-nowrap hidden lg:inline">＋ Расход</Link>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden sm:inline">{lastUpdatedAt ? `Обновлено ${lastUpdatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
          <button onClick={refreshAll} className="p-1.5 rounded-lg hover:bg-muted transition"><RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /></button>
          <button onClick={handleDownloadXLSX} className="p-1.5 rounded-lg hover:bg-muted transition" title="Excel"><Download className="w-3.5 h-3.5 text-emerald-600" /></button>
          <button onClick={handleDownloadPDF} className="p-1.5 rounded-lg hover:bg-muted transition" title="PDF"><Download className="w-3.5 h-3.5 text-red-600" /></button>
          <div className="relative">
            <button onClick={() => setNotifOpen(v => !v)} className="p-1.5 rounded-lg hover:bg-muted transition relative">
              <Bell className="w-3.5 h-3.5" />
              {notifItems.length > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-1 w-72 bg-card border rounded-xl shadow-lg z-20 p-2 text-xs">
                <p className="font-semibold px-1 pb-1.5">Уведомления</p>
                {notifItems.length === 0 ? <p className="text-muted-foreground px-1 py-2">Нет новых событий</p> :
                  notifItems.map((n, i) => <div key={i} className="flex items-center gap-2 px-1 py-1.5 hover:bg-muted/50 rounded-lg"><n.icon className={`w-3.5 h-3.5 ${n.color}`} /><span className="truncate">{n.text}</span></div>)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Period filter (компактный) ═══ */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border rounded-lg px-2 py-1.5 bg-background" />
        <span className="text-muted-foreground">—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border rounded-lg px-2 py-1.5 bg-background" />
        <button onClick={applyFilters} className="px-3 py-1.5 bg-primary text-white rounded-lg font-medium">Применить</button>
        {hiddenWidgets.length > 0 && (
          <button onClick={() => { setHiddenWidgets([]); if (userEmail) fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: `dashboard_widgets:${userEmail}`, value: JSON.stringify([]) }) }).catch(() => {}); }}
            className="text-[11px] text-primary underline ml-1">Показать скрытые виджеты ({hiddenWidgets.length})</button>
        )}
      </div>

      {/* ═══ Status Bar ═══ */}
      <div className="bg-card rounded-xl border p-2.5 shadow-sm flex items-center gap-3 flex-wrap text-xs overflow-x-auto">
        <span className={`flex items-center gap-1.5 font-bold whitespace-nowrap pr-3 border-r ${isHealthy ? 'text-emerald-600' : 'text-red-600'}`}>
          {isHealthy ? '🟢 Штатно' : '🔴 Есть критические проблемы'}
        </span>
        <span className="whitespace-nowrap text-muted-foreground">В рейсе <b className="font-mono text-foreground">{op?.vehiclesInTrip ?? '—'}</b></span>
        <span className="whitespace-nowrap text-muted-foreground">Свободно <b className="font-mono text-foreground">{op?.vehiclesFree ?? '—'}</b></span>
        <span className="whitespace-nowrap text-muted-foreground">Активных рейсов <b className="font-mono text-foreground">{op?.tripsInProgress ?? '—'}</b></span>
        <span className="whitespace-nowrap text-muted-foreground">Ожидается <b className="font-mono text-foreground">{fmt(expectedIncome)}</b></span>
        <span className="whitespace-nowrap text-red-600">Просрочено <b className="font-mono">{fmt(overdueTotal)}</b></span>
        <span className="whitespace-nowrap text-muted-foreground">Открытых задач <b className="font-mono text-foreground">{openTasks}</b></span>
        <span className="whitespace-nowrap text-muted-foreground">Wialon <b className="font-mono text-foreground">{wialonAgoMin != null ? `${wialonAgoMin} мин назад` : '—'}</b></span>
      </div>

      {/* ═══ KPI ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        <KpiCard label="ДОХОД" value={fmt(income)} icon={TrendingUp} colorClass="text-emerald-600" borderClass="border-emerald-500" trendPct={null} sparkPoints={sparkFor('revenue')} sparkColor="#10b981" onClick={() => router.push('/reports')} />
        <KpiCard label="РАСХОД" value={fmt(expense)} icon={TrendingDown} colorClass="text-red-500" borderClass="border-red-500" trendPct={null} sparkPoints={sparkFor('costs')} sparkColor="#dc2626" onClick={() => router.push('/reports')} />
        <KpiCard label="ПРИБЫЛЬ" value={fmt(profit)} icon={TrendingUp} colorClass={profit >= 0 ? 'text-green-600' : 'text-red-500'} borderClass={profit >= 0 ? 'border-green-500' : 'border-red-500'} trendPct={trendPct(profit, prevKpi?.totalProfit)} sparkPoints={sparkFor('profit')} sparkColor="#1E4E8C" onClick={() => router.push('/reports')} />
        <KpiCard label="РЕНТАБЕЛЬНОСТЬ" value={`${margin.toFixed(0)}%`} icon={Percent} colorClass="text-blue-600" borderClass="border-blue-500" trendPct={null} onClick={() => router.push('/reports')} />
        <KpiCard label="ДЗ (клиенты)" value={fmt(kpi?.totalClientDebt ?? 0)} icon={ArrowDownRight} colorClass="text-amber-600" borderClass="border-amber-500" trendPct={trendPct(kpi?.totalClientDebt ?? 0, prevKpi?.totalClientDebt)} onClick={() => router.push('/debts')} />
        <KpiCard label="КЗ (перевозчики)" value={fmt(kpi?.totalCarrierDebt ?? 0)} icon={ArrowUpRight} colorClass="text-amber-600" borderClass="border-amber-500" trendPct={trendPct(kpi?.totalCarrierDebt ?? 0, prevKpi?.totalCarrierDebt)} onClick={() => router.push('/debts')} />
        <KpiCard label="КАССОВЫЙ РАЗРЫВ" value={fmt(kpi?.totalCashGap ?? 0)} icon={AlertTriangle} colorClass="text-red-600" borderClass="border-red-500" trendPct={trendPct(kpi?.totalCashGap ?? 0, prevKpi?.totalCashGap)} onClick={() => router.push('/debts')} />
      </div>

      {/* ═══ Command Center ═══ */}
      <div className="bg-card rounded-xl border shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold flex items-center gap-2">🎯 Command Center рисков <span className="text-[10px] font-normal text-muted-foreground">{risks.length} активных, показано {visibleRisks.length}</span></h3>
        </div>
        {risks.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600 py-3"><CheckCircle2 className="w-4 h-4" /> Всё в порядке — открытых рисков нет</div>
        ) : (
          <div className="space-y-1">
            {(['crit', 'high', 'med', 'info'] as Severity[]).map(sev => {
              const items = visibleRisks.filter(r => r.severity === sev);
              if (items.length === 0) return null;
              return (
                <div key={sev}>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mt-2 mb-0.5">{SEV_LABEL[sev]}</p>
                  {items.map(r => <RiskRow key={r.key} r={r} />)}
                </div>
              );
            })}
            {!expandRisks && risks.length > 5 && (
              <button onClick={() => setExpandRisks(true)} className="w-full text-center text-xs text-primary py-2 hover:underline">Показать ещё {risks.length - 5} →</button>
            )}
          </div>
        )}
      </div>

      {/* ═══ AI Insights ═══ */}
      {!isHidden('ai-insights') && insights.length > 0 && (
        <div className="bg-card rounded-xl border shadow-sm p-4">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-2"><Sparkles className="w-4 h-4 text-primary" /> AI Insights <span className="text-[10px] font-normal text-muted-foreground">текстовые правила над уже посчитанными данными, без ML</span><HideWidgetBtn onHide={() => toggleWidget('ai-insights')} /></h3>
          {insights.map((ins, i) => (
            <div key={i} className="flex items-start gap-2 py-1.5">
              <span className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0"><ins.icon className="w-3.5 h-3.5" /></span>
              <div className="text-xs"><span>{ins.text}</span><p className="text-[9px] text-muted-foreground">источник: {ins.src}</p></div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Finance + Map ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {!isHidden('finance-center') && (
        <div className="bg-card rounded-xl border shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2"><DQDot state={financeState} /><h3 className="text-sm font-bold">Финансовый центр <span className="text-[10px] font-normal text-muted-foreground">последние 6 мес.</span></h3><HideWidgetBtn onHide={() => toggleWidget('finance-center')} /></div>
          <div className="h-44">
            {financeState === 'loading' ? <div className="h-full flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              : financeState === 'error' ? <div className="h-full flex items-center justify-center text-xs text-red-500">Не удалось загрузить. <button onClick={loadFinance} className="underline ml-1">Повторить</button></div>
              : (financeData?.monthlyData?.length ?? 0) === 0 ? <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Недостаточно данных для графика</div>
              : <ReportChart data={financeData.monthlyData} />}
          </div>
        </div>
        )}
        {!isHidden('online-map') && (
          <div className="bg-card rounded-xl border shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2"><DQDot state={mapState} /><h3 className="text-sm font-bold">Онлайн-карта</h3><Link href="/telematics/monitoring" className="text-[10px] text-primary ml-auto">Полный экран →</Link><HideWidgetBtn onHide={() => toggleWidget('online-map')} /></div>
            <div ref={mapRef} className="h-56 rounded-lg overflow-hidden bg-muted/30">
              {!mapVisible ? <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Карта загрузится при прокрутке</div>
                : mapState === 'error' ? <div className="h-full flex items-center justify-center text-xs text-red-500">Нет связи с Wialon</div>
                : <FleetMap vehicles={mapVehicles} onSelect={() => router.push('/telematics/monitoring')} />}
            </div>
          </div>
        )}
      </div>

      {/* ═══ Ops + Fleet gauges ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border shadow-sm p-4">
          <h3 className="text-sm font-bold mb-2">Рейсы <span className="text-[10px] font-normal text-muted-foreground">операционная сводка</span></h3>
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-muted/40 rounded-lg p-2 text-center"><p className="font-mono font-bold">{op?.tripsInProgress ?? '—'}</p><p className="text-[9px] text-muted-foreground">В работе</p></div>
            <div className="bg-muted/40 rounded-lg p-2 text-center"><p className="font-mono font-bold">{op?.tripsSverka ?? '—'}</p><p className="text-[9px] text-muted-foreground">На сверке</p></div>
            <div className="bg-muted/40 rounded-lg p-2 text-center"><p className="font-mono font-bold">{op?.tripsAwaitingPayment ?? '—'}</p><p className="text-[9px] text-muted-foreground">Ожид. оплаты</p></div>
            <div className="bg-muted/40 rounded-lg p-2 text-center"><p className="font-mono font-bold">{op?.completedToday ?? '—'}</p><p className="text-[9px] text-muted-foreground">Заверш. сегодня</p></div>
          </div>
        </div>
        {!isHidden('fleet-gauges') && (
          <div className="bg-card rounded-xl border shadow-sm p-4">
            <div className="flex items-center mb-2"><h3 className="text-sm font-bold">Автопарк</h3><HideWidgetBtn onHide={() => toggleWidget('fleet-gauges')} /></div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <GaugeRing value={data?.ownFleet ? (data.ownFleet.profit / (data.ownFleet.revenue || 1)) * 100 : 0} max={100} label="Рентаб. автопарка" unit="%" color="#1E4E8C" />
              <GaugeRing value={op ? (op.vehiclesInTrip / (op.totalActiveVehicles || 1)) * 100 : 0} max={100} label="Исп. флота" unit="%" color="#3B5A8A" />
              <GaugeRing value={op?.totalActiveVehicles ?? 0} max={Math.max(10, op?.totalActiveVehicles ?? 10)} label="Всего машин" unit="" color="#1E7A5C" />
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
              <div className="bg-muted/40 rounded-lg p-1.5"><p className="font-mono font-bold text-sm">{op?.totalActiveVehicles ?? '—'}</p>Всего</div>
              <div className="bg-muted/40 rounded-lg p-1.5"><p className="font-mono font-bold text-sm">{op?.vehiclesFree ?? '—'}</p>Свободны</div>
              <div className="bg-muted/40 rounded-lg p-1.5"><p className="font-mono font-bold text-sm">{op?.vehiclesInTrip ?? '—'}</p>В рейсе</div>
              <div className="bg-muted/40 rounded-lg p-1.5"><p className="font-mono font-bold text-sm">{data?.commandCenter?.idleVehicles?.length ?? 0}</p>Простой</div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Rankings ═══ */}
      <div className="bg-card rounded-xl border shadow-sm p-4">
        <div className="flex items-center gap-2 mb-2"><DQDot state={rankState[rankTab]} /><h3 className="text-sm font-bold">🏆 Рейтинги</h3></div>
        <div className="flex gap-1.5 mb-3">
          {(['clients', 'vehicles', 'drivers', 'carriers'] as Tab[]).map(t => (
            <button key={t} onClick={() => setRankTab(t)} className={`text-[11px] px-2.5 py-1 rounded-full ${rankTab === t ? 'bg-primary text-white font-semibold' : 'bg-muted text-muted-foreground'}`}>
              {t === 'clients' ? 'Клиенты' : t === 'vehicles' ? 'Машины' : t === 'drivers' ? 'Водители' : 'Перевозчики'}
            </button>
          ))}
        </div>
        {/* Машины/Водители не поддерживают фильтр периода на бэкенде (в отличие от
            Клиенты/Перевозчики) — явно подписываем, чтобы расхождение с выбранным на
            странице периодом не выглядело багом (TMS-AUDIT-0026/0034). */}
        {(rankTab === 'vehicles' || rankTab === 'drivers') && (
          <p className="text-[10px] text-muted-foreground -mt-2 mb-2">За всё время, без учёта периода выше</p>
        )}
        {rankState[rankTab] === 'loading' ? <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          : rankState[rankTab] === 'error' ? <div className="text-xs text-red-500">Не удалось загрузить. <button onClick={() => loadRankTab(rankTab)} className="underline">Повторить</button></div>
          : rankRows.length === 0 ? <div className="text-xs text-muted-foreground py-4 text-center">Нет данных</div>
          : (
            <div className="space-y-1.5">
              {rankRows.slice(0, 8).map((r: any, i: number) => (
                <div key={i} className="grid grid-cols-[110px_1fr_90px] items-center gap-2 text-xs">
                  <span className="text-muted-foreground truncate">{r.name ?? '—'}</span>
                  <div className="h-2 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full ${r.profit < 0 ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, (Math.abs(r.profit || 0) / rankMax) * 100)}%` }} /></div>
                  <span className={`font-mono font-semibold text-right ${r.profit < 0 ? 'text-red-600' : ''}`}>{fmt(r.profit || 0)}</span>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* ═══ Forecasts + Calendar + Timeline ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border shadow-sm p-4">
          <h3 className="text-sm font-bold mb-2">📊 Прогнозы</h3>
          <div className="bg-muted/40 border border-dashed rounded-lg p-3 text-[11px] text-muted-foreground text-center">
            Недостаточно исторических данных для надёжного прогноза.<br />
            <span className="text-[9.5px]">В системе — не более 5-7 месяцев наблюдений. Прогноз включится, когда накопится 12+ месяцев (тот же ряд, что уже питает Финансовый центр).</span>
          </div>
        </div>
        {!isHidden('calendar-docs') && (
          <div className="bg-card rounded-xl border shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2"><DQDot state={calState} /><h3 className="text-sm font-bold">📅 Календарь</h3><Link href="/calendar" className="text-[10px] text-primary ml-auto">/calendar →</Link><HideWidgetBtn onHide={() => toggleWidget('calendar-docs')} /></div>
            {calState === 'loading' ? <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              : <p className="text-[11px] text-muted-foreground">{calDays.length > 0 ? `${calDays.length} событий в этом месяце (загрузки/разгрузки)` : 'Нет запланированных событий'}</p>}
          </div>
        )}
        <div className="bg-card rounded-xl border shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2"><DQDot state={timelineState} /><h3 className="text-sm font-bold">Последние события</h3></div>
          {timelineState === 'loading' ? <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            : timelineEvents.length === 0 ? <p className="text-xs text-muted-foreground">Событий ещё не было</p>
            : (
              <div className="space-y-1.5">
                {timelineEvents.slice(0, 6).map((e: any) => (
                  <button key={e.id} onClick={() => e.tripId && router.push(`/trips/${e.tripId}`)} className="w-full text-left flex items-center gap-2 text-[11px] hover:bg-muted/40 rounded px-1 py-1">
                    <span className="text-muted-foreground font-mono shrink-0">{new Date(e.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="truncate">{e.label}</span>
                  </button>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* ═══ Heatmap ═══ */}
      {!isHidden('heatmap-fleet') && (
        <div className="bg-card rounded-xl border shadow-sm p-4" ref={heatRef}>
          <div className="flex items-center gap-2 mb-2"><DQDot state={heatState} /><h3 className="text-sm font-bold">Производительность автопарка <span className="text-[10px] font-normal text-muted-foreground">загрузка за 7 дней</span></h3><HideWidgetBtn onHide={() => toggleWidget('heatmap-fleet')} /></div>
          {!heatVisible ? <p className="text-xs text-muted-foreground">Загрузится при прокрутке</p>
            : heatState === 'loading' ? <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            : heatState === 'error' ? <p className="text-xs text-red-500">Не удалось загрузить</p>
            : (
              <div className="overflow-x-auto">
                <table className="text-[10px]">
                  <thead><tr><th className="w-20"></th>{heatData?.days?.map((d: string) => <th key={d} className="px-2 text-muted-foreground">{d.slice(8)}</th>)}</tr></thead>
                  <tbody>
                    {heatData?.rows?.map((r: any) => (
                      <tr key={r.vehicleId}>
                        <td className="pr-2 text-muted-foreground whitespace-nowrap">{r.plateNumber}</td>
                        {r.cells.map((c: string, i: number) => <td key={i} className="px-0.5 py-0.5"><div className={`w-6 h-4 rounded ${c === 'trip' ? 'bg-emerald-500' : 'bg-muted'}`} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
