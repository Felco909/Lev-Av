'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import CrumbLink from '@/components/nav/crumb-link';
import { Plus, Pencil, Trash2, Loader2, Truck, X, ChevronDown, ChevronUp, Fuel, Wallet, Banknote, Archive } from 'lucide-react';
import { formatDate, formatCurrency, FLEET_EXPENSE_TYPE_MAP } from '@/lib/utils';

interface Vehicle { id: string; plateNumber: string; brand: string; model: string; wialonUnitId?: string | null }
interface Driver { id: string; fullName: string }
interface VT {
  id: string; tripNumber: string; vehicleId: string; driverId: string | null;
  vehicle: Vehicle; driver: Driver | null;
  departureDate: string; startMileage: number | null; startFuel: number | null;
  returnDate: string | null; endMileage: number | null; endFuel: number | null;
  status: string; notes: string | null;
  salary: number | null; perDiem: number | null; otherExpenses: number | null;
  perDiem2: number | null; perDiem3: number | null;
  salaryCurrency: string; salaryRate: number;
  perDiemCurrency: string; perDiemRate: number;
  perDiem2Currency: string; perDiem2Rate: number;
  perDiem3Currency: string; perDiem3Rate: number;
  otherCurrency: string; otherRate: number;
  salaryAmd: number | null; perDiemAmd: number | null; otherExpensesAmd: number | null;
  perDiem2Amd: number | null; perDiem3Amd: number | null;
  fuelLiters: number | null; fuelCost: number | null;
  fuelCurrency: string; fuelRate: number; fuelCostAmd: number | null;
  calculatedKm: number | null; calculatedFuelConsumedL: number | null;
  fuelCalcSource: string | null; fuelCalcAt: string | null;
  _count: { trips: number; fleetExpenses: number };
}

interface VTDetail extends VT {
  trips: any[]; fleetExpenses: any[];
  revenue: number; totalExpenses: number; expensesByType: Record<string, number>; profit: number; mileage: number | null;
  directSalaryAmd: number; directPerDiemAmd: number; directOtherAmd: number; directFuelAmd: number; directTotalAmd: number; fleetExpTotal: number;
}

interface TripForm {
  id?: string; tripNumber: string; vehicleId: string; driverId: string; departureDate: string;
  startMileage: string; startFuel: string; returnDate: string;
  endMileage: string; endFuel: string; notes: string; status: string;
  salary: string; perDiem: string; otherExpenses: string;
  perDiem2: string; perDiem3: string;
  salaryCurrency: string; salaryRate: string;
  perDiemCurrency: string; perDiemRate: string;
  perDiem2Currency: string; perDiem2Rate: string;
  perDiem3Currency: string; perDiem3Rate: string;
  otherCurrency: string; otherRate: string;
  fuelLiters: string; fuelCost: string;
  fuelCurrency: string; fuelRate: string;
}

interface ExpForm {
  id?: string; date: string; expenseType: string; liters: string;
  amount: string; currency: string; exchangeRate: string; comment: string;
}

const CURRENCIES = ['AMD', 'RUB', 'USD', 'GEL', 'EUR'];

function wialonHintText(reason?: string): string {
  if (reason === 'too_old') return 'Дата слишком старая для автозаполнения (>30 дней) — введите вручную';
  if (reason === 'wialon_error') return 'Wialon сейчас недоступен — введите вручную';
  return 'Нет данных Wialon на эту дату — введите вручную';
}

const emptyTripForm = (): TripForm => ({
  tripNumber: '', vehicleId: '', driverId: '', departureDate: new Date().toISOString().slice(0, 10),
  startMileage: '', startFuel: '', returnDate: '', endMileage: '', endFuel: '', notes: '', status: 'active',
  salary: '', perDiem: '', otherExpenses: '',
  perDiem2: '', perDiem3: '',
  salaryCurrency: 'AMD', salaryRate: '1',
  perDiemCurrency: 'AMD', perDiemRate: '1',
  perDiem2Currency: 'AMD', perDiem2Rate: '1',
  perDiem3Currency: 'AMD', perDiem3Rate: '1',
  otherCurrency: 'AMD', otherRate: '1',
  fuelLiters: '', fuelCost: '',
  fuelCurrency: 'AMD', fuelRate: '1',
});

const emptyExpForm = (): ExpForm => ({
  date: new Date().toISOString().slice(0, 10), expenseType: 'fuel', liters: '',
  amount: '', currency: 'AMD', exchangeRate: '1', comment: '',
});

const fmtAmd = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ֏`;
const CUR_SYMBOL: Record<string, string> = { AMD: '֏', RUB: '₽', USD: '$', GEL: '₾', EUR: '€' };

export default function VehicleTripsPage() {
  const [rows, setRows] = useState<VT[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Trip modal
  const [showTripModal, setShowTripModal] = useState(false);
  const [tripForm, setTripForm] = useState<TripForm>(emptyTripForm());
  const [deleting, setDeleting] = useState<string | null>(null);

  // Detail view (expanded inline)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VTDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Expense modal (for additional fleet expenses)
  const [showExpModal, setShowExpModal] = useState(false);
  const [expForm, setExpForm] = useState<ExpForm>(emptyExpForm());
  const [expSaving, setExpSaving] = useState(false);
  const [expDeleting, setExpDeleting] = useState<string | null>(null);

  // Wialon auto-fill (Выезд/Возврат) — только для машин со связанным wialonUnitId
  // и только для сегодня/недавних дат (см. CLAUDE.md/план: исторический разбор не делаем).
  const [departureSnapshotLoading, setDepartureSnapshotLoading] = useState(false);
  const [returnSnapshotLoading, setReturnSnapshotLoading] = useState(false);
  const [departureHint, setDepartureHint] = useState<string | null>(null);
  const [returnHint, setReturnHint] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    fetch('/api/vehicles').then(r => r.json()).then(d => setVehicles(Array.isArray(d) ? d : d.vehicles || []));
    fetch('/api/drivers').then(r => r.json()).then(d => setDrivers(Array.isArray(d) ? d : d.drivers || []));
  }, []);

  const fetchWialonSnapshot = useCallback(async (wialonUnitId: string, dateStr: string) => {
    const datetime = new Date(`${dateStr}T12:00:00`).toISOString();
    const res = await fetch(`/api/wialon/vehicle-snapshot?wialonUnitId=${encodeURIComponent(wialonUnitId)}&datetime=${encodeURIComponent(datetime)}`);
    return res.json();
  }, []);

  useEffect(() => {
    const vehicle = vehicles.find(v => v.id === tripForm.vehicleId);
    if (!vehicle?.wialonUnitId || !tripForm.departureDate) { setDepartureHint(null); return; }
    let cancelled = false;
    setDepartureSnapshotLoading(true);
    setDepartureHint(null);
    fetchWialonSnapshot(vehicle.wialonUnitId, tripForm.departureDate).then(data => {
      if (cancelled) return;
      if (data.available) {
        setTripForm(prev => ({
          ...prev,
          startMileage: data.mileageKm != null ? String(Math.round(data.mileageKm)) : prev.startMileage,
          startFuel: data.fuelLevelL != null ? String(data.fuelLevelL) : prev.startFuel,
        }));
        setDepartureHint(
          data.isApproximate
            ? 'Показано текущее значение из Wialon (не точно на выбранную дату) — проверьте вручную'
            : null
        );
      } else {
        setDepartureHint(wialonHintText(data.reason));
      }
    }).catch(() => { if (!cancelled) setDepartureHint(wialonHintText('wialon_error')); })
      .finally(() => { if (!cancelled) setDepartureSnapshotLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripForm.vehicleId, tripForm.departureDate]);

  useEffect(() => {
    const vehicle = vehicles.find(v => v.id === tripForm.vehicleId);
    if (!vehicle?.wialonUnitId || !tripForm.returnDate) { setReturnHint(null); return; }
    let cancelled = false;
    setReturnSnapshotLoading(true);
    setReturnHint(null);
    fetchWialonSnapshot(vehicle.wialonUnitId, tripForm.returnDate).then(data => {
      if (cancelled) return;
      if (data.available) {
        setTripForm(prev => ({
          ...prev,
          endMileage: data.mileageKm != null ? String(Math.round(data.mileageKm)) : prev.endMileage,
          endFuel: data.fuelLevelL != null ? String(data.fuelLevelL) : prev.endFuel,
        }));
        setReturnHint(
          data.isApproximate
            ? 'Показано текущее значение из Wialon (не точно на выбранную дату) — проверьте вручную'
            : null
        );
      } else {
        setReturnHint(wialonHintText(data.reason));
      }
    }).catch(() => { if (!cancelled) setReturnHint(wialonHintText('wialon_error')); })
      .finally(() => { if (!cancelled) setReturnSnapshotLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripForm.vehicleId, tripForm.returnDate]);

  const recalculateFuel = async () => {
    if (!detail?.id) return;
    setRecalculating(true);
    try {
      await fetch(`/api/vehicle-trips/${detail.id}/recalculate-fuel`, { method: 'POST' });
      await loadDetail(detail.id);
    } catch {} finally { setRecalculating(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filterVehicle) p.set('vehicleId', filterVehicle);
    if (filterStatus) p.set('status', filterStatus);
    if (showArchived && !filterStatus) p.set('showArchived', '1');
    const res = await fetch(`/api/vehicle-trips?${p}`);
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [filterVehicle, filterStatus, showArchived]);

  useEffect(() => { load(); }, [load]);

  // --- Trip CRUD ---
  const openNewTrip = () => { setTripForm(emptyTripForm()); setShowTripModal(true); };
  const openEditTrip = (r: VT) => {
    setTripForm({
      id: r.id, tripNumber: r.tripNumber || '',
      vehicleId: r.vehicleId, driverId: r.driverId || '',
      departureDate: r.departureDate?.slice(0, 10) || '',
      startMileage: r.startMileage != null ? String(r.startMileage) : '',
      startFuel: r.startFuel != null ? String(Number(r.startFuel)) : '',
      returnDate: r.returnDate?.slice(0, 10) || '',
      endMileage: r.endMileage != null ? String(r.endMileage) : '',
      endFuel: r.endFuel != null ? String(Number(r.endFuel)) : '',
      notes: r.notes || '', status: r.status || 'active',
      salary: r.salary != null ? String(Number(r.salary)) : '',
      perDiem: r.perDiem != null ? String(Number(r.perDiem)) : '',
      perDiem2: r.perDiem2 != null ? String(Number(r.perDiem2)) : '',
      perDiem3: r.perDiem3 != null ? String(Number(r.perDiem3)) : '',
      otherExpenses: r.otherExpenses != null ? String(Number(r.otherExpenses)) : '',
      salaryCurrency: r.salaryCurrency || 'AMD',
      salaryRate: r.salaryRate != null ? String(Number(r.salaryRate)) : '1',
      perDiemCurrency: r.perDiemCurrency || 'AMD',
      perDiemRate: r.perDiemRate != null ? String(Number(r.perDiemRate)) : '1',
      perDiem2Currency: r.perDiem2Currency || 'AMD',
      perDiem2Rate: r.perDiem2Rate != null ? String(Number(r.perDiem2Rate)) : '1',
      perDiem3Currency: r.perDiem3Currency || 'AMD',
      perDiem3Rate: r.perDiem3Rate != null ? String(Number(r.perDiem3Rate)) : '1',
      otherCurrency: r.otherCurrency || 'AMD',
      otherRate: r.otherRate != null ? String(Number(r.otherRate)) : '1',
      fuelLiters: r.fuelLiters != null ? String(Number(r.fuelLiters)) : '',
      fuelCost: r.fuelCost != null ? String(Number(r.fuelCost)) : '',
      fuelCurrency: r.fuelCurrency || 'AMD',
      fuelRate: r.fuelRate != null ? String(Number(r.fuelRate)) : '1',
    });
    setShowTripModal(true);
  };

  const saveTripForm = async () => {
    if (!tripForm.vehicleId || !tripForm.departureDate) return;
    setSaving(true);
    await fetch('/api/vehicle-trips', {
      method: tripForm.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tripForm),
    });
    setSaving(false); setShowTripModal(false); load();
    if (tripForm.id && expandedId === tripForm.id) loadDetail(tripForm.id);
  };

  const deleteTrip = async (id: string) => {
    if (!confirm('Удалить рейс машины?')) return;
    setDeleting(id);
    await fetch(`/api/vehicle-trips?id=${id}`, { method: 'DELETE' });
    setDeleting(null);
    if (expandedId === id) { setExpandedId(null); setDetail(null); }
    load();
  };

  // --- Detail / Expand ---
  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    const res = await fetch(`/api/vehicle-trips/${id}`);
    const data = await res.json();
    setDetail(data);
    setDetailLoading(false);
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) { setExpandedId(null); setDetail(null); }
    else { setExpandedId(id); loadDetail(id); }
  };

  // --- Expense CRUD (additional fleet expenses) ---
  const openNewExp = () => {
    if (!detail) return;
    setExpForm({ ...emptyExpForm(), date: detail.departureDate?.slice(0, 10) || new Date().toISOString().slice(0, 10) });
    setShowExpModal(true);
  };
  const openEditExp = (e: any) => {
    setExpForm({
      id: e.id,
      date: e.date?.slice(0, 10) || '',
      expenseType: e.expenseType,
      liters: e.liters != null ? String(Number(e.liters)) : '',
      amount: String(Number(e.amount)),
      currency: e.currency,
      exchangeRate: String(Number(e.exchangeRate)),
      comment: e.comment || '',
    });
    setShowExpModal(true);
  };

  const saveExpForm = async () => {
    if (!detail || !expForm.amount || !expForm.expenseType) return;
    setExpSaving(true);
    await fetch('/api/fleet-expenses', {
      method: expForm.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...expForm,
        vehicleId: detail.vehicleId,
        vehicleTripId: detail.id,
      }),
    });
    setExpSaving(false); setShowExpModal(false);
    loadDetail(detail.id); load();
  };

  const deleteExp = async (eId: string) => {
    if (!detail) return;
    setExpDeleting(eId);
    await fetch(`/api/fleet-expenses?id=${eId}`, { method: 'DELETE' });
    setExpDeleting(null);
    loadDetail(detail.id); load();
  };

  const computedAmountAmd = () => {
    const amt = parseFloat(expForm.amount) || 0;
    const rate = parseFloat(expForm.exchangeRate) || 1;
    return expForm.currency === 'AMD' ? amt : Math.round(amt * rate * 100) / 100;
  };

  // Trip form AMD preview (per-expense currency/rate)
  const tripExpAmd = () => {
    const sRate = tripForm.salaryCurrency === 'AMD' ? 1 : (parseFloat(tripForm.salaryRate) || 1);
    const pRate = tripForm.perDiemCurrency === 'AMD' ? 1 : (parseFloat(tripForm.perDiemRate) || 1);
    const p2Rate = tripForm.perDiem2Currency === 'AMD' ? 1 : (parseFloat(tripForm.perDiem2Rate) || 1);
    const p3Rate = tripForm.perDiem3Currency === 'AMD' ? 1 : (parseFloat(tripForm.perDiem3Rate) || 1);
    const oRate = tripForm.otherCurrency === 'AMD' ? 1 : (parseFloat(tripForm.otherRate) || 1);
    const fRate = tripForm.fuelCurrency === 'AMD' ? 1 : (parseFloat(tripForm.fuelRate) || 1);
    const s = (parseFloat(tripForm.salary) || 0) * sRate;
    const p1 = (parseFloat(tripForm.perDiem) || 0) * pRate;
    const p2 = (parseFloat(tripForm.perDiem2) || 0) * p2Rate;
    const p3 = (parseFloat(tripForm.perDiem3) || 0) * p3Rate;
    const p = p1 + p2 + p3;
    const o = (parseFloat(tripForm.otherExpenses) || 0) * oRate;
    const f = (parseFloat(tripForm.fuelCost) || 0) * fRate;
    return { s: Math.round(s), p: Math.round(p), o: Math.round(o), f: Math.round(f), total: Math.round(s + p + o + f) };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{'Рейсы машин'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{'Учёт рейсов, пробега, топлива и расходов'}</p>
        </div>
        <button type="button" onClick={openNewTrip} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> {'Новый рейс'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 bg-muted/40 rounded-xl p-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{'Машина'}</label>
          <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs mt-0.5 block w-[160px]">
            <option value="">{'Все'}</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber} ({v.brand})</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{'Статус'}</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs mt-0.5 block w-[130px]">
            <option value="">{'Все'}</option>
            <option value="active">{'В рейсе'}</option>
            <option value="completed">{'Завершён'}</option>
            <option value="archived">{'Архив'}</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => setShowArchived(v => !v)}
            className={`inline-flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 text-xs transition mt-4 ${showArchived ? 'bg-slate-200 dark:bg-slate-700 border-slate-400 text-slate-700 dark:text-slate-200' : 'bg-card hover:bg-muted/50'}`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>{showArchived ? '\u0421\u043A\u0440\u044B\u0442\u044C \u0430\u0440\u0445\u0438\u0432' : '\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0430\u0440\u0445\u0438\u0432'}</span>
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Truck className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{'Нет рейсов'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => {
            const isActive = r.status === 'active';
            const isExpanded = expandedId === r.id;
            const directTotal = (Number(r.salaryAmd) || 0) + (Number(r.perDiemAmd) || 0) + (Number(r.otherExpensesAmd) || 0) + (Number(r.fuelCostAmd) || 0);
            return (
              <div key={r.id} className="bg-card rounded-xl border overflow-hidden">
                {/* Card header */}
                <div className="p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpand(r.id)}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-bold">{r.tripNumber}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          r.status === 'archived' ? 'bg-slate-100 text-slate-500 dark:bg-slate-800/40 dark:text-slate-400' : isActive ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        }`}>{r.status === 'archived' ? '\u0410\u0440\u0445\u0438\u0432' : isActive ? '\u0412 \u0440\u0435\u0439\u0441\u0435' : '\u0417\u0430\u0432\u0435\u0440\u0448\u0451\u043D'}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{r.vehicle?.plateNumber}</span>
                        <span className="ml-1">{r.vehicle?.brand} {r.vehicle?.model}</span>
                        {r.driver && <span className="ml-2">{'·'} {r.driver.fullName}</span>}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[11px] text-muted-foreground">
                        <span>{'Выезд'}: {formatDate(r.departureDate)}</span>
                        {r.returnDate && <span>{'Возврат'}: {formatDate(r.returnDate)}</span>}
                        {r.startMileage != null && <span>{'Пробег'}: {r.startMileage?.toLocaleString('ru-RU')}{r.endMileage != null ? ` → ${r.endMileage.toLocaleString('ru-RU')} км` : ' км'}</span>}
                        {directTotal > 0 && <span className="text-red-500 font-medium">{'Расходы'}: {fmtAmd(directTotal)}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0 items-center">
                      <button onClick={() => toggleExpand(r.id)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title={'Подробности'}>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </button>
                      <button onClick={() => openEditTrip(r)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title={'Редактировать'}>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => deleteTrip(r.id)} disabled={deleting === r.id} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                        {deleting === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-4 bg-muted/10">
                    {detailLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                    ) : detail && detail.id === r.id ? (
                      <>
                        {/* Profit cards */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3">
                            <p className="text-[10px] text-emerald-600">{'Доход'}</p>
                            <p className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-400">{fmtAmd(detail.revenue)}</p>
                          </div>
                          <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
                            <p className="text-[10px] text-red-600">{'Расходы'}</p>
                            <p className="text-base font-bold font-mono text-red-600">{fmtAmd(detail.totalExpenses)}</p>
                          </div>
                          <div className={`rounded-lg p-3 ${detail.profit >= 0 ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
                            <p className={`text-[10px] ${detail.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{'Прибыль'}</p>
                            <p className={`text-base font-bold font-mono ${detail.profit >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600'}`}>{fmtAmd(detail.profit)}</p>
                          </div>
                        </div>

                        {/* Info row: mileage & fuel */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div className="bg-muted/40 rounded-lg p-2">
                            <p className="text-[10px] text-muted-foreground">{'Пробег'}</p>
                            <p className="font-medium">{detail.mileage != null ? `${detail.mileage.toLocaleString('ru-RU')} км` : '—'}</p>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-2">
                            <p className="text-[10px] text-muted-foreground">{'Топливо'}</p>
                            <p className="font-medium">{detail.startFuel != null ? `${Number(detail.startFuel)}` : '?'} {'→'} {detail.endFuel != null ? `${Number(detail.endFuel)} л` : '?'}</p>
                          </div>
                          {detail.fleetExpenses.filter((e: any) => e.expenseType === 'fuel' && e.liters).length > 0 && (
                            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2">
                              <p className="text-[10px] text-amber-600">{'Заправлено'}</p>
                              <p className="font-medium">{detail.fleetExpenses.filter((e: any) => e.expenseType === 'fuel' && e.liters).reduce((s: number, e: any) => s + Number(e.liters), 0).toLocaleString('ru-RU')} {'л'}</p>
                            </div>
                          )}
                          {detail.notes && (
                            <div className="bg-muted/40 rounded-lg p-2 col-span-2 sm:col-span-1">
                              <p className="text-[10px] text-muted-foreground">{'Заметки'}</p>
                              <p className="font-medium truncate">{detail.notes}</p>
                            </div>
                          )}
                        </div>

                        {/* Итоги рейса — автоматический расчёт из Wialon, только для закрытых рейсов */}
                        {detail.returnDate && (
                          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 text-xs space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-emerald-700 dark:text-emerald-400">{'Итоги рейса'}</p>
                              <button onClick={recalculateFuel} disabled={recalculating} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 border rounded-md hover:bg-muted transition disabled:opacity-50">
                                {recalculating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Fuel className="w-3 h-3" />}
                                {'Пересчитать по Wialon'}
                              </button>
                            </div>
                            <p>
                              {detail.calculatedKm != null ? `${detail.calculatedKm.toLocaleString('ru-RU')} км` : 'пробег не рассчитан'}
                              {', '}
                              {detail.calculatedFuelConsumedL != null ? `${detail.calculatedFuelConsumedL.toLocaleString('ru-RU')} л топлива` : 'расход не рассчитан'}
                              {detail.fuelCalcSource === 'odometer_diff' && (
                                <span className="text-amber-600"> {'(расчёт по разнице остатков, точность ниже)'}</span>
                              )}
                            </p>
                            {detail.fuelCalcAt && (
                              <p className="text-[10px] text-muted-foreground">
                                {'Рассчитано: '}{new Date(detail.fuelCalcAt).toLocaleString('ru-RU')}
                                {' — трекер может досылать данные с задержкой (например, после зон без покрытия), пересчитайте позже при сомнениях.'}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Direct expenses block */}
                        <div>
                          <p className="text-xs font-semibold flex items-center gap-1 mb-2"><Banknote className="w-3.5 h-3.5" /> {'Расходы по рейсу'}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
                            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2">
                              <p className="text-[10px] text-blue-600">{'Зарплата'}</p>
                              <p className="font-medium font-mono">{detail.directSalaryAmd ? fmtAmd(detail.directSalaryAmd) : '—'}</p>
                              {detail.salary && detail.salaryCurrency !== 'AMD' && (
                                <p className="text-[10px] text-muted-foreground">{Number(detail.salary).toLocaleString('ru-RU')} {CUR_SYMBOL[detail.salaryCurrency] || detail.salaryCurrency}</p>
                              )}
                            </div>
                            <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-2">
                              <p className="text-[10px] text-purple-600">{'Суточные'}</p>
                              <p className="font-medium font-mono">{detail.directPerDiemAmd ? fmtAmd(detail.directPerDiemAmd) : '—'}</p>
                              {[
                                { amount: detail.perDiem, currency: detail.perDiemCurrency },
                                { amount: detail.perDiem2, currency: detail.perDiem2Currency },
                                { amount: detail.perDiem3, currency: detail.perDiem3Currency },
                              ].filter(slot => slot.amount && slot.currency !== 'AMD').map((slot, i) => (
                                <p key={i} className="text-[10px] text-muted-foreground">{Number(slot.amount).toLocaleString('ru-RU')} {CUR_SYMBOL[slot.currency] || slot.currency}</p>
                              ))}
                            </div>
                            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2">
                              <p className="text-[10px] text-amber-600">{'Топливо'}</p>
                              <p className="font-medium font-mono">{detail.directFuelAmd ? fmtAmd(detail.directFuelAmd) : '—'}</p>
                              {detail.fuelCost && detail.fuelCurrency !== 'AMD' && (
                                <p className="text-[10px] text-muted-foreground">{Number(detail.fuelCost).toLocaleString('ru-RU')} {CUR_SYMBOL[detail.fuelCurrency] || detail.fuelCurrency}</p>
                              )}
                              {detail.fuelLiters && <p className="text-[10px] text-muted-foreground">{Number(detail.fuelLiters)} {'л'}</p>}
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/30 rounded-lg p-2">
                              <p className="text-[10px] text-slate-600">{'Прочие'}</p>
                              <p className="font-medium font-mono">{detail.directOtherAmd ? fmtAmd(detail.directOtherAmd) : '—'}</p>
                              {detail.otherExpenses && detail.otherCurrency !== 'AMD' && (
                                <p className="text-[10px] text-muted-foreground">{Number(detail.otherExpenses).toLocaleString('ru-RU')} {CUR_SYMBOL[detail.otherCurrency] || detail.otherCurrency}</p>
                              )}
                            </div>
                            <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2">
                              <p className="text-[10px] text-red-600">{'Итого'}</p>
                              <p className="font-medium font-mono font-bold text-red-600">{fmtAmd(detail.directTotalAmd)}</p>
                            </div>
                          </div>
                        </div>

                        {/* Additional fleet expenses section */}
                        {(detail.fleetExpenses.length > 0 || true) && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> {'Доп. расходы'} ({detail.fleetExpenses.length})</p>
                              <button type="button" onClick={openNewExp} className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors">
                                <Plus className="w-3 h-3" /> {'Добавить'}
                              </button>
                            </div>
                            {detail.fleetExpenses.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2 text-center">{'Нет дополнительных расходов (топливо, прочее).'}</p>
                            ) : (
                              <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-muted/30 border-b">
                                      <th className="py-2 px-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground">{'Дата'}</th>
                                      <th className="py-2 px-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground">{'Тип'}</th>
                                      <th className="py-2 px-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground">{'Литры'}</th>
                                      <th className="py-2 px-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground">{'Сумма'}</th>
                                      <th className="py-2 px-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">AMD</th>
                                      <th className="py-2 px-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground hidden md:table-cell">{'Коммент.'}</th>
                                      <th className="py-2 px-3 w-16"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detail.fleetExpenses.map((e: any) => (
                                      <tr key={e.id} className="border-b last:border-0 hover:bg-muted/20">
                                        <td className="py-1.5 px-3 whitespace-nowrap">{formatDate(e.date)}</td>
                                        <td className="py-1.5 px-3">
                                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                            e.expenseType === 'fuel' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                            : e.expenseType === 'salary' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                            : e.expenseType === 'per_diem' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                          }`}>{FLEET_EXPENSE_TYPE_MAP[e.expenseType] || e.expenseType}</span>
                                        </td>
                                        <td className="py-1.5 px-3 text-right font-mono">{e.liters ? `${Number(e.liters)} л` : '—'}</td>
                                        <td className="py-1.5 px-3 text-right font-mono whitespace-nowrap">
                                          {Number(e.amount).toLocaleString('ru-RU')} {CUR_SYMBOL[e.currency] || e.currency}
                                        </td>
                                        <td className="py-1.5 px-3 text-right font-mono font-medium hidden sm:table-cell">{fmtAmd(Number(e.amountAmd))}</td>
                                        <td className="py-1.5 px-3 text-muted-foreground hidden md:table-cell max-w-[150px] truncate">{e.comment || '—'}</td>
                                        <td className="py-1.5 px-3">
                                          <div className="flex gap-0.5 justify-center">
                                            <button onClick={() => openEditExp(e)} className="p-1 rounded hover:bg-muted" title={'Ред.'}>
                                              <Pencil className="w-3 h-3 text-muted-foreground" />
                                            </button>
                                            <button onClick={() => deleteExp(e.id)} disabled={expDeleting === e.id} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30" title={'Удал.'}>
                                              {expDeleting === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3 text-red-500" />}
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  {detail.fleetExpenses.length > 0 && (
                                    <tfoot>
                                      <tr className="bg-muted/20 font-medium">
                                        <td colSpan={3} className="py-2 px-3 text-right">{'ИТОГО'}:</td>
                                        <td className="py-2 px-3"></td>
                                        <td className="py-2 px-3 text-right font-mono font-bold hidden sm:table-cell">{fmtAmd(detail.fleetExpTotal)}</td>
                                        <td className="hidden md:table-cell"></td>
                                        <td></td>
                                      </tr>
                                    </tfoot>
                                  )}
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Linked logistics trips */}
                        {detail.trips.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold mb-1">{'Заявки'} ({detail.trips.length})</p>
                            <div className="space-y-1">
                              {detail.trips.map((t: any) => (
                                <CrumbLink key={t.id} href={`/trips/${t.id}`} fromLabel="Рейсы машин" fromKey="vehicle-trips" className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors">
                                  <span><span className="font-mono font-medium">{t.tripNumber}</span> {t.routeFrom} {'→'} {t.routeTo} <span className="text-muted-foreground">({t.client?.name})</span></span>
                                  <span className="font-mono text-emerald-600">{fmtAmd(Number(t.clientRateAmd || t.clientRate || 0))}</span>
                                </CrumbLink>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Trip Create/Edit Modal */}
      {showTripModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowTripModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{tripForm.id ? 'Редактировать рейс' : 'Новый рейс машины'}</h2>

            {/* Trip number + Vehicle + Driver */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">{'№ рейса'}</label>
                <input type="text" value={tripForm.tripNumber} onChange={e => setTripForm({...tripForm, tripNumber: e.target.value})}
                  className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5 font-mono" placeholder={'авто'} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{'Машина'} *</label>
                <select value={tripForm.vehicleId} onChange={e => setTripForm({...tripForm, vehicleId: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5">
                  <option value="">{'Выберите…'}</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber} {'—'} {v.brand} {v.model}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{'Водитель'}</label>
                <select value={tripForm.driverId} onChange={e => setTripForm({...tripForm, driverId: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5">
                  <option value="">{'Не указан'}</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                </select>
              </div>
            </div>

            {/* Status selector */}
            {tripForm.id && (
              <div>
                <label className="text-xs text-muted-foreground">{'Статус'}</label>
                <select value={tripForm.status} onChange={e => setTripForm({...tripForm, status: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5">
                  <option value="active">{'\u0412 \u0440\u0435\u0439\u0441\u0435'}</option>
                  <option value="completed">{'\u0417\u0430\u0432\u0435\u0440\u0448\u0451\u043D'}</option>
                  <option value="archived">{'\u0410\u0440\u0445\u0438\u0432'}</option>
                </select>
              </div>
            )}

            <p className="text-xs font-medium text-muted-foreground mt-2 border-t pt-2">{'Выезд'}</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">{'Дата'} *</label>
                <input type="date" value={tripForm.departureDate} onChange={e => setTripForm({...tripForm, departureDate: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground flex items-center gap-1">{'Пробег (км)'} {departureSnapshotLoading && <Loader2 className="w-3 h-3 animate-spin" />}</label>
                <input type="number" min="0" value={tripForm.startMileage} onChange={e => setTripForm({...tripForm, startMileage: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" placeholder={'нач.'} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground flex items-center gap-1">{'Топливо (л)'} {departureSnapshotLoading && <Loader2 className="w-3 h-3 animate-spin" />}</label>
                <input type="number" step="0.01" min="0" value={tripForm.startFuel} onChange={e => setTripForm({...tripForm, startFuel: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" placeholder={'остаток'} />
              </div>
              {departureHint && <p className="col-span-3 text-[11px] text-amber-600">{departureHint}</p>}
            </div>

            <p className="text-xs font-medium text-muted-foreground mt-2 border-t pt-2">{'Возврат'}</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">{'Дата'}</label>
                <input type="date" value={tripForm.returnDate} onChange={e => setTripForm({...tripForm, returnDate: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground flex items-center gap-1">{'Пробег (км)'} {returnSnapshotLoading && <Loader2 className="w-3 h-3 animate-spin" />}</label>
                <input type="number" min="0" value={tripForm.endMileage} onChange={e => setTripForm({...tripForm, endMileage: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" placeholder={'кон.'} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground flex items-center gap-1">{'Топливо (л)'} {returnSnapshotLoading && <Loader2 className="w-3 h-3 animate-spin" />}</label>
                <input type="number" step="0.01" min="0" value={tripForm.endFuel} onChange={e => setTripForm({...tripForm, endFuel: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" placeholder={'остаток'} />
              </div>
              {returnHint && <p className="col-span-3 text-[11px] text-amber-600">{returnHint}</p>}
            </div>

            {/* Expenses section in trip form — per-expense currency/rate */}
            <p className="text-xs font-medium text-muted-foreground mt-2 border-t pt-2">{'Расходы по рейсу'}</p>
            {/* Salary row */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-blue-600">{'Зарплата'}</label>
              <div className="grid grid-cols-4 gap-2">
                <input type="number" step="0.01" min="0" value={tripForm.salary} onChange={e => setTripForm({...tripForm, salary: e.target.value})} className="border rounded-lg px-2 py-1.5 text-sm w-full" placeholder="Сумма" />
                <select value={tripForm.salaryCurrency} onChange={e => setTripForm({...tripForm, salaryCurrency: e.target.value, salaryRate: e.target.value === 'AMD' ? '1' : tripForm.salaryRate})} className="border rounded-lg px-2 py-1.5 text-sm w-full">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" step="0.0001" min="0" value={tripForm.salaryRate} onChange={e => setTripForm({...tripForm, salaryRate: e.target.value})} disabled={tripForm.salaryCurrency === 'AMD'} className="border rounded-lg px-2 py-1.5 text-sm w-full disabled:opacity-50" placeholder="Курс" />
                <div className="flex items-center text-xs font-mono text-blue-600 pl-1">
                  {tripForm.salaryCurrency !== 'AMD' && (parseFloat(tripForm.salary) || 0) > 0 ? fmtAmd(Math.round((parseFloat(tripForm.salary) || 0) * (parseFloat(tripForm.salaryRate) || 1))) : ''}
                </div>
              </div>
            </div>
            {/* Per Diem rows — маршрут может проходить через несколько стран, суточные по
                каждой считаются отдельно, поэтому блок повторён 3 раза (не страна-специфичные
                поля — просто три одинаковых слота, логист заполняет сколько нужно). */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-purple-600">{'Суточные №1'}</label>
              <div className="grid grid-cols-4 gap-2">
                <input type="number" step="0.01" min="0" value={tripForm.perDiem} onChange={e => setTripForm({...tripForm, perDiem: e.target.value})} className="border rounded-lg px-2 py-1.5 text-sm w-full" placeholder="Сумма" />
                <select value={tripForm.perDiemCurrency} onChange={e => setTripForm({...tripForm, perDiemCurrency: e.target.value, perDiemRate: e.target.value === 'AMD' ? '1' : tripForm.perDiemRate})} className="border rounded-lg px-2 py-1.5 text-sm w-full">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" step="0.0001" min="0" value={tripForm.perDiemRate} onChange={e => setTripForm({...tripForm, perDiemRate: e.target.value})} disabled={tripForm.perDiemCurrency === 'AMD'} className="border rounded-lg px-2 py-1.5 text-sm w-full disabled:opacity-50" placeholder="Курс" />
                <div className="flex items-center text-xs font-mono text-purple-600 pl-1">
                  {tripForm.perDiemCurrency !== 'AMD' && (parseFloat(tripForm.perDiem) || 0) > 0 ? fmtAmd(Math.round((parseFloat(tripForm.perDiem) || 0) * (parseFloat(tripForm.perDiemRate) || 1))) : ''}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-purple-600">{'Суточные №2'}</label>
              <div className="grid grid-cols-4 gap-2">
                <input type="number" step="0.01" min="0" value={tripForm.perDiem2} onChange={e => setTripForm({...tripForm, perDiem2: e.target.value})} className="border rounded-lg px-2 py-1.5 text-sm w-full" placeholder="Сумма" />
                <select value={tripForm.perDiem2Currency} onChange={e => setTripForm({...tripForm, perDiem2Currency: e.target.value, perDiem2Rate: e.target.value === 'AMD' ? '1' : tripForm.perDiem2Rate})} className="border rounded-lg px-2 py-1.5 text-sm w-full">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" step="0.0001" min="0" value={tripForm.perDiem2Rate} onChange={e => setTripForm({...tripForm, perDiem2Rate: e.target.value})} disabled={tripForm.perDiem2Currency === 'AMD'} className="border rounded-lg px-2 py-1.5 text-sm w-full disabled:opacity-50" placeholder="Курс" />
                <div className="flex items-center text-xs font-mono text-purple-600 pl-1">
                  {tripForm.perDiem2Currency !== 'AMD' && (parseFloat(tripForm.perDiem2) || 0) > 0 ? fmtAmd(Math.round((parseFloat(tripForm.perDiem2) || 0) * (parseFloat(tripForm.perDiem2Rate) || 1))) : ''}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-purple-600">{'Суточные №3'}</label>
              <div className="grid grid-cols-4 gap-2">
                <input type="number" step="0.01" min="0" value={tripForm.perDiem3} onChange={e => setTripForm({...tripForm, perDiem3: e.target.value})} className="border rounded-lg px-2 py-1.5 text-sm w-full" placeholder="Сумма" />
                <select value={tripForm.perDiem3Currency} onChange={e => setTripForm({...tripForm, perDiem3Currency: e.target.value, perDiem3Rate: e.target.value === 'AMD' ? '1' : tripForm.perDiem3Rate})} className="border rounded-lg px-2 py-1.5 text-sm w-full">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" step="0.0001" min="0" value={tripForm.perDiem3Rate} onChange={e => setTripForm({...tripForm, perDiem3Rate: e.target.value})} disabled={tripForm.perDiem3Currency === 'AMD'} className="border rounded-lg px-2 py-1.5 text-sm w-full disabled:opacity-50" placeholder="Курс" />
                <div className="flex items-center text-xs font-mono text-purple-600 pl-1">
                  {tripForm.perDiem3Currency !== 'AMD' && (parseFloat(tripForm.perDiem3) || 0) > 0 ? fmtAmd(Math.round((parseFloat(tripForm.perDiem3) || 0) * (parseFloat(tripForm.perDiem3Rate) || 1))) : ''}
                </div>
              </div>
            </div>
            {/* Other expenses row */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-600">{'Прочие'}</label>
              <div className="grid grid-cols-4 gap-2">
                <input type="number" step="0.01" min="0" value={tripForm.otherExpenses} onChange={e => setTripForm({...tripForm, otherExpenses: e.target.value})} className="border rounded-lg px-2 py-1.5 text-sm w-full" placeholder={'Сумма'} />
                <select value={tripForm.otherCurrency} onChange={e => setTripForm({...tripForm, otherCurrency: e.target.value, otherRate: e.target.value === 'AMD' ? '1' : tripForm.otherRate})} className="border rounded-lg px-2 py-1.5 text-sm w-full">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" step="0.0001" min="0" value={tripForm.otherRate} onChange={e => setTripForm({...tripForm, otherRate: e.target.value})} disabled={tripForm.otherCurrency === 'AMD'} className="border rounded-lg px-2 py-1.5 text-sm w-full disabled:opacity-50" placeholder={'Курс'} />
                <div className="flex items-center text-xs font-mono text-slate-600 pl-1">
                  {tripForm.otherCurrency !== 'AMD' && (parseFloat(tripForm.otherExpenses) || 0) > 0 ? fmtAmd(Math.round((parseFloat(tripForm.otherExpenses) || 0) * (parseFloat(tripForm.otherRate) || 1))) : ''}
                </div>
              </div>
            </div>
            {/* Fuel row */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-amber-600">{'Топливо'}</label>
              <div className="grid grid-cols-4 gap-2">
                <div className="flex gap-1">
                  <input type="number" step="0.01" min="0" value={tripForm.fuelCost} onChange={e => setTripForm({...tripForm, fuelCost: e.target.value})} className="border rounded-lg px-2 py-1.5 text-sm w-full" placeholder={'Стоимость'} />
                </div>
                <select value={tripForm.fuelCurrency} onChange={e => setTripForm({...tripForm, fuelCurrency: e.target.value, fuelRate: e.target.value === 'AMD' ? '1' : tripForm.fuelRate})} className="border rounded-lg px-2 py-1.5 text-sm w-full">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" step="0.0001" min="0" value={tripForm.fuelRate} onChange={e => setTripForm({...tripForm, fuelRate: e.target.value})} disabled={tripForm.fuelCurrency === 'AMD'} className="border rounded-lg px-2 py-1.5 text-sm w-full disabled:opacity-50" placeholder={'Курс'} />
                <div className="flex items-center text-xs font-mono text-amber-600 pl-1">
                  {tripForm.fuelCurrency !== 'AMD' && (parseFloat(tripForm.fuelCost) || 0) > 0 ? fmtAmd(Math.round((parseFloat(tripForm.fuelCost) || 0) * (parseFloat(tripForm.fuelRate) || 1))) : ''}
                </div>
              </div>
              <div className="mt-1">
                <input type="number" step="0.01" min="0" value={tripForm.fuelLiters} onChange={e => setTripForm({...tripForm, fuelLiters: e.target.value})} className="border rounded-lg px-2 py-1.5 text-sm w-[140px]" placeholder={'Литры'} />
              </div>
            </div>
            {/* Total AMD preview */}
            {(() => {
              const a = tripExpAmd();
              return a.total > 0 ? (
                <p className="text-xs text-red-600 font-bold mt-1">{'Итого расходы'}: {fmtAmd(a.total)}</p>
              ) : null;
            })()}

            <div>
              <label className="text-xs text-muted-foreground">{'Примечания'}</label>
              <textarea value={tripForm.notes} onChange={e => setTripForm({...tripForm, notes: e.target.value})} rows={2} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowTripModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted">{'Отмена'}</button>
              <button type="button" onClick={saveTripForm} disabled={saving || !tripForm.vehicleId || !tripForm.departureDate}
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (tripForm.id ? 'Сохранить' : 'Создать')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expense Create/Edit Modal (additional fleet expenses) */}
      {showExpModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowExpModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{expForm.id ? 'Редактировать расход' : 'Новый доп. расход'}</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">{'Дата'} *</label>
                <input type="date" value={expForm.date} onChange={e => setExpForm({...expForm, date: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{'Тип расхода'} *</label>
                <select value={expForm.expenseType} onChange={e => setExpForm({...expForm, expenseType: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5">
                  {Object.entries(FLEET_EXPENSE_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            {expForm.expenseType === 'fuel' && (
              <div>
                <label className="text-xs text-muted-foreground">{'Литры'}</label>
                <input type="number" step="0.01" min="0" value={expForm.liters} onChange={e => setExpForm({...expForm, liters: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" placeholder={'Кол-во литров'} />
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">{'Сумма'} *</label>
                <input type="number" step="0.01" min="0" value={expForm.amount} onChange={e => setExpForm({...expForm, amount: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{'Валюта'}</label>
                <select value={expForm.currency} onChange={e => setExpForm({...expForm, currency: e.target.value, exchangeRate: e.target.value === 'AMD' ? '1' : expForm.exchangeRate})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{'Курс'}</label>
                <input type="number" step="0.0001" min="0" value={expForm.exchangeRate} onChange={e => setExpForm({...expForm, exchangeRate: e.target.value})} disabled={expForm.currency === 'AMD'} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5 disabled:opacity-50" />
              </div>
            </div>

            {expForm.currency !== 'AMD' && parseFloat(expForm.amount) > 0 && (
              <p className="text-xs text-blue-600 font-medium">{'→'} {fmtAmd(computedAmountAmd())}</p>
            )}

            <div>
              <label className="text-xs text-muted-foreground">{'Комментарий'}</label>
              <textarea value={expForm.comment} onChange={e => setExpForm({...expForm, comment: e.target.value})} rows={2} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" placeholder={'Необязательно'} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowExpModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted">{'Отмена'}</button>
              <button type="button" onClick={saveExpForm} disabled={expSaving || !expForm.amount || !expForm.expenseType}
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
                {expSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : (expForm.id ? 'Сохранить' : 'Добавить')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
