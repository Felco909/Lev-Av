'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import CrumbLink from '@/components/nav/crumb-link';
import { Plus, Pencil, Trash2, Loader2, Truck, X, ChevronDown, ChevronUp, Fuel, Wallet, Banknote, Archive, AlertTriangle } from 'lucide-react';
import { formatDate, formatCurrency, FLEET_EXPENSE_TYPE_MAP, STATUS_MAP } from '@/lib/utils';

function baseStatusLabel(status: string | null): string {
  if (!status) return '—';
  return status === 'at_base' ? 'На базе' : status === 'away' ? 'В рейсе (вне базы)' : status;
}

function formatDurationHm(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return days > 0 ? `${days} дн ${hours} ч ${minutes} мин` : `${hours} ч ${minutes} мин`;
}

const EVENT_FIELD_LABEL: Record<string, string> = {
  departureDate: 'Дата выезда', returnDate: 'Дата возврата',
  finalRevenueAmd: 'Итоговый доход', finalExpensesAmd: 'Итоговые расходы',
  startMileage: 'Пробег на начало', endMileage: 'Пробег на конец',
  startFuel: 'Топливо на начало', endFuel: 'Топливо на конец', notes: 'Комментарий',
};

/** Журнал ручных правок/закрытия/пересчёта дохода ("Доработка логики рейсов", п.7). */
function manualEventText(ev: { action: string; field: string | null; oldValue: string | null; newValue: string | null }): string {
  if (ev.action === 'closed') return 'Рейс закрыт';
  if (ev.action === 'income_recalculated') return `Пересчёт дохода: ${ev.oldValue ?? '—'} → ${ev.newValue ?? '—'} AMD`;
  if (ev.action === 'manual_edit' && ev.field) {
    const label = EVENT_FIELD_LABEL[ev.field] || ev.field;
    return `${label}: "${ev.oldValue ?? '—'}" → "${ev.newValue ?? '—'}"`;
  }
  return ev.action;
}

interface Vehicle { id: string; plateNumber: string; brand: string; model: string; wialonUnitId?: string | null }
interface Driver { id: string; fullName: string }
interface VT {
  id: string; tripNumber: string; vehicleId: string; driverId: string | null;
  vehicle: Vehicle; driver: Driver | null;
  departureDate: string; departureLat: number | null; departureLon: number | null;
  startMileage: number | null; startFuel: number | null;
  returnDate: string | null; returnLat: number | null; returnLon: number | null;
  endMileage: number | null; endFuel: number | null;
  status: string; notes: string | null;
  calculatedIdleMinutes: number | null;
  geofenceStatus: string | null; geofenceStatusAt: string | null;
  salary: number | null; perDiem: number | null; otherExpenses: number | null;
  perDiem2: number | null; perDiem3: number | null; perDiem4: number | null;
  salaryCurrency: string; salaryRate: number;
  perDiemCurrency: string; perDiemRate: number;
  perDiem2Currency: string; perDiem2Rate: number;
  perDiem3Currency: string; perDiem3Rate: number;
  perDiem4Currency: string; perDiem4Rate: number;
  otherCurrency: string; otherRate: number;
  salaryAmd: number | null; perDiemAmd: number | null; otherExpensesAmd: number | null;
  perDiem2Amd: number | null; perDiem3Amd: number | null; perDiem4Amd: number | null;
  fuelLiters: number | null; fuelCost: number | null;
  fuelCurrency: string; fuelRate: number; fuelCostAmd: number | null;
  calculatedKm: number | null; calculatedFuelConsumedL: number | null;
  fuelCalcSource: string | null; fuelCalcAt: string | null;
  wialonFuelLevelBeginL: number | null; wialonFuelLevelEndL: number | null;
  wialonEngineHoursSec: number | null; wialonAvgFuelConsumptionPer100Km: number | null;
  wialonFillingsCount: number | null; wialonFilledL: number | null;
  wialonTheftsCount: number | null; wialonTheftedL: number | null;
  _count: { trips: number; fleetExpenses: number };
}

interface VTDetail extends VT {
  matchedTrips: any[]; fleetExpenses: any[];
  durationMs: number | null;
  finalRevenueAmd: number | null; finalExpensesAmd: number | null; closedAt: string | null; closedByUserId: string | null;
  revenue: number; totalExpenses: number; expensesByType: Record<string, number>; profit: number; mileage: number | null;
  directSalaryAmd: number; directPerDiemAmd: number; directOtherAmd: number; directFuelAmd: number; directTotalAmd: number; fleetExpTotal: number;
  costPerKm: number | null; fuelPer100Km: number | null; profitMarginPercent: number | null;
}

interface TripForm {
  id?: string; tripNumber: string; vehicleId: string; driverId: string; departureDate: string;
  departureLat: string; departureLon: string;
  startMileage: string; startFuel: string; returnDate: string;
  returnLat: string; returnLon: string;
  endMileage: string; endFuel: string; notes: string; status: string;
  salary: string; perDiem: string; otherExpenses: string;
  perDiem2: string; perDiem3: string; perDiem4: string;
  salaryCurrency: string; salaryRate: string;
  perDiemCurrency: string; perDiemRate: string;
  perDiem2Currency: string; perDiem2Rate: string;
  perDiem3Currency: string; perDiem3Rate: string;
  perDiem4Currency: string; perDiem4Rate: string;
  otherCurrency: string; otherRate: string;
  fuelLiters: string; fuelCost: string;
  fuelCurrency: string; fuelRate: string;
  finalRevenueAmd: string; finalExpensesAmd: string;
}

interface ExpForm {
  id?: string; date: string; expenseType: string; liters: string;
  amount: string; currency: string; exchangeRate: string; comment: string;
}

const CURRENCIES = ['AMD', 'RUB', 'USD', 'GEL', 'EUR'];

// Ереван — фиксированный UTC+4 без перехода на летнее время (подтверждено Get-TimeZone на
// проде: "Caucasus Standard Time", SupportsDaylightSavingTime=False), поэтому смещение можно
// жёстко зашить, не таская Intl/timezone-библиотеку.
const YEREVAN_OFFSET_MS = 4 * 60 * 60 * 1000;

/**
 * UTC-момент (ISO-строка из API или Date) -> "YYYY-MM-DDTHH:mm" местного ереванского времени
 * для value input[type=datetime-local]. Раньше здесь была наивная `.slice(0, 16)` прямо на
 * UTC-строке — это отображало "сырые" UTC-цифры, подписанные как будто местное время, и при
 * любом сохранении формы (сервер тоже в UTC+4 и парсит строку без смещения как своё локальное)
 * дата тихо уезжала на -4 часа, причём накопительно при повторных сохранениях. Проверено вживую
 * 23.07.2026 (закрытие/переоткрытие тестового рейса на проде).
 */
function toYerevanLocalInputValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + YEREVAN_OFFSET_MS).toISOString().slice(0, 16);
}

function wialonHintText(reason?: string, rangeDistanceKm?: number | null): string {
  if (reason === 'too_old') {
    if (rangeDistanceKm != null) {
      return `Дата старше 45 дней — точный одометр по треку недоступен, но пробег рейса по официальному отчёту Wialon: ${Math.round(rangeDistanceKm).toLocaleString('ru-RU')} км (та же цифра, что даёт «Пересчитать по Wialon»). Одометр введите вручную.`;
    }
    return 'Дата слишком старая для расчёта пробега по треку (>45 дней) — введите вручную, либо нажмите «Пересчитать по Wialon» для пробега рейса';
  }
  if (reason === 'wialon_error') return 'Wialon сейчас недоступен — введите вручную';
  return 'Нет данных Wialon на эту дату — введите вручную';
}

const emptyTripForm = (): TripForm => ({
  tripNumber: '', vehicleId: '', driverId: '', departureDate: toYerevanLocalInputValue(new Date()),
  departureLat: '', departureLon: '',
  startMileage: '', startFuel: '', returnDate: '', returnLat: '', returnLon: '',
  endMileage: '', endFuel: '', notes: '', status: 'active',
  salary: '', perDiem: '', otherExpenses: '',
  perDiem2: '', perDiem3: '', perDiem4: '',
  salaryCurrency: 'AMD', salaryRate: '1',
  perDiemCurrency: 'AMD', perDiemRate: '1',
  perDiem2Currency: 'AMD', perDiem2Rate: '1',
  perDiem3Currency: 'AMD', perDiem3Rate: '1',
  perDiem4Currency: 'AMD', perDiem4Rate: '1',
  otherCurrency: 'AMD', otherRate: '1',
  fuelLiters: '', fuelCost: '',
  fuelCurrency: 'AMD', fuelRate: '1',
  finalRevenueAmd: '', finalExpensesAmd: '',
});

/** VT/VTDetail -> TripForm, для заполнения редактируемой формы в развёрнутой карточке. */
function mapVtToForm(r: VT): TripForm {
  return {
    id: r.id, tripNumber: r.tripNumber || '',
    vehicleId: r.vehicleId, driverId: r.driverId || '',
    departureDate: toYerevanLocalInputValue(r.departureDate),
    departureLat: r.departureLat != null ? String(r.departureLat) : '',
    departureLon: r.departureLon != null ? String(r.departureLon) : '',
    startMileage: r.startMileage != null ? String(r.startMileage) : '',
    startFuel: r.startFuel != null ? String(Number(r.startFuel)) : '',
    returnDate: toYerevanLocalInputValue(r.returnDate),
    returnLat: r.returnLat != null ? String(r.returnLat) : '',
    returnLon: r.returnLon != null ? String(r.returnLon) : '',
    endMileage: r.endMileage != null ? String(r.endMileage) : '',
    endFuel: r.endFuel != null ? String(Number(r.endFuel)) : '',
    notes: r.notes || '', status: r.status || 'active',
    salary: r.salary != null ? String(Number(r.salary)) : '',
    perDiem: r.perDiem != null ? String(Number(r.perDiem)) : '',
    perDiem2: r.perDiem2 != null ? String(Number(r.perDiem2)) : '',
    perDiem3: r.perDiem3 != null ? String(Number(r.perDiem3)) : '',
    perDiem4: r.perDiem4 != null ? String(Number(r.perDiem4)) : '',
    otherExpenses: r.otherExpenses != null ? String(Number(r.otherExpenses)) : '',
    salaryCurrency: r.salaryCurrency || 'AMD',
    salaryRate: r.salaryRate != null ? String(Number(r.salaryRate)) : '1',
    perDiemCurrency: r.perDiemCurrency || 'AMD',
    perDiemRate: r.perDiemRate != null ? String(Number(r.perDiemRate)) : '1',
    perDiem2Currency: r.perDiem2Currency || 'AMD',
    perDiem2Rate: r.perDiem2Rate != null ? String(Number(r.perDiem2Rate)) : '1',
    perDiem3Currency: r.perDiem3Currency || 'AMD',
    perDiem3Rate: r.perDiem3Rate != null ? String(Number(r.perDiem3Rate)) : '1',
    perDiem4Currency: r.perDiem4Currency || 'AMD',
    perDiem4Rate: r.perDiem4Rate != null ? String(Number(r.perDiem4Rate)) : '1',
    otherCurrency: r.otherCurrency || 'AMD',
    otherRate: r.otherRate != null ? String(Number(r.otherRate)) : '1',
    fuelLiters: r.fuelLiters != null ? String(Number(r.fuelLiters)) : '',
    fuelCost: r.fuelCost != null ? String(Number(r.fuelCost)) : '',
    fuelCurrency: r.fuelCurrency || 'AMD',
    fuelRate: r.fuelRate != null ? String(Number(r.fuelRate)) : '1',
    finalRevenueAmd: (r as any).finalRevenueAmd != null ? String(Number((r as any).finalRevenueAmd)) : '',
    finalExpensesAmd: (r as any).finalExpensesAmd != null ? String(Number((r as any).finalExpensesAmd)) : '',
  };
}

/** Итого расходов рейса в AMD по значениям произвольной формы (создание/детальная карточка). */
function computeExpAmd(form: TripForm) {
  const sRate = form.salaryCurrency === 'AMD' ? 1 : (parseFloat(form.salaryRate) || 1);
  const pRate = form.perDiemCurrency === 'AMD' ? 1 : (parseFloat(form.perDiemRate) || 1);
  const p2Rate = form.perDiem2Currency === 'AMD' ? 1 : (parseFloat(form.perDiem2Rate) || 1);
  const p3Rate = form.perDiem3Currency === 'AMD' ? 1 : (parseFloat(form.perDiem3Rate) || 1);
  const p4Rate = form.perDiem4Currency === 'AMD' ? 1 : (parseFloat(form.perDiem4Rate) || 1);
  const oRate = form.otherCurrency === 'AMD' ? 1 : (parseFloat(form.otherRate) || 1);
  const fRate = form.fuelCurrency === 'AMD' ? 1 : (parseFloat(form.fuelRate) || 1);
  const s = (parseFloat(form.salary) || 0) * sRate;
  const p1 = (parseFloat(form.perDiem) || 0) * pRate;
  const p2 = (parseFloat(form.perDiem2) || 0) * p2Rate;
  const p3 = (parseFloat(form.perDiem3) || 0) * p3Rate;
  const p4 = (parseFloat(form.perDiem4) || 0) * p4Rate;
  const p = p1 + p2 + p3 + p4;
  const o = (parseFloat(form.otherExpenses) || 0) * oRate;
  const f = (parseFloat(form.fuelCost) || 0) * fRate;
  return { s: Math.round(s), p: Math.round(p), o: Math.round(o), f: Math.round(f), total: Math.round(s + p + o + f) };
}

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

  // Detail view (expanded inline) — теперь это единственное место редактирования всего,
  // кроме самого создания рейса (машина/водитель/даты) — см. detailForm ниже.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VTDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailForm, setDetailForm] = useState<TripForm>(emptyTripForm());
  const [detailSaving, setDetailSaving] = useState(false);

  // Привязка заявок к рейсу (Этап 2 архитектуры "заявка → рейс") — счётчик
  // "ожидают привязки" в шапке, предложение после создания рейса, пикер добавления
  // в развёрнутой карточке, предупреждение при закрытии.
  const [unattachedCount, setUnattachedCount] = useState(0);
  const [suggestTrips, setSuggestTrips] = useState<Array<{ id: string; tripNumber: string; tripDate: string; routeFrom: string; routeTo: string; clientRateAmd: number; clientName: string | null; status: string; currentVehicleTripNumber?: string | null }>>([]);
  // "На оплату"/"Сверка"/"Завершён" — перенос не трогает суммы/статус самой заявки, но
  // диспетчера стоит явно предупредить, что меняется распределение дохода машины между
  // рейсами задним числом (см. lib/vehicle-trips/attach-service.ts ADVANCED_TRIP_STATUSES).
  const ADVANCED_STATUSES = new Set(['awaiting_payment', 'sverka', 'completed']);
  const [suggestForVehicleTripId, setSuggestForVehicleTripId] = useState<string | null>(null);
  const [suggestSelected, setSuggestSelected] = useState<Set<string>>(new Set());
  const [suggestSaving, setSuggestSaving] = useState(false);
  const [closeUnattached, setCloseUnattached] = useState<typeof suggestTrips>([]);
  const [closeUnattachedSelected, setCloseUnattachedSelected] = useState<Set<string>>(new Set());
  const [unattachedOverview, setUnattachedOverview] = useState<Array<{ id: string; tripNumber: string; tripDate: string; routeFrom: string; routeTo: string; clientRateAmd: number; vehicleId: string }> | null>(null);

  const loadUnattachedCount = useCallback(async () => {
    const res = await fetch('/api/trips/unattached');
    const data = await res.json().catch(() => null);
    setUnattachedCount(typeof data?.count === 'number' ? data.count : 0);
  }, []);

  const openUnattachedOverview = async () => {
    const res = await fetch('/api/trips/unattached');
    const data = await res.json().catch(() => null);
    setUnattachedOverview(Array.isArray(data?.trips) ? data.trips : []);
  };

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

  // Живой снимок активного рейса ("Обновить сейчас") — по кнопке, НЕ постоянный автополлинг
  // (тот — отдельная задача, Этап 6 "Онлайн-мониторинг", дублировать его здесь не стал).
  const [liveSnapshot, setLiveSnapshot] = useState<{
    mileageKm: number | null; fuelLevelL: number | null; lat: number | null; lon: number | null;
    speedKmh: number | null; lastMessageAt: string | null;
  } | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  // История событий по геозонам (Этап 7) + журнал ручных правок/закрытия/пересчёта дохода
  // ("Доработка логики рейсов", п.7) — тот же список событий, action различается.
  const [geoEvents, setGeoEvents] = useState<Array<{ id: string; action: string; field: string | null; oldValue: string | null; newValue: string | null; zoneName: string | null; userName: string | null; createdAt: string }>>([]);

  // Закрытие рейса вручную ("Доработка логики рейсов") — кнопка "Закрыть рейс" открывает
  // модалку выбора даты/времени, дальше сервер один раз берёт живой снимок Wialon и замораживает итоги.
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeDateTime, setCloseDateTime] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [tripFormError, setTripFormError] = useState<string | null>(null);
  const [detailSaveError, setDetailSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/vehicles').then(r => r.json()).then(d => setVehicles(Array.isArray(d) ? d : d.vehicles || []));
    fetch('/api/drivers').then(r => r.json()).then(d => setDrivers(Array.isArray(d) ? d : d.drivers || []));
  }, []);

  const fetchWialonSnapshot = useCallback(async (wialonUnitId: string, dateTimeStr: string, otherDateTimeStr?: string) => {
    // dateTimeStr — значение input[type=datetime-local] ("YYYY-MM-DDTHH:mm"), уже полный момент
    // времени (раньше принимали только дату и подставляли фиксированные 12:00).
    const datetime = new Date(dateTimeStr).toISOString();
    let url = `/api/wialon/vehicle-snapshot?wialonUnitId=${encodeURIComponent(wialonUnitId)}&datetime=${encodeURIComponent(datetime)}`;
    // otherDateTimeStr — вторая известная граница рейса (выезд/возврат), нужна серверу, чтобы
    // при "слишком старой" дате посчитать пробег рейса через официальный отчёт Wialon вместо
    // голого отказа (см. rangeDistanceKm в /api/wialon/vehicle-snapshot).
    if (otherDateTimeStr) url += `&rangeDatetime=${encodeURIComponent(new Date(otherDateTimeStr).toISOString())}`;
    const res = await fetch(url);
    return res.json();
  }, []);

  // Wialon-автозаполнение теперь живёт в развёрнутой карточке (detailForm), не в модалке
  // создания — машина в карточке уже известна из detail.vehicle.
  useEffect(() => {
    const wialonUnitId = detail?.vehicle?.wialonUnitId;
    if (!wialonUnitId || !detailForm.departureDate) { setDepartureHint(null); return; }
    let cancelled = false;
    setDepartureSnapshotLoading(true);
    setDepartureHint(null);
    fetchWialonSnapshot(wialonUnitId, detailForm.departureDate, detailForm.returnDate).then(data => {
      if (cancelled) return;
      if (data.available) {
        setDetailForm(prev => ({
          ...prev,
          startMileage: data.mileageKm != null ? String(Math.round(data.mileageKm)) : prev.startMileage,
          startFuel: data.fuelLevelL != null ? String(data.fuelLevelL) : prev.startFuel,
          departureLat: data.lat != null ? String(data.lat) : prev.departureLat,
          departureLon: data.lon != null ? String(data.lon) : prev.departureLon,
        }));
        setDepartureHint(
          data.mileageKm == null && data.rangeDistanceKm != null
            ? wialonHintText('too_old', data.rangeDistanceKm)
            : data.isApproximate
            ? 'Ближайшее найденное показание Wialon не точно на этот момент (машина могла быть вне сети) — проверьте вручную'
            : null
        );
      } else {
        setDepartureHint(wialonHintText(data.reason, data.rangeDistanceKm));
      }
    }).catch(() => { if (!cancelled) setDepartureHint(wialonHintText('wialon_error')); })
      .finally(() => { if (!cancelled) setDepartureSnapshotLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.vehicle?.wialonUnitId, detailForm.departureDate, detailForm.returnDate]);

  useEffect(() => {
    const wialonUnitId = detail?.vehicle?.wialonUnitId;
    if (!wialonUnitId || !detailForm.returnDate) { setReturnHint(null); return; }
    let cancelled = false;
    setReturnSnapshotLoading(true);
    setReturnHint(null);
    fetchWialonSnapshot(wialonUnitId, detailForm.returnDate, detailForm.departureDate).then(data => {
      if (cancelled) return;
      if (data.available) {
        setDetailForm(prev => ({
          ...prev,
          endMileage: data.mileageKm != null ? String(Math.round(data.mileageKm)) : prev.endMileage,
          endFuel: data.fuelLevelL != null ? String(data.fuelLevelL) : prev.endFuel,
          returnLat: data.lat != null ? String(data.lat) : prev.returnLat,
          returnLon: data.lon != null ? String(data.lon) : prev.returnLon,
        }));
        setReturnHint(
          data.mileageKm == null && data.rangeDistanceKm != null
            ? wialonHintText('too_old', data.rangeDistanceKm)
            : data.isApproximate
            ? 'Ближайшее найденное показание Wialon не точно на этот момент (машина могла быть вне сети) — проверьте вручную'
            : null
        );
      } else {
        setReturnHint(wialonHintText(data.reason, data.rangeDistanceKm));
      }
    }).catch(() => { if (!cancelled) setReturnHint(wialonHintText('wialon_error')); })
      .finally(() => { if (!cancelled) setReturnSnapshotLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.vehicle?.wialonUnitId, detailForm.returnDate, detailForm.departureDate]);

  const recalculateFuel = async () => {
    if (!detail?.id) return;
    setRecalculating(true);
    try {
      await fetch(`/api/vehicle-trips/${detail.id}/recalculate-fuel`, { method: 'POST' });
      await loadDetail(detail.id);
    } catch {} finally { setRecalculating(false); }
  };

  const refreshLiveSnapshot = async () => {
    const wialonUnitId = detail?.vehicle?.wialonUnitId;
    if (!wialonUnitId) return;
    setLiveLoading(true);
    setLiveError(null);
    try {
      const res = await fetch(`/api/wialon/vehicle-live?wialonUnitId=${encodeURIComponent(wialonUnitId)}`);
      const data = await res.json();
      if (data.available) {
        setLiveSnapshot(data);
      } else {
        setLiveSnapshot(null);
        setLiveError(data.error || 'Нет данных от Wialon сейчас');
      }
    } catch {
      setLiveError('Wialon сейчас недоступен');
    } finally {
      setLiveLoading(false);
    }
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
  useEffect(() => { loadUnattachedCount(); }, [loadUnattachedCount]);

  // --- Trip CRUD ---
  // Создание — только машина/водитель/даты (см. план). Всё остальное редактируется
  // в развёрнутой карточке (detailForm) после создания, не в этой модалке.
  const openNewTrip = () => { setTripForm(emptyTripForm()); setTripFormError(null); setShowTripModal(true); };

  const saveTripForm = async () => {
    if (!tripForm.vehicleId || !tripForm.departureDate) return;
    setSaving(true);
    setTripFormError(null);
    const res = await fetch('/api/vehicle-trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tripForm),
    });
    const created = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { setTripFormError(created?.error || 'Не удалось создать рейс'); return; }
    setShowTripModal(false); load();
    // Сразу разворачиваем карточку нового рейса — дальше пробег/топливо/расходы
    // заполняются прямо там, не нужно искать отдельную форму редактирования.
    if (created?.id) {
      setExpandedId(created.id); loadDetail(created.id);
      // Предложить привязать заявки этой машины — непривязанные, а также уже привязанные
      // к другому открытому рейсу (перенос сюда), см. архитектуру "заявка → рейс". Без
      // фильтра по датам — диспетчер сам решает, что относится к новому рейсу.
      const unRes = await fetch(`/api/trips/unattached?vehicleId=${created.vehicleId}&excludeVehicleTripId=${created.id}`);
      const unData = await unRes.json().catch(() => null);
      const candidates = Array.isArray(unData?.trips) ? unData.trips : [];
      if (candidates.length > 0) {
        setSuggestTrips(candidates);
        setSuggestForVehicleTripId(created.id);
        setSuggestSelected(new Set());
      }
    }
  };

  // --- Привязка заявок к рейсу (Этап 2) --- excludeVehicleTripId включает в список ещё и
  // заявки, уже привязанные к ДРУГОМУ открытому рейсу этой машины (перенос сюда), не
  // только по-настоящему свободные (см. lib/vehicle-trips/attach-service.ts).
  const openAddTripsPicker = async (vehicleTripId: string, vehicleId: string) => {
    const res = await fetch(`/api/trips/unattached?vehicleId=${vehicleId}&excludeVehicleTripId=${vehicleTripId}`);
    const data = await res.json().catch(() => null);
    setSuggestTrips(Array.isArray(data?.trips) ? data.trips : []);
    setSuggestForVehicleTripId(vehicleTripId);
    setSuggestSelected(new Set());
  };

  const toggleSuggestSelected = (id: string) => {
    setSuggestSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const confirmSuggestAttach = async () => {
    if (!suggestForVehicleTripId || suggestSelected.size === 0) { setSuggestTrips([]); setSuggestForVehicleTripId(null); return; }

    const selected = suggestTrips.filter(t => suggestSelected.has(t.id));
    const moves = selected.filter(t => t.currentVehicleTripNumber);
    const advanced = selected.filter(t => ADVANCED_STATUSES.has(t.status));
    if (moves.length > 0 || advanced.length > 0) {
      const lines: string[] = [];
      if (moves.length > 0) {
        lines.push('Перенос заявок из других рейсов:');
        for (const t of moves) lines.push(`  №${t.tripNumber} (${fmtAmd(t.clientRateAmd)}) — сейчас в рейсе №${t.currentVehicleTripNumber}, доход этого рейса уменьшится на эту сумму`);
      }
      if (advanced.length > 0) {
        lines.push('');
        lines.push('Внимание: часть заявок уже далеко в финансовом статусе (На оплату/Сверка/Завершён):');
        for (const t of advanced) lines.push(`  №${t.tripNumber} — статус «${STATUS_MAP[t.status]?.label || t.status}». Суммы по заявке не изменятся, но изменится распределение дохода между рейсами машины.`);
      }
      lines.push('');
      lines.push('Продолжить?');
      if (!confirm(lines.join('\n'))) return;
    }

    setSuggestSaving(true);
    try {
      await fetch(`/api/vehicle-trips/${suggestForVehicleTripId}/attach-trips`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripIds: Array.from(suggestSelected) }),
      });
      await loadUnattachedCount();
      if (expandedId === suggestForVehicleTripId) await loadDetail(suggestForVehicleTripId);
    } finally {
      setSuggestSaving(false);
      setSuggestTrips([]); setSuggestForVehicleTripId(null); setSuggestSelected(new Set());
    }
  };

  // Открепить заявку от рейса (без переноса в другой — "Заявки: add/remove/replace").
  const [detachingTripId, setDetachingTripId] = useState<string | null>(null);
  const detachTrip = async (tripId: string, tripNumber: string) => {
    if (!confirm(`Открепить заявку №${tripNumber} от этого рейса? Она вернётся в "Ожидают привязки".`)) return;
    setDetachingTripId(tripId);
    try {
      await fetch(`/api/trips/${tripId}/detach`, { method: 'POST' });
      await loadUnattachedCount();
      if (detail?.id) await loadDetail(detail.id);
    } finally {
      setDetachingTripId(null);
    }
  };

  const deleteTrip = async (id: string) => {
    if (!confirm('Удалить рейс машины?')) return;
    setDeleting(id);
    await fetch(`/api/vehicle-trips?id=${id}`, { method: 'DELETE' });
    setDeleting(null);
    if (expandedId === id) { setExpandedId(null); setDetail(null); }
    load();
  };

  // --- Detail / Expand — единственное место редактирования после создания ---
  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    const res = await fetch(`/api/vehicle-trips/${id}`);
    const data = await res.json();
    setDetail(data);
    setDetailForm(mapVtToForm(data));
    setDetailLoading(false);
    fetch(`/api/vehicle-trips/${id}/events`).then(r => r.json()).then(d => setGeoEvents(Array.isArray(d) ? d : [])).catch(() => setGeoEvents([]));
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) { setExpandedId(null); setDetail(null); setDetailForm(emptyTripForm()); }
    else { setExpandedId(id); loadDetail(id); }
    setLiveSnapshot(null); setLiveError(null); setGeoEvents([]);
    setShowCloseModal(false); setCloseError(null);
    setDetailSaveError(null);
  };

  // Рейс полностью редактируем независимо от статуса — доход/расход всегда считаются
  // автоматически (переработка модуля "Рейсы"), никакого отдельного "разморозить и
  // пересчитать" шага больше не требуется.
  const saveDetailForm = async () => {
    if (!detail) return;
    const vehicleChanged = detailForm.vehicleId !== detail.vehicleId;
    setDetailSaving(true);
    setDetailSaveError(null);
    try {
      const res = await fetch('/api/vehicle-trips', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...detailForm, id: detail.id }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        setDetailSaveError(errBody?.error || 'Не удалось сохранить рейс');
        return;
      }
      await loadDetail(detail.id);
      await load();
      // Машину сменили — предложить привязать свободные заявки НОВОЙ машины, тем же
      // образом, что и при создании рейса (см. saveTripForm). При смене машины старых
      // привязанных заявок у рейса уже нет (см. проверку в PUT), так что подходит любой
      // случай "рейс без заявок этой машины".
      if (vehicleChanged) {
        const unRes = await fetch(`/api/trips/unattached?vehicleId=${detailForm.vehicleId}&excludeVehicleTripId=${detail.id}`);
        const unData = await unRes.json().catch(() => null);
        const candidates = Array.isArray(unData?.trips) ? unData.trips : [];
        if (candidates.length > 0) {
          setSuggestTrips(candidates);
          setSuggestForVehicleTripId(detail.id);
          setSuggestSelected(new Set());
        }
      }
    } finally { setDetailSaving(false); }
  };

  // --- Закрытие рейса вручную ("Доработка логики рейсов") ---
  const openCloseModal = () => {
    setCloseDateTime(toYerevanLocalInputValue(new Date()));
    setCloseError(null);
    setCloseUnattached([]); setCloseUnattachedSelected(new Set());
    setShowCloseModal(true);
  };

  const confirmCloseTrip = async (force?: boolean) => {
    if (!detail || !closeDateTime) return;
    setClosing(true);
    setCloseError(null);
    try {
      const res = await fetch(`/api/vehicle-trips/${detail.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnDate: new Date(closeDateTime).toISOString(), force: !!force }),
      });
      const data = await res.json();
      if (res.status === 409 && data?.needsConfirmation) {
        // Непривязанные заявки машины за период рейса — не блокируем закрытие
        // навсегда, показываем список: привязать выбранные или закрыть как есть
        // (см. архитектуру "заявка → рейс").
        setCloseUnattached(Array.isArray(data.unattachedTrips) ? data.unattachedTrips : []);
        setCloseUnattachedSelected(new Set());
        return;
      }
      if (!res.ok) { setCloseError(data.error || 'Ошибка закрытия рейса'); return; }
      setShowCloseModal(false);
      setCloseUnattached([]);
      await loadDetail(detail.id);
      await load();
      await loadUnattachedCount();
    } finally { setClosing(false); }
  };

  const toggleCloseUnattachedSelected = (id: string) => {
    setCloseUnattachedSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const attachSelectedAndRetryClose = async () => {
    if (!detail || closeUnattachedSelected.size === 0) return;
    setClosing(true);
    try {
      await fetch(`/api/vehicle-trips/${detail.id}/attach-trips`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripIds: Array.from(closeUnattachedSelected) }),
      });
      setCloseUnattached([]); setCloseUnattachedSelected(new Set());
      await confirmCloseTrip();
    } finally { setClosing(false); }
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


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{'Рейсы машин'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{'Учёт рейсов, пробега, топлива и расходов'}</p>
          {unattachedCount > 0 && (
            <button type="button" onClick={openUnattachedOverview} className="inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/40 transition">
              <AlertTriangle className="w-3 h-3" /> {`Есть ${unattachedCount} ${unattachedCount === 1 ? 'заявка' : 'заявки'} собственного транспорта, не привязанных ни к одному рейсу`}
            </button>
          )}
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
            <option value="active">{'В работе'}</option>
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
                        }`}>{r.status === 'archived' ? '\u0410\u0440\u0445\u0438\u0432' : isActive ? '\u0412 \u0440\u0430\u0431\u043E\u0442\u0435' : '\u0417\u0430\u0432\u0435\u0440\u0448\u0451\u043D'}</span>
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
                      <button onClick={() => toggleExpand(r.id)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title={'Подробности (редактирование внутри)'}>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
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

                        {/* Производные показатели — считаются на сервере из revenue/totalExpenses/
                            profit/calculatedKm/calculatedFuelConsumedL, ничего нового не хранится */}
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div className="bg-muted/40 rounded-lg p-2">
                            <p className="text-[10px] text-muted-foreground">{'Стоимость км'}</p>
                            <p className="font-medium font-mono">{detail.costPerKm != null ? `${fmtAmd(detail.costPerKm)}/км` : '—'}</p>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-2">
                            <p className="text-[10px] text-muted-foreground">{'Расход топлива'}</p>
                            <p className="font-medium font-mono">{detail.fuelPer100Km != null ? `${detail.fuelPer100Km} л/100км` : '—'}</p>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-2">
                            <p className="text-[10px] text-muted-foreground">{'Рентабельность'}</p>
                            <p className={`font-medium font-mono ${detail.profitMarginPercent != null && detail.profitMarginPercent < 0 ? 'text-red-600' : ''}`}>
                              {detail.profitMarginPercent != null ? `${detail.profitMarginPercent}%` : '—'}
                            </p>
                          </div>
                        </div>

                        {/* Editable: Выезд/Возврат — пробег и топливо, с автозаполнением Wialon */}
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="space-y-2 bg-muted/30 rounded-lg p-2.5">
                            <p className="text-[11px] font-medium text-muted-foreground">{'Выезд'}</p>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[10px] text-muted-foreground">{'Дата и время'} *</label>
                                <input type="datetime-local" value={detailForm.departureDate} onChange={e => setDetailForm({...detailForm, departureDate: e.target.value})} className="border rounded-lg px-2 py-1.5 text-xs w-full mt-0.5 disabled:opacity-60 disabled:bg-muted" />
                              </div>
                              <div>
                                <label className="text-[10px] text-muted-foreground flex items-center gap-1">{'Пробег (км)'} {departureSnapshotLoading && <Loader2 className="w-3 h-3 animate-spin" />}</label>
                                <input type="number" min="0" value={detailForm.startMileage} onChange={e => setDetailForm({...detailForm, startMileage: e.target.value})} className="border rounded-lg px-2 py-1.5 text-xs w-full mt-0.5 disabled:opacity-60 disabled:bg-muted" placeholder={'нач.'} />
                              </div>
                              <div>
                                <label className="text-[10px] text-muted-foreground flex items-center gap-1">{'Топливо (л)'} {departureSnapshotLoading && <Loader2 className="w-3 h-3 animate-spin" />}</label>
                                <input type="number" step="0.01" min="0" value={detailForm.startFuel} onChange={e => setDetailForm({...detailForm, startFuel: e.target.value})} className="border rounded-lg px-2 py-1.5 text-xs w-full mt-0.5 disabled:opacity-60 disabled:bg-muted" placeholder={'остаток'} />
                              </div>
                            </div>
                            {departureHint && <p className="text-[10px] text-amber-600">{departureHint}</p>}
                            {(detailForm.departureLat || detailForm.departureLon) && (
                              <p className="text-[10px] text-muted-foreground font-mono">{'Координаты'}: {detailForm.departureLat}, {detailForm.departureLon}</p>
                            )}
                          </div>
                          <div className="space-y-2 bg-muted/30 rounded-lg p-2.5">
                            <p className="text-[11px] font-medium text-muted-foreground">{'Возврат'}</p>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[10px] text-muted-foreground">{'Дата и время'}</label>
                                <input type="datetime-local" value={detailForm.returnDate} onChange={e => setDetailForm({...detailForm, returnDate: e.target.value})} className="border rounded-lg px-2 py-1.5 text-xs w-full mt-0.5 disabled:opacity-60 disabled:bg-muted" />
                              </div>
                              <div>
                                <label className="text-[10px] text-muted-foreground flex items-center gap-1">{'Пробег (км)'} {returnSnapshotLoading && <Loader2 className="w-3 h-3 animate-spin" />}</label>
                                <input type="number" min="0" value={detailForm.endMileage} onChange={e => setDetailForm({...detailForm, endMileage: e.target.value})} className="border rounded-lg px-2 py-1.5 text-xs w-full mt-0.5 disabled:opacity-60 disabled:bg-muted" placeholder={'кон.'} />
                              </div>
                              <div>
                                <label className="text-[10px] text-muted-foreground flex items-center gap-1">{'Топливо (л)'} {returnSnapshotLoading && <Loader2 className="w-3 h-3 animate-spin" />}</label>
                                <input type="number" step="0.01" min="0" value={detailForm.endFuel} onChange={e => setDetailForm({...detailForm, endFuel: e.target.value})} className="border rounded-lg px-2 py-1.5 text-xs w-full mt-0.5 disabled:opacity-60 disabled:bg-muted" placeholder={'остаток'} />
                              </div>
                            </div>
                            {returnHint && <p className="text-[10px] text-amber-600">{returnHint}</p>}
                            {(detailForm.returnLat || detailForm.returnLon) && (
                              <p className="text-[10px] text-muted-foreground font-mono">{'Координаты'}: {detailForm.returnLat}, {detailForm.returnLon}</p>
                            )}
                          </div>
                        </div>

                        {detail.fleetExpenses.filter((e: any) => e.expenseType === 'fuel' && e.liters).length > 0 && (
                          <p className="text-[11px] text-amber-600">
                            {'Заправлено (доп. расходы)'}: {detail.fleetExpenses.filter((e: any) => e.expenseType === 'fuel' && e.liters).reduce((s: number, e: any) => s + Number(e.liters), 0).toLocaleString('ru-RU')} {'л'}
                          </p>
                        )}

                        {/* Живой снимок активного рейса — по кнопке, не постоянный автополлинг */}
                        {!detail.returnDate && detail.vehicle?.wialonUnitId && (
                          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-xs space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-blue-700 dark:text-blue-400">{'Сейчас (в рейсе)'}</p>
                              <button onClick={refreshLiveSnapshot} disabled={liveLoading} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 border rounded-md hover:bg-muted transition disabled:opacity-50">
                                {liveLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Fuel className="w-3 h-3" />}
                                {'Обновить сейчас'}
                              </button>
                            </div>
                            {liveError && <p className="text-amber-600">{liveError}</p>}
                            {liveSnapshot && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                                <span>{liveSnapshot.mileageKm != null ? `${liveSnapshot.mileageKm.toLocaleString('ru-RU')} км` : '—'}</span>
                                <span>{liveSnapshot.fuelLevelL != null ? `${liveSnapshot.fuelLevelL} л` : '—'}</span>
                                <span>{liveSnapshot.speedKmh != null ? `${liveSnapshot.speedKmh} км/ч` : '—'}</span>
                                <span>{liveSnapshot.lat != null && liveSnapshot.lon != null ? `${liveSnapshot.lat.toFixed(4)}, ${liveSnapshot.lon.toFixed(4)}` : '—'}</span>
                              </div>
                            )}
                            {liveSnapshot?.lastMessageAt && (
                              <p className="text-[10px] text-muted-foreground">{'Последнее сообщение'}: {new Date(liveSnapshot.lastMessageAt).toLocaleString('ru-RU')}</p>
                            )}
                          </div>
                        )}

                        {/* Статус по базе компании (собственная зона TMS, не Wialon-геозона) —
                            меняется автоматически фоновой проверкой каждые 5 минут, не по клику.
                            История — журнал переходов "на базе" / "в рейсе". */}
                        {(detail.geofenceStatus || geoEvents.length > 0) && (
                          <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-3 text-xs space-y-1.5">
                            <p className="font-semibold text-purple-700 dark:text-purple-400">{'Статус по базе компании'}</p>
                            {detail.geofenceStatus && (
                              <p>
                                {baseStatusLabel(detail.geofenceStatus)}
                                {detail.geofenceStatusAt && <span className="text-muted-foreground"> {' — '}{new Date(detail.geofenceStatusAt).toLocaleString('ru-RU')}</span>}
                              </p>
                            )}
                            {geoEvents.filter(ev => ev.action === 'status_changed').length > 0 && (
                              <div className="pt-1 border-t space-y-0.5">
                                {geoEvents.filter(ev => ev.action === 'status_changed').map((ev) => (
                                  <p key={ev.id} className="text-[10px] text-muted-foreground">
                                    {new Date(ev.createdAt).toLocaleString('ru-RU')}
                                    {' — '}
                                    {ev.oldValue ? baseStatusLabel(ev.oldValue) : 'начало'}
                                    {' → '}
                                    {baseStatusLabel(ev.newValue)}
                                    {ev.zoneName && ` (${ev.zoneName})`}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Журнал ручных правок/закрытия/пересчёта дохода — п.7 */}
                        {geoEvents.filter(ev => ev.action !== 'status_changed').length > 0 && (
                          <div className="bg-slate-50 dark:bg-slate-900/30 rounded-lg p-3 text-xs space-y-1">
                            <p className="font-semibold text-slate-700 dark:text-slate-300">{'Журнал изменений'}</p>
                            <div className="space-y-1">
                              {geoEvents.filter(ev => ev.action !== 'status_changed').map((ev) => (
                                <p key={ev.id} className="text-[10px] text-muted-foreground">
                                  {new Date(ev.createdAt).toLocaleString('ru-RU')}
                                  {ev.userName && ` · ${ev.userName}`}
                                  {' — '}{manualEventText(ev)}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Продолжительность рейса — из фактических дат выезда/возврата
                            (по GPS-детекции базы компании, если рейс закрыт автоматически). */}
                        {detail.returnDate && (
                          <p className="text-xs text-muted-foreground">
                            {'Продолжительность рейса: '}
                            <span className="font-medium text-foreground">{formatDurationHm(new Date(detail.returnDate).getTime() - new Date(detail.departureDate).getTime())}</span>
                          </p>
                        )}

                        {/* Закрытие/редактирование рейса ("Доработка логики рейсов", финальная архитектура) —
                            закрытие ТОЛЬКО через кнопку (дата/время выбирает диспетчер, дальше один живой
                            снимок Wialon и заморозка итогов). Автозакрытия по возврату на базу больше нет. */}
                        <div className="flex items-center justify-between gap-2 bg-muted/40 rounded-lg p-2.5">
                          <div className="text-xs">
                            {detail.status === 'completed' ? (
                              <span>
                                <span className="font-semibold text-emerald-700 dark:text-emerald-400">{'Рейс закрыт'}</span>
                                {detail.closedAt && <span className="text-muted-foreground"> {' — '}{new Date(detail.closedAt).toLocaleString('ru-RU')}</span>}
                              </span>
                            ) : (
                              <span className="font-medium">{'Рейс активен'}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => openAddTripsPicker(detail.id, detail.vehicleId)} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted transition">
                              {'Добавить заявки'}
                            </button>
                            {detail.status === 'active' && (
                              <button onClick={openCloseModal} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition">
                                {'Закрыть рейс'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Рейс полностью редактируем независимо от статуса (переработка модуля
                            "Рейсы", 2026-07-23) — машина/водитель тоже доступны для правки, не
                            только даты/расходы/статус. */}
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] text-muted-foreground">{'Машина'}</label>
                            <select value={detailForm.vehicleId} onChange={e => setDetailForm({...detailForm, vehicleId: e.target.value})} className="border rounded-lg px-2 py-1.5 text-xs w-full mt-0.5">
                              {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber} {'—'} {v.brand} {v.model}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] text-muted-foreground">{'Водитель'}</label>
                            <select value={detailForm.driverId} onChange={e => setDetailForm({...detailForm, driverId: e.target.value})} className="border rounded-lg px-2 py-1.5 text-xs w-full mt-0.5">
                              <option value="">{'Не указан'}</option>
                              {drivers.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] text-muted-foreground">{'Статус'}</label>
                            <select value={detailForm.status} onChange={e => setDetailForm({...detailForm, status: e.target.value})} className="border rounded-lg px-2 py-1.5 text-xs w-full mt-0.5">
                              <option value="active">{'В работе'}</option>
                              <option value="completed">{'Завершён'}</option>
                              <option value="archived">{'Архив'}</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] text-muted-foreground">{'Заметки'}</label>
                            <input type="text" value={detailForm.notes} onChange={e => setDetailForm({...detailForm, notes: e.target.value})} className="border rounded-lg px-2 py-1.5 text-xs w-full mt-0.5" />
                          </div>
                        </div>

                        {/* Итоги рейса — автоматический расчёт из Wialon. Рейс полностью редактируем
                            независимо от статуса, поэтому пересчёт доступен всегда. */}
                        {detail.returnDate && (
                          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 text-xs space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-emerald-700 dark:text-emerald-400">{'Итоги рейса'}</p>
                              <button onClick={recalculateFuel} disabled={recalculating} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 border rounded-md hover:bg-muted transition disabled:opacity-50">
                                {recalculating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Fuel className="w-3 h-3" />}
                                {'Пересчитать по Wialon'}
                              </button>
                            </div>
                            {(detail.calculatedKm != null || detail.calculatedFuelConsumedL != null || detail.calculatedIdleMinutes != null) ? (
                              <>
                                <p>{'Пробег: '}{detail.calculatedKm != null ? `${detail.calculatedKm.toLocaleString('ru-RU')} км` : '—'}</p>
                                <p>{'Расход топлива (ДУТ): '}{detail.calculatedFuelConsumedL != null ? `${detail.calculatedFuelConsumedL.toLocaleString('ru-RU')} л` : '—'}</p>
                                <p>{'Ср. расход: '}{detail.wialonAvgFuelConsumptionPer100Km != null ? `${detail.wialonAvgFuelConsumptionPer100Km.toLocaleString('ru-RU')} л/100км` : '—'}</p>
                                <p>{'Уровень топлива: '}{detail.wialonFuelLevelBeginL != null ? `${detail.wialonFuelLevelBeginL.toLocaleString('ru-RU')} л` : '—'}{' → '}{detail.wialonFuelLevelEndL != null ? `${detail.wialonFuelLevelEndL.toLocaleString('ru-RU')} л` : '—'}</p>
                                <p>{'Заправки: '}{detail.wialonFillingsCount != null ? `${detail.wialonFillingsCount}` : '—'}{detail.wialonFilledL != null ? ` (всего ${detail.wialonFilledL.toLocaleString('ru-RU')} л)` : ''}</p>
                                <p>{'Сливы: '}{detail.wialonTheftsCount != null ? `${detail.wialonTheftsCount}` : '—'}{detail.wialonTheftedL != null ? ` (всего ${detail.wialonTheftedL.toLocaleString('ru-RU')} л)` : ''}</p>
                                <p>{'Моточасы: '}{detail.wialonEngineHoursSec != null ? `${Math.floor(detail.wialonEngineHoursSec / 3600)} ч ${Math.round((detail.wialonEngineHoursSec % 3600) / 60)} мин` : '—'}</p>
                                <p>{'Простой: '}{detail.calculatedIdleMinutes != null ? `${Math.floor(detail.calculatedIdleMinutes / 60)} ч ${Math.round(detail.calculatedIdleMinutes % 60)} мин` : '—'}</p>
                                <p className="text-muted-foreground">{'По данным Wialon за период с даты выезда до даты возврата.'}</p>
                                {detail.fuelCalcAt && (
                                  <p className="text-[10px] text-muted-foreground">
                                    {'Рассчитано: '}{new Date(detail.fuelCalcAt).toLocaleString('ru-RU')}
                                    {' — трекер может досылать данные с задержкой (например, после зон без покрытия), при сомнениях доступен повторный пересчёт.'}
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="text-amber-600">{'Не рассчитано — официальный отчёт Wialon недоступен для этого периода.'}</p>
                            )}
                          </div>
                        )}

                        {/* Editable expenses block */}
                        <div>
                          <p className="text-xs font-semibold flex items-center gap-1 mb-2"><Banknote className="w-3.5 h-3.5" /> {'Расходы по рейсу'}</p>
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-blue-600">{'Зарплата'}</label>
                              <div className="grid grid-cols-4 gap-2">
                                <input type="number" step="0.01" min="0" value={detailForm.salary} onChange={e => setDetailForm({...detailForm, salary: e.target.value})} className="border rounded-lg px-2 py-1.5 text-sm w-full" placeholder="Сумма" />
                                <select value={detailForm.salaryCurrency} onChange={e => setDetailForm({...detailForm, salaryCurrency: e.target.value, salaryRate: e.target.value === 'AMD' ? '1' : detailForm.salaryRate})} className="border rounded-lg px-2 py-1.5 text-sm w-full">
                                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <input type="number" step="0.0001" min="0" value={detailForm.salaryRate} onChange={e => setDetailForm({...detailForm, salaryRate: e.target.value})} disabled={detailForm.salaryCurrency === 'AMD'} className="border rounded-lg px-2 py-1.5 text-sm w-full disabled:opacity-50" placeholder="Курс" />
                                <div className="flex items-center text-xs font-mono text-blue-600 pl-1">
                                  {detailForm.salaryCurrency !== 'AMD' && (parseFloat(detailForm.salary) || 0) > 0 ? fmtAmd(Math.round((parseFloat(detailForm.salary) || 0) * (parseFloat(detailForm.salaryRate) || 1))) : ''}
                                </div>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-purple-600">{'Суточные №1'}</label>
                              <div className="grid grid-cols-4 gap-2">
                                <input type="number" step="0.01" min="0" value={detailForm.perDiem} onChange={e => setDetailForm({...detailForm, perDiem: e.target.value})} className="border rounded-lg px-2 py-1.5 text-sm w-full" placeholder="Сумма" />
                                <select value={detailForm.perDiemCurrency} onChange={e => setDetailForm({...detailForm, perDiemCurrency: e.target.value, perDiemRate: e.target.value === 'AMD' ? '1' : detailForm.perDiemRate})} className="border rounded-lg px-2 py-1.5 text-sm w-full">
                                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <input type="number" step="0.0001" min="0" value={detailForm.perDiemRate} onChange={e => setDetailForm({...detailForm, perDiemRate: e.target.value})} disabled={detailForm.perDiemCurrency === 'AMD'} className="border rounded-lg px-2 py-1.5 text-sm w-full disabled:opacity-50" placeholder="Курс" />
                                <div className="flex items-center text-xs font-mono text-purple-600 pl-1">
                                  {detailForm.perDiemCurrency !== 'AMD' && (parseFloat(detailForm.perDiem) || 0) > 0 ? fmtAmd(Math.round((parseFloat(detailForm.perDiem) || 0) * (parseFloat(detailForm.perDiemRate) || 1))) : ''}
                                </div>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-purple-600">{'Суточные №2'}</label>
                              <div className="grid grid-cols-4 gap-2">
                                <input type="number" step="0.01" min="0" value={detailForm.perDiem2} onChange={e => setDetailForm({...detailForm, perDiem2: e.target.value})} className="border rounded-lg px-2 py-1.5 text-sm w-full" placeholder="Сумма" />
                                <select value={detailForm.perDiem2Currency} onChange={e => setDetailForm({...detailForm, perDiem2Currency: e.target.value, perDiem2Rate: e.target.value === 'AMD' ? '1' : detailForm.perDiem2Rate})} className="border rounded-lg px-2 py-1.5 text-sm w-full">
                                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <input type="number" step="0.0001" min="0" value={detailForm.perDiem2Rate} onChange={e => setDetailForm({...detailForm, perDiem2Rate: e.target.value})} disabled={detailForm.perDiem2Currency === 'AMD'} className="border rounded-lg px-2 py-1.5 text-sm w-full disabled:opacity-50" placeholder="Курс" />
                                <div className="flex items-center text-xs font-mono text-purple-600 pl-1">
                                  {detailForm.perDiem2Currency !== 'AMD' && (parseFloat(detailForm.perDiem2) || 0) > 0 ? fmtAmd(Math.round((parseFloat(detailForm.perDiem2) || 0) * (parseFloat(detailForm.perDiem2Rate) || 1))) : ''}
                                </div>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-purple-600">{'Суточные №3'}</label>
                              <div className="grid grid-cols-4 gap-2">
                                <input type="number" step="0.01" min="0" value={detailForm.perDiem3} onChange={e => setDetailForm({...detailForm, perDiem3: e.target.value})} className="border rounded-lg px-2 py-1.5 text-sm w-full" placeholder="Сумма" />
                                <select value={detailForm.perDiem3Currency} onChange={e => setDetailForm({...detailForm, perDiem3Currency: e.target.value, perDiem3Rate: e.target.value === 'AMD' ? '1' : detailForm.perDiem3Rate})} className="border rounded-lg px-2 py-1.5 text-sm w-full">
                                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <input type="number" step="0.0001" min="0" value={detailForm.perDiem3Rate} onChange={e => setDetailForm({...detailForm, perDiem3Rate: e.target.value})} disabled={detailForm.perDiem3Currency === 'AMD'} className="border rounded-lg px-2 py-1.5 text-sm w-full disabled:opacity-50" placeholder="Курс" />
                                <div className="flex items-center text-xs font-mono text-purple-600 pl-1">
                                  {detailForm.perDiem3Currency !== 'AMD' && (parseFloat(detailForm.perDiem3) || 0) > 0 ? fmtAmd(Math.round((parseFloat(detailForm.perDiem3) || 0) * (parseFloat(detailForm.perDiem3Rate) || 1))) : ''}
                                </div>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-purple-600">{'Суточные №4'}</label>
                              <div className="grid grid-cols-4 gap-2">
                                <input type="number" step="0.01" min="0" value={detailForm.perDiem4} onChange={e => setDetailForm({...detailForm, perDiem4: e.target.value})} className="border rounded-lg px-2 py-1.5 text-sm w-full" placeholder="Сумма" />
                                <select value={detailForm.perDiem4Currency} onChange={e => setDetailForm({...detailForm, perDiem4Currency: e.target.value, perDiem4Rate: e.target.value === 'AMD' ? '1' : detailForm.perDiem4Rate})} className="border rounded-lg px-2 py-1.5 text-sm w-full">
                                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <input type="number" step="0.0001" min="0" value={detailForm.perDiem4Rate} onChange={e => setDetailForm({...detailForm, perDiem4Rate: e.target.value})} disabled={detailForm.perDiem4Currency === 'AMD'} className="border rounded-lg px-2 py-1.5 text-sm w-full disabled:opacity-50" placeholder="Курс" />
                                <div className="flex items-center text-xs font-mono text-purple-600 pl-1">
                                  {detailForm.perDiem4Currency !== 'AMD' && (parseFloat(detailForm.perDiem4) || 0) > 0 ? fmtAmd(Math.round((parseFloat(detailForm.perDiem4) || 0) * (parseFloat(detailForm.perDiem4Rate) || 1))) : ''}
                                </div>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-slate-600">{'Прочие'}</label>
                              <div className="grid grid-cols-4 gap-2">
                                <input type="number" step="0.01" min="0" value={detailForm.otherExpenses} onChange={e => setDetailForm({...detailForm, otherExpenses: e.target.value})} className="border rounded-lg px-2 py-1.5 text-sm w-full" placeholder={'Сумма'} />
                                <select value={detailForm.otherCurrency} onChange={e => setDetailForm({...detailForm, otherCurrency: e.target.value, otherRate: e.target.value === 'AMD' ? '1' : detailForm.otherRate})} className="border rounded-lg px-2 py-1.5 text-sm w-full">
                                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <input type="number" step="0.0001" min="0" value={detailForm.otherRate} onChange={e => setDetailForm({...detailForm, otherRate: e.target.value})} disabled={detailForm.otherCurrency === 'AMD'} className="border rounded-lg px-2 py-1.5 text-sm w-full disabled:opacity-50" placeholder={'Курс'} />
                                <div className="flex items-center text-xs font-mono text-slate-600 pl-1">
                                  {detailForm.otherCurrency !== 'AMD' && (parseFloat(detailForm.otherExpenses) || 0) > 0 ? fmtAmd(Math.round((parseFloat(detailForm.otherExpenses) || 0) * (parseFloat(detailForm.otherRate) || 1))) : ''}
                                </div>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-amber-600">{'Топливо'}</label>
                              <div className="grid grid-cols-4 gap-2">
                                <input type="number" step="0.01" min="0" value={detailForm.fuelCost} onChange={e => setDetailForm({...detailForm, fuelCost: e.target.value})} className="border rounded-lg px-2 py-1.5 text-sm w-full" placeholder={'Стоимость'} />
                                <select value={detailForm.fuelCurrency} onChange={e => setDetailForm({...detailForm, fuelCurrency: e.target.value, fuelRate: e.target.value === 'AMD' ? '1' : detailForm.fuelRate})} className="border rounded-lg px-2 py-1.5 text-sm w-full">
                                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <input type="number" step="0.0001" min="0" value={detailForm.fuelRate} onChange={e => setDetailForm({...detailForm, fuelRate: e.target.value})} disabled={detailForm.fuelCurrency === 'AMD'} className="border rounded-lg px-2 py-1.5 text-sm w-full disabled:opacity-50" placeholder={'Курс'} />
                                <div className="flex items-center text-xs font-mono text-amber-600 pl-1">
                                  {detailForm.fuelCurrency !== 'AMD' && (parseFloat(detailForm.fuelCost) || 0) > 0 ? fmtAmd(Math.round((parseFloat(detailForm.fuelCost) || 0) * (parseFloat(detailForm.fuelRate) || 1))) : ''}
                                </div>
                              </div>
                              <div className="mt-1">
                                <input type="number" step="0.01" min="0" value={detailForm.fuelLiters} onChange={e => setDetailForm({...detailForm, fuelLiters: e.target.value})} className="border rounded-lg px-2 py-1.5 text-sm w-[140px]" placeholder={'Литры'} />
                              </div>
                            </div>
                          </div>
                          {(() => {
                            const a = computeExpAmd(detailForm);
                            return a.total > 0 ? (
                              <p className="text-xs text-red-600 font-bold mt-2">{'Итого расходы'}: {fmtAmd(a.total)}</p>
                            ) : null;
                          })()}
                          {detailSaveError && <p className="text-xs text-red-600 mt-2">{detailSaveError}</p>}
                          <div className="flex justify-end mt-3">
                            <button type="button" onClick={saveDetailForm} disabled={detailSaving}
                              className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5">
                              {detailSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {'Сохранить'}
                            </button>
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

                        {/* Заявки рейса — доход считается ВСЕГДА автоматически как сумма привязанных
                            заявок (Trip.vehicleTripId), независимо от статуса рейса. */}
                        <div>
                          <p className="text-xs font-semibold mb-1">
                            {'Заявки'} ({detail.matchedTrips?.length ?? 0})
                          </p>
                          {detail.matchedTrips?.length > 0 ? (
                            <div className="space-y-1">
                              {detail.matchedTrips.map((t: any) => (
                                <div key={t.id} className="flex items-center gap-1 bg-muted/30 rounded-lg pr-1 hover:bg-muted/50 transition-colors">
                                  <CrumbLink href={`/trips/${t.id}`} fromLabel="Рейсы машин" fromKey="vehicle-trips" className="flex-1 min-w-0 flex items-center justify-between px-3 py-1.5 text-xs">
                                    <span className="truncate"><span className="font-mono font-medium">{t.tripNumber}</span> {t.routeFrom} {'→'} {t.routeTo} <span className="text-muted-foreground">({t.clientName})</span></span>
                                    <span className="font-mono text-emerald-600 ml-2 whitespace-nowrap">{fmtAmd(Number(t.clientRateAmd || 0))}</span>
                                  </CrumbLink>
                                  <button type="button" onClick={() => detachTrip(t.id, t.tripNumber)} disabled={detachingTripId === t.id}
                                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 flex-shrink-0" title={'Открепить от рейса'}>
                                    {detachingTripId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3 text-red-500" />}
                                  </button>
                                </div>
                              ))}
                              <div className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold">
                                <span>{'ИТОГО'}</span>
                                <span className="font-mono text-emerald-700 dark:text-emerald-400">{fmtAmd(detail.revenue)}</span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground py-2 text-center">{'Ни одной заявки не привязано к этому рейсу.'}</p>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Close Trip Modal — ручное закрытие ("Доработка логики рейсов") */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !closing && setShowCloseModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{'Закрыть рейс'}</h2>
            <p className="text-xs text-muted-foreground -mt-2">
              {'Выберите дату и время окончания. Система один раз запросит из Wialon пробег/топливо/координаты и зафиксирует итоги — дальше они не будут меняться автоматически.'}
            </p>
            <div>
              <label className="text-xs text-muted-foreground">{'Дата и время закрытия'} *</label>
              <input type="datetime-local" value={closeDateTime} onChange={e => setCloseDateTime(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" />
            </div>
            {closeError && <p className="text-xs text-red-600">{closeError}</p>}
            {closeUnattached.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  {'Найдены непривязанные заявки этой машины за период рейса — привязать к этому рейсу или оставить как есть?'}
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {closeUnattached.map(t => (
                    <label key={t.id} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={closeUnattachedSelected.has(t.id)} onChange={() => toggleCloseUnattachedSelected(t.id)} />
                      <span className="font-mono">{t.tripNumber}</span>
                      <span className="text-muted-foreground">{formatDate(t.tripDate)}</span>
                      <span className="font-mono ml-auto">{fmtAmd(t.clientRateAmd)}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <button onClick={() => confirmCloseTrip(true)} disabled={closing} className="px-3 py-1.5 text-xs rounded-lg border hover:bg-muted transition disabled:opacity-50">{'Закрыть как есть'}</button>
                  <button onClick={attachSelectedAndRetryClose} disabled={closing || closeUnattachedSelected.size === 0} className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50">{'Привязать выбранные'}</button>
                </div>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowCloseModal(false)} disabled={closing} className="px-4 py-2 text-sm rounded-lg border hover:bg-muted transition disabled:opacity-50">{'Отмена'}</button>
              <button onClick={() => confirmCloseTrip()} disabled={closing || !closeDateTime || closeUnattached.length > 0} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition">
                {closing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{'Закрыть рейс'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Обзор "Ожидают привязки к рейсу" — только просмотр, привязка через карточку рейса */}
      {unattachedOverview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setUnattachedOverview(null)}>
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{'Заявки, ожидающие привязки к рейсу'}</h2>
            <p className="text-xs text-muted-foreground -mt-1">{'Машина назначена, но рейс ещё не привязан — привязать можно из карточки нужного рейса кнопкой «Добавить заявки».'}</p>
            <div className="max-h-96 overflow-y-auto divide-y">
              {unattachedOverview.map(t => {
                const v = vehicles.find(vv => vv.id === t.vehicleId);
                return (
                  <div key={t.id} className="flex items-center gap-2 py-2 text-xs">
                    <span className="font-mono font-medium">{t.tripNumber}</span>
                    <span className="text-muted-foreground">{v?.plateNumber || t.vehicleId}</span>
                    <span className="text-muted-foreground">{formatDate(t.tripDate)}</span>
                    <span className="font-mono ml-auto">{fmtAmd(t.clientRateAmd)}</span>
                  </div>
                );
              })}
              {unattachedOverview.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">{'Нет непривязанных заявок'}</p>}
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setUnattachedOverview(null)} className="px-4 py-2 text-sm rounded-lg border hover:bg-muted transition">{'Закрыть'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Пикер массовой привязки заявок к рейсу — предложение после создания рейса
          и кнопка "Добавить заявки" в развёрнутой карточке */}
      {suggestForVehicleTripId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setSuggestTrips([]); setSuggestForVehicleTripId(null); }}>
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{'Привязать заявки к рейсу'}</h2>
            <p className="text-xs text-muted-foreground -mt-1">{'Заявки этой машины (отсортированы по дате) — свободные и уже привязанные к другому открытому рейсу (перенос сюда). Отметьте нужные.'}</p>
            <div className="max-h-96 overflow-y-auto divide-y">
              {suggestTrips.map(t => (
                <label key={t.id} className="flex items-center gap-2 py-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={suggestSelected.has(t.id)} onChange={() => toggleSuggestSelected(t.id)} />
                  <span className="font-mono font-medium">{t.tripNumber}</span>
                  <span className="text-muted-foreground">{formatDate(t.tripDate)}</span>
                  <span className="text-muted-foreground truncate">{t.routeFrom} → {t.routeTo}</span>
                  {t.currentVehicleTripNumber && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 whitespace-nowrap">
                      {`уже в рейсе №${t.currentVehicleTripNumber}`}
                    </span>
                  )}
                  {ADVANCED_STATUSES.has(t.status) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 whitespace-nowrap">
                      {STATUS_MAP[t.status]?.label || t.status}
                    </span>
                  )}
                  <span className="font-mono ml-auto">{fmtAmd(t.clientRateAmd)}</span>
                </label>
              ))}
              {suggestTrips.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">{'Нет заявок для привязки/переноса'}</p>}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => { setSuggestTrips([]); setSuggestForVehicleTripId(null); }} disabled={suggestSaving} className="px-4 py-2 text-sm rounded-lg border hover:bg-muted transition disabled:opacity-50">{'Отмена'}</button>
              <button onClick={confirmSuggestAttach} disabled={suggestSaving || suggestSelected.size === 0} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition">
                {suggestSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{'Привязать выбранные'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trip Create/Edit Modal */}
      {showTripModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowTripModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{'Новый рейс машины'}</h2>
            <p className="text-xs text-muted-foreground -mt-2">{'Пробег, топливо, расходы и статус заполняются потом — в развёрнутой карточке рейса.'}</p>

            <div>
              <label className="text-xs text-muted-foreground">{'№ рейса'}</label>
              <input type="text" value={tripForm.tripNumber} onChange={e => setTripForm({...tripForm, tripNumber: e.target.value})}
                className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5 font-mono" placeholder={'авто — следующий номер этой машины'} />
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">{'Дата и время выезда'} *</label>
                <input type="datetime-local" value={tripForm.departureDate} onChange={e => setTripForm({...tripForm, departureDate: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{'Дата и время возврата'}</label>
                <input type="datetime-local" value={tripForm.returnDate} onChange={e => setTripForm({...tripForm, returnDate: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" />
              </div>
            </div>

            {tripFormError && <p className="text-xs text-red-600">{tripFormError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowTripModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted">{'Отмена'}</button>
              <button type="button" onClick={saveTripForm} disabled={saving || !tripForm.vehicleId || !tripForm.departureDate}
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Создать'}
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
