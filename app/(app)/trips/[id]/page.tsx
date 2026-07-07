'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Pencil, MapPin, Package, Truck, Building2, DollarSign, FileText, Loader2, Paperclip, Download, X, ChevronRight, ClipboardList, Copy, Fuel, Wrench, Info, Lock } from 'lucide-react';
import { formatCurrency, formatCurrencyRaw, formatDate, STATUS_MAP, STATUS_ORDER, TRIP_TYPE_MAP } from '@/lib/utils';
import { generateSumInWordsLine } from '@/lib/number-to-words';
import Breadcrumbs from '@/components/nav/breadcrumbs';
import SmartBackButton from '@/components/nav/smart-back';

function TripHistory({ tripId }: { tripId: string }) {
  const [history, setHistory] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadHistory = useCallback(async () => {
    if (loaded) return;
    try {
      const res = await fetch(`/api/trips/${tripId}/history`);
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch {} finally { setLoaded(true); }
  }, [tripId, loaded]);

  const toggle = () => {
    if (!open) loadHistory();
    setOpen(!open);
  };

  const FIELD_LABELS: Record<string, string> = {
    clientId: 'Клиент', routeFrom: 'Откуда', routeTo: 'Куда', tripType: 'Тип',
    clientRate: 'Ставка', vehicleId: 'Машина', driverId: 'Водитель', carrierId: 'Перевозчик',
    carrierRate: 'Ставка перевоз.', status: 'Статус', tripDate: 'Дата', distance: 'Расстояние',
    cargoWeight: 'Вес груза',
  };

  const ACTION_LABELS: Record<string, string> = {
    created: 'Создан', updated: 'Изменён', status_changed: 'Статус изменён',
  };

  return (
    <div className="bg-card rounded-xl shadow-sm">
      <button onClick={toggle} className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition rounded-xl">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" /> История изменений
        </h3>
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5">
          {!loaded ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Нет записей</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {history.map((h: any) => (
                <div key={h.id} className="flex gap-3 text-xs">
                  <div className="w-1 rounded-full bg-primary/30 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{h.userName || 'Система'}</span>
                      <span className="text-muted-foreground">{ACTION_LABELS[h.action] || h.action}</span>
                      {h.field && <span className="px-1.5 py-0.5 bg-muted rounded text-[10px]">{FIELD_LABELS[h.field] || h.field}</span>}
                      <span className="text-muted-foreground ml-auto text-[10px]">{new Date(h.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {h.oldValue != null && h.newValue != null && (
                      <p className="text-muted-foreground mt-0.5">
                        <span className="line-through text-red-400">{h.oldValue}</span> → <span className="text-green-600">{h.newValue}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  description: string | null;
  uploadedAt: string;
  downloadUrl: string;
}

const CUR_SYMBOLS: Record<string, string> = { AMD: '֏', USD: '$', RUB: '₽', EUR: '€', GEL: '₾' };

interface PaymentItem {
  id: string;
  type: string;
  amount: number;
  amountAmd: number;
  currency: string;
  exchangeRate: number;
  paymentDate: string;
  description: string | null;
}

function TripFinance({ trip }: { trip: any }) {
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loadingPay, setLoadingPay] = useState(true);
  const isExpedition = trip?.tripType === 'expedition';

  // ---- Trip rate data ----
  const clientRate = Number(trip?.clientRate ?? 0);
  const clientCurrency = trip?.currency || 'AMD';
  const clientExRate = Number(trip?.exchangeRate ?? 1);
  const clientRateAmd = Number(trip?.clientRateAmd ?? clientRate);
  const clientIsMultiCur = clientCurrency !== 'AMD';

  const carrierRate = Number(trip?.carrierRate ?? 0);
  const carrierCurrency = trip?.carrierCurrency || clientCurrency;
  const carrierExRate = Number(trip?.carrierExchangeRate ?? clientExRate);
  const carrierRateAmd = Number(trip?.carrierRateAmd ?? carrierRate);
  const carrierIsMultiCur = carrierCurrency !== 'AMD';

  // ---- Expenses split by __carrier__ marker ----
  const allExpenses: any[] = Array.isArray(trip?.expenses) ? trip.expenses : [];
  const clientExpenses = allExpenses.filter((e: any) => e?.description !== '__carrier__');
  const carrierExpenses = allExpenses.filter((e: any) => e?.description === '__carrier__');
  const clientExpensesAmd = clientExpenses.reduce((s: number, e: any) => s + Number(e?.amountAmd ?? e?.amount ?? 0), 0);
  const carrierExpensesAmd = carrierExpenses.reduce((s: number, e: any) => s + Number(e?.amountAmd ?? e?.amount ?? 0), 0);
  const totalClientAmd = Math.round((clientRateAmd + clientExpensesAmd) * 100) / 100;
  const totalCarrierAmd = isExpedition ? Math.round((carrierRateAmd + carrierExpensesAmd) * 100) / 100 : 0;
  const profitAmd = Math.round((totalClientAmd - totalCarrierAmd) * 100) / 100;

  // Load payments
  const loadPayments = useCallback(async () => {
    try {
      const res = await fetch(`/api/payments?tripId=${trip.id}`);
      const data = await res.json();
      setPayments(Array.isArray(data) ? data : []);
    } catch {} finally { setLoadingPay(false); }
  }, [trip?.id]);

  useEffect(() => { if (trip?.id) loadPayments(); }, [trip?.id, loadPayments]);

  const clientPayments = payments.filter(p => p.type === 'client');
  const carrierPayments = payments.filter(p => p.type === 'carrier');

  const clientPaidAmd = clientPayments.reduce((s, p) => s + (p.amountAmd || 0), 0);
  const clientRemaining = Math.max(0, totalClientAmd - clientPaidAmd);
  const carrierPaidAmd = carrierPayments.reduce((s, p) => s + (p.amountAmd || 0), 0);
  const carrierRemaining = Math.max(0, totalCarrierAmd - carrierPaidAmd);

  // Cash gap: carrier paid out more than received from client
  const hasCashGap = isExpedition && carrierPaidAmd > clientPaidAmd;
  const cashGap = hasCashGap ? Math.round((carrierPaidAmd - clientPaidAmd) * 100) / 100 : 0;

  const fmt = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return d; }
  };

  const EXPENSE_TYPE_LABELS: Record<string, string> = {
    fuel: 'Топливо', salary: 'Зарплата', per_diem: 'Суточные', toll: 'Платные дороги',
    ferry: 'Паром', repair: 'Ремонт', parking: 'Стоянка', downtime: 'Простой',
    insurance: 'Страховка', other: 'Прочее',
  };

  const SummaryRow = ({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: 'green' | 'red' | 'debt' | null }) => {
    let cls = 'bg-muted/50';
    if (highlight === 'green') cls = 'text-green-700 dark:text-green-400 bg-muted/50';
    if (highlight === 'debt') cls = 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/30 font-bold';
    if (highlight === 'red') cls = 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/30 font-bold';
    return (
      <div className="flex items-center justify-between gap-3">
        <span className={`text-sm ${highlight === 'debt' || highlight === 'red' ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
        <div className="text-right">
          <span className={`text-sm font-mono font-medium px-3 py-1.5 rounded-lg inline-block min-w-[130px] text-right ${cls}`}>{value}</span>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5 text-right pr-3">{sub}</p>}
        </div>
      </div>
    );
  };

  const renderExpenseList = (items: any[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1 mt-1">
        {items.map((e: any, idx: number) => {
          const label = EXPENSE_TYPE_LABELS[e.expenseType] || e.expenseType || 'Прочее';
          const amt = Number(e.amount ?? 0);
          const cur = e.currency || 'AMD';
          const rate = Number(e.exchangeRate ?? 1);
          const amd = Number(e.amountAmd ?? amt);
          return (
            <div key={idx} className="flex items-center justify-between text-xs px-2 py-1 bg-muted/30 rounded">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono">
                {cur !== 'AMD'
                  ? `${fmt(amt)} ${CUR_SYMBOLS[cur] || cur} × ${rate} = ${fmt(amd)} ֏`
                  : `${fmt(amd)} ֏`}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPaymentList = (items: PaymentItem[], accentColor: string) => {
    if (items.length === 0) return <p className="text-xs text-muted-foreground italic py-1">Нет оплат</p>;
    return (
      <div className="space-y-2">
        {items.map(p => (
          <div key={p.id} className="bg-muted/30 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-muted-foreground shrink-0">{fmtDate(p.paymentDate)}</span>
              <span className="font-mono font-semibold">{fmt(p.amount)} {CUR_SYMBOLS[p.currency] || p.currency}</span>
              {p.currency !== 'AMD' && (
                <span className="text-muted-foreground">
                  × {Number(p.exchangeRate)} → <span className={`font-semibold ${accentColor}`}>{fmt(p.amountAmd)} ֏</span>
                </span>
              )}
            </div>
            {p.description && (
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{p.description}</p>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (loadingPay) return <div className="bg-card rounded-xl shadow-sm p-5 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="bg-card rounded-xl shadow-sm p-5 space-y-5">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-primary" /> Финансы
      </h3>

      {/* ═══ 3 карточки: Доход / Расход / Прибыль ═══ */}
      <div className={`grid ${isExpedition ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
        <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
          <p className="text-[10px] text-muted-foreground uppercase mb-1">Доход</p>
          <p className="text-sm font-bold font-mono text-blue-700 dark:text-blue-300">{fmt(totalClientAmd)} ֏</p>
        </div>
        {isExpedition && (
          <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Расход</p>
            <p className="text-sm font-bold font-mono text-orange-700 dark:text-orange-300">{fmt(totalCarrierAmd)} ֏</p>
          </div>
        )}
        <div className={`text-center p-3 rounded-lg ${profitAmd >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}>
          <p className="text-[10px] text-muted-foreground uppercase mb-1">Прибыль</p>
          <p className={`text-sm font-bold font-mono ${profitAmd >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>{fmt(profitAmd)} ֏</p>
        </div>
      </div>

      {/* ═══ Кассовый разрыв ═══ */}
      {hasCashGap && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-300 dark:border-yellow-700 rounded-lg text-sm">
          <span>⚠️</span>
          <span className="text-yellow-800 dark:text-yellow-300">
            <span className="font-semibold">Кассовый разрыв —</span>{' '}
            Выплачено: {fmt(carrierPaidAmd)} ֏ · Получено: {fmt(clientPaidAmd)} ֏ · Разрыв: {fmt(cashGap)} ֏
          </span>
        </div>
      )}

      <div className={`grid grid-cols-1 ${isExpedition ? 'md:grid-cols-2' : ''} gap-6`}>
        {/* ═══════════ КЛИЕНТ ═══════════ */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Клиент</p>

          <div className="space-y-2">
            <SummaryRow
              label="Ставка"
              value={clientIsMultiCur
                ? `${fmt(clientRate)} ${CUR_SYMBOLS[clientCurrency] || clientCurrency}`
                : `${fmt(clientRate)} ֏`}
              sub={clientIsMultiCur ? `курс ${clientExRate} → ${fmt(clientRateAmd)} ֏` : undefined}
            />
            {clientExpenses.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Доп. расходы</p>
                {renderExpenseList(clientExpenses)}
                <div className="flex justify-between text-xs px-2 mt-1">
                  <span className="text-muted-foreground font-medium">Итого расходов</span>
                  <span className="font-mono font-medium">{fmt(clientExpensesAmd)} ֏</span>
                </div>
              </div>
            )}
            <div className="pt-1 border-t border-dashed">
              <SummaryRow label="Итого клиента" value={`${fmt(totalClientAmd)} ֏`} />
            </div>
            <SummaryRow label="Оплачено" value={`${fmt(clientPaidAmd)} ֏`} highlight="green" />
            <div className="pt-1 border-t border-dashed">
              <SummaryRow
                label="Остаток"
                value={`${fmt(clientRemaining)} ֏`}
                highlight={clientRemaining > 0 ? 'debt' : 'green'}
              />
            </div>
          </div>

          {/* История оплат клиента */}
          <div className="pt-2 border-t">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Оплаты клиента {clientPayments.length > 0 && `(${clientPayments.length})`}
            </p>
            {renderPaymentList(clientPayments, 'text-blue-600 dark:text-blue-400')}
          </div>
        </div>

        {/* ═══════════ ПЕРЕВОЗЧИК ═══════════ */}
        {isExpedition && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 uppercase tracking-wide">Перевозчик</p>

            <div className="space-y-2">
              <SummaryRow
                label="Сумма"
                value={carrierIsMultiCur
                  ? `${fmt(carrierRate)} ${CUR_SYMBOLS[carrierCurrency] || carrierCurrency}`
                  : `${fmt(carrierRate)} ֏`}
                sub={carrierIsMultiCur ? `курс ${carrierExRate} → ${fmt(carrierRateAmd)} ֏` : undefined}
              />
              {carrierExpenses.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Доп. расходы</p>
                  {renderExpenseList(carrierExpenses)}
                  <div className="flex justify-between text-xs px-2 mt-1">
                    <span className="text-muted-foreground font-medium">Итого расходов</span>
                    <span className="font-mono font-medium">{fmt(carrierExpensesAmd)} ֏</span>
                  </div>
                </div>
              )}
              <div className="pt-1 border-t border-dashed">
                <SummaryRow label="Итого перевозчика" value={`${fmt(totalCarrierAmd)} ֏`} />
              </div>
              <SummaryRow label="Выплачено" value={`${fmt(carrierPaidAmd)} ֏`} highlight="green" />
              <div className="pt-1 border-t border-dashed">
                <SummaryRow
                  label="Остаток"
                  value={`${fmt(carrierRemaining)} ֏`}
                  highlight={carrierRemaining > 0 ? 'red' : 'green'}
                />
              </div>
            </div>

            {/* История оплат перевозчику */}
            <div className="pt-2 border-t">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Оплаты перевозчику {carrierPayments.length > 0 && `(${carrierPayments.length})`}
              </p>
              {renderPaymentList(carrierPayments, 'text-orange-600 dark:text-orange-400')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TripDetailPage() {
  const params = useParams();
  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generatingDocs, setGeneratingDocs] = useState(false);
  const [showDocEditor, setShowDocEditor] = useState(false);
  const [docEditorData, setDocEditorData] = useState<Record<string, string>>({});

  const [tripCosts, setTripCosts] = useState<any>(null);


  const openDocEditorModal = async () => {
    if (!trip) return;
    let invoiceNum = '';
    let actNum = '';
    if (trip.clientId) {
      try {
        const [invRes, actRes] = await Promise.all([
          fetch(`/api/clients/${trip.clientId}/next-doc-number?docType=invoice`),
          fetch(`/api/clients/${trip.clientId}/next-doc-number?docType=act`),
        ]);
        if (invRes.ok) { const d = await invRes.json(); invoiceNum = d.nextNumber || ''; }
        if (actRes.ok) { const d = await actRes.json(); actNum = d.nextNumber || ''; }
      } catch {}
    }
    const docDate = new Date().toISOString().split('T')[0];
    const amountVal = Number(trip.clientRate ?? 0);
    const tripCurrency = (trip as any).currency || 'RUB';
    setDocEditorData({
      invoiceNumber: invoiceNum,
      actNumber: actNum,
      clientName: trip.client?.name || '',
      clientInn: trip.client?.inn || '',
      clientAddress: trip.client?.address || '',
      amount: String(amountVal),
      docDate,
      basisText: trip.basisText || '',
      sumInWords: generateSumInWordsLine(amountVal, tripCurrency),
      vehicleInfo: trip.vehicle ? `${trip.vehicle.brand} \u0433\u043E\u0441.\u043D\u043E\u043C. ${trip.vehicle.plateNumber}` : '',
      trailerInfo: '',
      driverName: trip.driver?.fullName || '',
      ndsTax: '\u041D\u0414\u0421 0%',
      notes: '',
    });
    setShowDocEditor(true);
  };

  const handleGenerateDocs = async (overrides?: Record<string, string>) => {
    if (!trip?.id || generatingDocs) return;
    setGeneratingDocs(true);
    setShowDocEditor(false);
    try {
      const res = await fetch(`/api/trips/${trip.id}/generate-docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: overrides || {} }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '\u041E\u0448\u0438\u0431\u043A\u0430' }));
        alert(err.error || '\u041E\u0448\u0438\u0431\u043A\u0430 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432');
        return;
      }
      const data = await res.json();
      if (data.invoice?.data) {
        const blob = new Blob([Uint8Array.from(atob(data.invoice.data), c => c.charCodeAt(0))], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = data.invoice.filename || '\u0421\u0447\u0451\u0442.pdf';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      await new Promise(r => setTimeout(r, 500));
      if (data.act?.data) {
        const blob = new Blob([Uint8Array.from(atob(data.act.data), c => c.charCodeAt(0))], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = data.act.filename || '\u0410\u043A\u0442.pdf';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error(e);
      alert('\u041E\u0448\u0438\u0431\u043A\u0430 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432');
    } finally {
      setGeneratingDocs(false);
    }
  };

  // Attachments (view-only)
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const reloadTrip = useCallback(async () => {
    if (!params?.id) return;
    try {
      const r = await fetch(`/api/trips/${params.id}`);
      const d = await r.json();
      setTrip(d);
      if (d?.vehicleId) {
        fetch(`/api/trips/${params.id}/costs`).then(r2 => r2.json()).then(c => setTripCosts(c)).catch(() => {});
      }
    } catch {} finally { setLoading(false); }
  }, [params?.id]);

  useEffect(() => { reloadTrip(); }, [reloadTrip]);

  const loadAttachments = useCallback(async () => {
    if (!params?.id) return;
    try {
      const res = await fetch(`/api/trips/${params.id}/attachments`);
      const data = await res.json();
      if (Array.isArray(data)) setAttachments(data);
    } catch {}
  }, [params?.id]);

  useEffect(() => { loadAttachments(); }, [loadAttachments]);


  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}</div>;
  if (!trip) return <div className="text-center py-12 text-muted-foreground">Заявка не найдена</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <Breadcrumbs current={`Заявка ${trip?.tripNumber ?? ''}`} />
      <div className="flex items-center gap-3 flex-wrap">
        <SmartBackButton fallbackHref="/trips" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-display font-bold tracking-tight">Заявка {trip?.tripNumber ?? ''}</h1>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {STATUS_ORDER.map((key, i) => {
              const info = STATUS_MAP[key];
              const currentIdx = STATUS_ORDER.indexOf(trip?.status);
              const isActive = key === trip?.status;
              const isPast = i < currentIdx;
              return (
                <div key={key} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                      isActive ? info.color + ' ring-2 ring-offset-1 ring-current/30' :
                      isPast ? 'bg-muted text-muted-foreground line-through opacity-60' :
                      'bg-muted/50 text-muted-foreground/50'
                    }`}
                  >
                    {info.label}
                  </span>
                </div>
              );
            })}
            <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${trip?.tripType === 'own_transport' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{TRIP_TYPE_MAP[trip?.tripType] ?? ''}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/trips/new?copyFrom=${params?.id}`} className="inline-flex items-center gap-2 px-3 py-2 border text-sm font-medium rounded-lg hover:bg-muted transition">
            <Copy className="w-4 h-4" /> Копировать
          </Link>
          <Link href={`/trips/${params?.id}/edit`} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition">
            <Pencil className="w-4 h-4" /> Редактировать
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Package className="w-4 h-4 text-primary" /> Основная информация</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{"\u041A\u043B\u0438\u0435\u043D\u0442"}</span><span className="font-medium">{trip?.client?.name ?? '\u2014'}</span></div>
            {trip?.contact && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{"\u041A\u043E\u043D\u0442\u0430\u043A\u0442"}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{trip.contact.name}</span>
                  {trip.contact.phone && (
                    <a href={`tel:${trip.contact.phone}`} className="text-blue-600 hover:underline text-xs" title={"\u041F\u043E\u0437\u0432\u043E\u043D\u0438\u0442\u044C"}>
                      \u260E {trip.contact.phone}
                    </a>
                  )}
                  {trip.contact.email && (
                    <a href={`mailto:${trip.contact.email}`} className="text-blue-600 hover:underline text-xs" title={"\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u044C"}>
                      \u2709
                    </a>
                  )}
                </div>
              </div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">{"\u0414\u0430\u0442\u0430"}</span><span className="font-medium">{formatDate(trip?.tripDate)}</span></div>
          </div>
        </div>
        <div className="bg-card rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Маршрут</h3>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-muted rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Откуда</p><p className="font-medium text-sm mt-1">{trip?.routeFrom ?? '—'}</p></div>
            <span className="text-muted-foreground">→</span>
            <div className="flex-1 bg-muted rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Куда</p><p className="font-medium text-sm mt-1">{trip?.routeTo ?? '—'}</p></div>
          </div>
          <div className="flex gap-4 text-sm">
            {trip?.distance != null && <div className="flex justify-between flex-1"><span className="text-muted-foreground">Расстояние</span><span className="font-medium">{trip.distance} км</span></div>}
            {trip?.cargoWeight != null && <div className="flex justify-between flex-1"><span className="text-muted-foreground">Вес груза</span><span className="font-medium">{Number(trip.cargoWeight)} т</span></div>}
          </div>
        </div>
        <div className="bg-card rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            {trip?.tripType === 'own_transport' ? <Truck className="w-4 h-4 text-primary" /> : <Building2 className="w-4 h-4 text-primary" />}
            {trip?.tripType === 'own_transport' ? 'Транспорт' : 'Перевозчик'}
          </h3>
          <div className="space-y-2 text-sm">
            {trip?.tripType === 'own_transport' ? (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Машина</span><span className="font-medium">{trip?.vehicle ? `${trip.vehicle.brand} ${trip.vehicle.model} (${trip.vehicle.plateNumber})` : '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Водитель</span><span className="font-medium">{trip?.driver?.fullName ?? '—'}</span></div>
              </>
            ) : (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Перевозчик</span><span className="font-medium">{trip?.carrier?.name ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Ставка перевозчика</span><span className="font-medium font-mono">{formatCurrencyRaw(trip?.carrierRate, trip?.carrierCurrency || trip?.currency || 'AMD')}</span></div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===== ФИНАНСЫ ===== */}
      {trip && <TripFinance trip={trip} />}


      {/* ===== ЗАМЕТКИ ===== */}
      {trip?.notes && (
        <div className="bg-card rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-primary" /> Внутренние заметки
          </h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{trip.notes}</p>
        </div>
      )}

      {/* Себестоимость заявки */}
      {trip?.vehicleId && tripCosts && tripCosts.totalCost > 0 && (
        <div className="bg-card rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
            <Fuel className="w-4 h-4 text-primary" /> {"\u0421\u0435\u0431\u0435\u0441\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C \u0437\u0430\u044f\u0432\u043a\u0430\u0430"} <span className="text-xs text-muted-foreground font-normal">({"\u0437\u0430 \u043C\u0435\u0441\u044F\u0446 \u0437\u0430\u044f\u0432\u043a\u0430\u0430"})</span>
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
              <p className="text-[10px] text-muted-foreground uppercase flex items-center justify-center gap-1"><Fuel className="w-3 h-3" /> {"\u0422\u043E\u043F\u043B\u0438\u0432\u043E"}</p>
              <p className="text-sm font-bold font-mono">{formatCurrency(tripCosts.fuelCost)}</p>
            </div>
            <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
              <p className="text-[10px] text-muted-foreground uppercase flex items-center justify-center gap-1"><Wrench className="w-3 h-3" /> {"\u0422\u041E"}</p>
              <p className="text-sm font-bold font-mono">{formatCurrency(tripCosts.maintenanceCost)}</p>
            </div>
            <div className="text-center p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
              <p className="text-[10px] text-muted-foreground uppercase">{"\u0418\u0442\u043E\u0433\u043E"}</p>
              <p className="text-sm font-bold font-mono text-red-700">{formatCurrency(tripCosts.totalCost)}</p>
            </div>
          </div>
          {tripCosts.fuelRecords?.length > 0 && (
            <div className="space-y-1 text-xs">
              {tripCosts.fuelRecords.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1 px-2 hover:bg-muted/50 rounded">
                  <span className="text-muted-foreground">{new Date(r.date).toLocaleDateString('ru-RU')} &middot; {r.liters}L &middot; {r.mileage}km</span>
                  <span className="font-mono">{formatCurrency(r.cost)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Прикреплённые файлы (только просмотр и скачивание) */}
      <div className="bg-card rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-primary" /> Прикреплённые файлы
          </h3>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Lock className="w-3 h-3" /> только просмотр</span>
        </div>

        {attachments.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Нет прикреплённых файлов</p>
            <p className="text-xs mt-1">Загрузка доступна в режиме «Редактировать»</p>
          </div>
        ) : (
          <div className="space-y-2">
            {attachments.map(att => {
              const ext = att.fileName.split('.').pop()?.toLowerCase() || '';
              const iconColor = ['pdf'].includes(ext) ? 'text-red-500' : ['doc','docx'].includes(ext) ? 'text-blue-500' : ['xls','xlsx','csv'].includes(ext) ? 'text-green-500' : ['jpg','jpeg','png'].includes(ext) ? 'text-orange-500' : 'text-gray-500';
              return (
                <div key={att.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/60 transition group">
                  <FileText className={`w-5 h-5 shrink-0 ${iconColor}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{att.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {att.description && <span>{att.description} · </span>}
                      {new Date(att.uploadedAt).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <a
                      href={att.downloadUrl}
                      download={att.fileName}
                      className="p-1.5 hover:bg-primary/10 rounded-md transition"
                      title="Скачать"
                      onClick={(e) => {
                        e.preventDefault();
                        const link = document.createElement('a');
                        link.href = att.downloadUrl;
                        link.download = att.fileName;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                    >
                      <Download className="w-4 h-4 text-primary" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Документы — только действие «Сформировать PDF» (не меняет данные) */}
      {(trip?.status === 'completed' || trip?.status === 'paid' || trip?.status === 'unloaded') && (
        <div className="bg-card rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Документы
          </h3>
          <button
            onClick={openDocEditorModal}
            disabled={generatingDocs}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition disabled:opacity-50 shadow-sm"
          >
            {generatingDocs ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
            {generatingDocs ? "\u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F..." : "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u2014 \u0421\u0447\u0451\u0442 + \u0410\u043A\u0442"}
          </button>
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">{"\u0422\u043E\u043B\u044C\u043A\u043E \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F PDF \u2014 \u0434\u0430\u043D\u043D\u044B\u0435 \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F"}</p>
        </div>
      )}

      {/* История изменений */}
      <TripHistory tripId={params?.id as string} />


      {/* Generate Docs Editor Modal */}
      {showDocEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowDocEditor(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-display font-bold">{"\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0421\u0447\u0451\u0442 + \u0410\u043A\u0442"}</h2>
              <button onClick={() => setShowDocEditor(false)} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground mb-2">{"\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0438 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u0435\u0440\u0435\u0434 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0435\u0439. \u0420\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438 \u0431\u0435\u0440\u0443\u0442\u0441\u044F \u0438\u0437 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A."}</p>

              <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <div>
                  <label className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1 block">{"\u2116 \u0421\u0447\u0451\u0442\u0430"}</label>
                  <input type="text" value={docEditorData.invoiceNumber || ''} onChange={(e) => setDocEditorData({ ...docEditorData, invoiceNumber: e.target.value })}
                    placeholder={"\u0430\u0432\u0442\u043E"}
                    className="w-full border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-sm bg-background font-mono" />
                </div>
                <div>
                  <label className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1 block">{"\u2116 \u0410\u043A\u0442\u0430"}</label>
                  <input type="text" value={docEditorData.actNumber || ''} onChange={(e) => setDocEditorData({ ...docEditorData, actNumber: e.target.value })}
                    placeholder={"\u0430\u0432\u0442\u043E"}
                    className="w-full border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-sm bg-background font-mono" />
                </div>
                <p className="col-span-2 text-[10px] text-blue-500 dark:text-blue-400">{"\u041D\u043E\u043C\u0435\u0440\u0430 \u043F\u043E \u043A\u043B\u0438\u0435\u043D\u0442\u0443. \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043D\u0443\u043C\u0435\u0440\u0430\u0446\u0438\u0438 \u2014 \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \u041A\u043B\u0438\u0435\u043D\u0442\u043E\u0432."}</p>
              </div>


              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{"\u0414\u0430\u0442\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430"}</label>
                  <input type="date" value={docEditorData.docDate || ''} onChange={(e) => setDocEditorData({ ...docEditorData, docDate: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{"\u0421\u0443\u043C\u043C\u0430"}</label>
                  <input type="number" step="1" value={docEditorData.amount || ''} onChange={(e) => {
                    const newAmount = e.target.value;
                    const cur = (trip as any)?.currency || 'RUB';
                    setDocEditorData({ ...docEditorData, amount: newAmount, sumInWords: generateSumInWordsLine(newAmount, cur) });
                  }}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
              </div>

              {/* Сумма прописью */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <label className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1 block">{"\u0421\u0443\u043C\u043C\u0430 \u043F\u0440\u043E\u043F\u0438\u0441\u044C\u044E"}</label>
                <textarea rows={2} value={docEditorData.sumInWords || ''} onChange={(e) => setDocEditorData({ ...docEditorData, sumInWords: e.target.value })}
                  className="w-full border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2 text-sm bg-background" />
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">{"\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438. \u041C\u043E\u0436\u043D\u043E \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0432\u0440\u0443\u0447\u043D\u0443\u044E."}</p>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{"\u041A\u043B\u0438\u0435\u043D\u0442"}</label>
                <input type="text" value={docEditorData.clientName || ''} onChange={(e) => setDocEditorData({ ...docEditorData, clientName: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{"\u0418\u041D\u041D/\u041A\u041F\u041F \u043A\u043B\u0438\u0435\u043D\u0442\u0430"}</label>
                <input type="text" value={docEditorData.clientInn || ''} onChange={(e) => setDocEditorData({ ...docEditorData, clientInn: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{"\u042E\u0440. \u0430\u0434\u0440\u0435\u0441 \u043A\u043B\u0438\u0435\u043D\u0442\u0430"}</label>
                <input type="text" value={docEditorData.clientAddress || ''} onChange={(e) => setDocEditorData({ ...docEditorData, clientAddress: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>

              {/* Основание (договор-заявка) */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{"\u0414\u043E\u0433\u043E\u0432\u043E\u0440-\u0437\u0430\u044F\u0432\u043A\u0430 (\u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435)"}</label>
                <textarea rows={2} value={docEditorData.basisText || ''} onChange={(e) => setDocEditorData({ ...docEditorData, basisText: e.target.value })}
                  placeholder={"\u0414\u043E\u0433\u043E\u0432\u043E\u0440 \u2116109379/101 \u043E\u0442 03.01.2024"}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{"\u0422\u044F\u0433\u0430\u0447 (\u043D\u0430\u043F\u0440.: DAF \u0433\u043E\u0441.\u043D\u043E\u043C. 797 DE 61)"}</label>
                <input type="text" value={docEditorData.vehicleInfo || ''} onChange={(e) => setDocEditorData({ ...docEditorData, vehicleInfo: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{"\u041F/\u043F (\u043F\u0440\u0438\u0446\u0435\u043F, \u043D\u0430\u043F\u0440.: KOGEL \u0433\u043E\u0441.\u043D\u043E\u043C. 854 F 01)"}</label>
                <input type="text" value={docEditorData.trailerInfo || ''} onChange={(e) => setDocEditorData({ ...docEditorData, trailerInfo: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{"\u0412\u043E\u0434\u0438\u0442\u0435\u043B\u044C"}</label>
                  <input type="text" value={docEditorData.driverName || ''} onChange={(e) => setDocEditorData({ ...docEditorData, driverName: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{"\u041D\u0414\u0421"}</label>
                  <input type="text" value={docEditorData.ndsTax || ''} onChange={(e) => setDocEditorData({ ...docEditorData, ndsTax: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{"\u041F\u0440\u0438\u043C\u0435\u0447\u0430\u043D\u0438\u0435"}</label>
                <textarea rows={2} value={docEditorData.notes || ''} onChange={(e) => setDocEditorData({ ...docEditorData, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t">
              <button onClick={() => setShowDocEditor(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition">
                {"\u041E\u0442\u043C\u0435\u043D\u0430"}
              </button>
              <button
                onClick={() => handleGenerateDocs(docEditorData)}
                disabled={generatingDocs}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {generatingDocs && <Loader2 className="w-4 h-4 animate-spin" />}
                {"\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C PDF"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}