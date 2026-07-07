'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  FileUp,
  Loader2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Download,
} from 'lucide-react';
import { appToast } from '@/lib/app-toast';

type ExtractData = {
  tripNumber: string | null;
  tripDate: string | null;
  clientName: string | null;
  amount: number | null;
  currency: string | null;
  routeFrom: string | null;
  routeTo: string | null;
  basisText: string | null;
  cargoWeight: number | null;
  confidence: string;
};

type ClientRow = { id: string; name: string };
type VehicleRow = { id: string; plateNumber: string; driverId?: string | null };
type DriverRow = { id: string; fullName: string };
type CarrierRow = { id: string; name: string };
type TripPickRow = {
  id: string;
  tripNumber: string;
  routeFrom: string;
  routeTo: string;
  tripDate: string;
  carrier?: { name: string } | null;
};

const CURRENCIES = ['AMD', 'USD', 'EUR', 'RUB', 'GEL'] as const;

function confidenceLabel(c: string) {
  if (c === 'high') return { text: 'Высокая уверенность', cls: 'bg-emerald-50 text-emerald-700' };
  if (c === 'medium') return { text: 'Средняя уверенность', cls: 'bg-amber-50 text-amber-800' };
  return { text: 'Низкая уверенность — проверьте вручную', cls: 'bg-red-50 text-red-700' };
}

export default function AgentsPage() {
  const router = useRouter();

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [carriers, setCarriers] = useState<CarrierRow[]>([]);

  const [docFile, setDocFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extract, setExtract] = useState<ExtractData | null>(null);

  const [clientId, setClientId] = useState('');
  const [tripDate, setTripDate] = useState('');
  const [routeFrom, setRouteFrom] = useState('');
  const [routeTo, setRouteTo] = useState('');
  const [clientRate, setClientRate] = useState('');
  const [currency, setCurrency] = useState('AMD');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [basisText, setBasisText] = useState('');
  const [cargoWeight, setCargoWeight] = useState('');
  const [tripType, setTripType] = useState<'own_transport' | 'expedition'>('expedition');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [carrierId, setCarrierId] = useState('');
  const [carrierRate, setCarrierRate] = useState('');
  const [creating, setCreating] = useState(false);

  const [tripOptions, setTripOptions] = useState<TripPickRow[]>([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [freightAmount, setFreightAmount] = useState('');
  const [freightCurrency, setFreightCurrency] = useState('AMD');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [docLanguage, setDocLanguage] = useState<'ru' | 'am'>('ru');

  useEffect(() => {
    Promise.all([
      fetch('/api/clients').then((r) => r.json()),
      fetch('/api/vehicles').then((r) => r.json()),
      fetch('/api/drivers').then((r) => r.json()),
      fetch('/api/carriers').then((r) => r.json()),
    ])
      .then(([c, v, d, cr]) => {
        setClients(Array.isArray(c) ? c : []);
        setVehicles(Array.isArray(v) ? v : []);
        setDrivers(Array.isArray(d) ? d : []);
        setCarriers(Array.isArray(cr) ? cr : []);
      })
      .catch(() => appToast.error('Не удалось загрузить справочники'));

    fetch('/api/trips?tripType=expedition&pageSize=80&sortBy=tripDate&sortDir=desc')
      .then((r) => r.json())
      .then((data) => {
        const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        setTripOptions(
          rows
            .filter((t: TripPickRow & { carrier?: { name: string } | null }) => t.carrier?.name)
            .slice(0, 80)
            .map((t: TripPickRow & { tripDate?: string }) => ({
              id: t.id,
              tripNumber: t.tripNumber,
              routeFrom: t.routeFrom,
              routeTo: t.routeTo,
              tripDate: t.tripDate?.slice?.(0, 10) ?? String(t.tripDate ?? ''),
              carrier: t.carrier,
            })),
        );
      })
      .catch(() => {
        /* optional list */
      });
  }, []);

  const matchClientId = useCallback(
    (name: string | null) => {
      if (!name || clients.length === 0) return '';
      const n = name.trim().toLowerCase();
      const exact = clients.find((c) => c.name.trim().toLowerCase() === n);
      if (exact) return exact.id;
      const partial = clients.find(
        (c) => c.name.trim().toLowerCase().includes(n) || n.includes(c.name.trim().toLowerCase()),
      );
      return partial?.id ?? '';
    },
    [clients],
  );

  const applyExtract = useCallback(
    (data: ExtractData) => {
      setExtract(data);
      setRouteFrom(data.routeFrom ?? '');
      setRouteTo(data.routeTo ?? '');
      setTripDate(data.tripDate ?? new Date().toISOString().slice(0, 10));
      setClientRate(data.amount != null ? String(data.amount) : '');
      setCurrency(
        data.currency && CURRENCIES.includes(data.currency as (typeof CURRENCIES)[number])
          ? data.currency
          : 'AMD',
      );
      setBasisText(data.basisText ?? '');
      setCargoWeight(data.cargoWeight != null ? String(data.cargoWeight) : '');
      setClientId(matchClientId(data.clientName));
    },
    [matchClientId],
  );

  const handleExtract = async () => {
    if (!docFile) {
      appToast.error('Выберите файл PDF или Word');
      return;
    }
    setExtracting(true);
    setExtract(null);
    try {
      const fd = new FormData();
      fd.append('file', docFile);
      const res = await fetch('/api/agents/document', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка распознавания');
      applyExtract(data as ExtractData);
      appToast.success('Данные извлечены — проверьте перед созданием заявки');
    } catch (e: unknown) {
      appToast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setExtracting(false);
    }
  };

  const handleCreateTrip = async () => {
    if (!clientId) {
      appToast.error('Выберите клиента из списка');
      return;
    }
    if (!routeFrom.trim() || !routeTo.trim()) {
      appToast.error('Укажите маршрут');
      return;
    }
    if (!tripDate) {
      appToast.error('Укажите дату заявки');
      return;
    }
    const rate = Number(clientRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      appToast.error('Укажите ставку клиента');
      return;
    }
    if (tripType === 'own_transport' && (!vehicleId || !driverId)) {
      appToast.error('Для собственного транспорта выберите машину и водителя');
      return;
    }

    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        clientId,
        routeFrom: routeFrom.trim(),
        routeTo: routeTo.trim(),
        tripDate,
        clientRate: rate,
        currency,
        exchangeRate: currency === 'AMD' ? 1 : Number(exchangeRate) || 1,
        tripType,
        status: 'new',
        basisText: basisText.trim() || null,
        cargoWeight: cargoWeight ? Number(cargoWeight) : null,
        notes: extract?.tripNumber ? `Агент: договор № ${extract.tripNumber}` : 'Создано AI-агентом документооборота',
      };
      if (tripType === 'own_transport') {
        body.vehicleId = vehicleId;
        body.driverId = driverId;
      } else {
        body.carrierId = carrierId || null;
        body.carrierRate = carrierRate ? Number(carrierRate) : null;
        body.carrierCurrency = currency;
        body.carrierExchangeRate = currency === 'AMD' ? 1 : Number(exchangeRate) || 1;
      }

      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось создать заявку');
      appToast.success(`Заявка ${data.tripNumber ?? ''} создана`);
      router.push(data.id ? `/trips/${data.id}` : '/trips');
    } catch (e: unknown) {
      appToast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadCarrierWord = async () => {
    const amount = freightAmount.trim();
    if (!amount) {
      appToast.error('Укажите сумму фрахта');
      return;
    }
    if (!selectedTripId && !carrierId) {
      appToast.error('Выберите заявку из TMS или перевозчика в форме');
      return;
    }
    setPdfLoading(true);
    try {
      const res = await fetch('/api/agents/document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'carrier_application_word',
          freightAmount: amount,
          freightCurrency,
          paymentTerms: paymentTerms.trim() || undefined,
          language: docLanguage,
          tripId: selectedTripId || undefined,
          draft: selectedTripId
            ? undefined
            : {
                tripNumber: extract?.tripNumber || 'новая',
                tripDate,
                routeFrom,
                routeTo,
                clientId,
                carrierId,
                vehicleId,
                clientRate,
                currency,
                cargoWeight: cargoWeight || null,
                carrierName: carriers.find((c) => c.id === carrierId)?.name,
              },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Ошибка генерации документа');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zayavka_perevozchik_${extract?.tripNumber || selectedTripId || 'draft'}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      appToast.success('Word-документ скачан');
    } catch (e: unknown) {
      appToast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setPdfLoading(false);
    }
  };

  const conf = useMemo(() => (extract ? confidenceLabel(extract.confidence) : null), [extract]);

  return (
    <div className="max-w-4xl space-y-8 pb-10">
      <div>
        <h1 className="text-xl font-display font-bold tracking-tight flex items-center gap-2">
          <Bot className="w-6 h-6 text-primary" />
          AI Агенты
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Помощник на базе Claude для документооборота: извлечение данных из договоров-заявок
        </p>
      </div>

      <section className="bg-card rounded-xl shadow-sm border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FileUp className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-semibold">Агент 1 — Документооборот</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Загрузите договор-заявку (PDF или Word). Claude извлечёт поля для проверки и создания заявки в TMS.
        </p>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex flex-wrap items-start gap-4">
            <img src="/levav-logo.png" alt="Lev&AV" className="h-16 w-auto object-contain shrink-0" />
            <div className="flex-1 min-w-[200px] space-y-2">
              <p className="text-xs font-semibold">Договор-заявка перевозчику (Word)</p>
              <p className="text-[11px] text-muted-foreground">
                Данные из заявки TMS, сумма фрахта — вручную. Скачивается как .docx.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Заявка из TMS (экспедиция)</label>
              <select
                value={selectedTripId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedTripId(id);
                  const t = tripOptions.find((x) => x.id === id);
                  if (t) {
                    setRouteFrom(t.routeFrom);
                    setRouteTo(t.routeTo);
                    if (t.tripDate) setTripDate(t.tripDate);
                  }
                }}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              >
                <option value="">— данные из формы ниже —</option>
                {tripOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.tripNumber} · {t.routeFrom} → {t.routeTo}
                    {t.carrier?.name ? ` · ${t.carrier.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Сумма фрахта *</label>
              <input
                type="number"
                min={0}
                value={freightAmount}
                onChange={(e) => setFreightAmount(e.target.value)}
                placeholder="Введите вручную"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Валюта фрахта</label>
              <select
                value={freightCurrency}
                onChange={(e) => setFreightCurrency(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Условия оплаты (необязательно)</label>
              <textarea
                rows={2}
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-y"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border overflow-hidden text-sm font-medium">
              <button
                type="button"
                onClick={() => setDocLanguage('ru')}
                className={`px-3 py-1.5 transition-colors ${docLanguage === 'ru' ? 'bg-slate-800 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}
              >
                RU
              </button>
              <button
                type="button"
                onClick={() => setDocLanguage('am')}
                className={`px-3 py-1.5 border-l transition-colors ${docLanguage === 'am' ? 'bg-slate-800 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}
              >
                AM
              </button>
            </div>
            <button
              type="button"
              onClick={handleDownloadCarrierWord}
              disabled={pdfLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 disabled:opacity-50"
            >
              {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {pdfLoading ? 'Генерация...' : 'Скачать Word (.docx)'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => {
              setDocFile(e.target.files?.[0] ?? null);
              setExtract(null);
            }}
            className="text-sm file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-primary file:text-white file:text-xs"
          />
          <button
            type="button"
            onClick={handleExtract}
            disabled={extracting || !docFile}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {extracting ? 'Анализ...' : 'Извлечь данные'}
          </button>
        </div>

        {extract && conf && (
          <div className="space-y-4 pt-2 border-t">
            <span className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${conf.cls}`}>{conf.text}</span>
            {extract.clientName && !clientId && (
              <p className="text-xs text-amber-700 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Клиент «{extract.clientName}» не найден в справочнике — выберите вручную
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Клиент *</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                >
                  <option value="">Выберите клиента</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Дата заявки *</label>
                <input
                  type="date"
                  value={tripDate}
                  onChange={(e) => setTripDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Откуда *</label>
                <input
                  value={routeFrom}
                  onChange={(e) => setRouteFrom(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Куда *</label>
                <input
                  value={routeTo}
                  onChange={(e) => setRouteTo(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Ставка клиента *</label>
                <input
                  type="number"
                  min={0}
                  value={clientRate}
                  onChange={(e) => setClientRate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Валюта</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              {currency !== 'AMD' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Курс к AMD</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Тип заявки</label>
                <select
                  value={tripType}
                  onChange={(e) => setTripType(e.target.value as 'own_transport' | 'expedition')}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                >
                  <option value="expedition">Экспедиция</option>
                  <option value="own_transport">Собственный транспорт</option>
                </select>
              </div>
              {tripType === 'own_transport' ? (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Машина *</label>
                    <select
                      value={vehicleId}
                      onChange={(e) => {
                        setVehicleId(e.target.value);
                        const v = vehicles.find((x) => x.id === e.target.value);
                        if (v?.driverId) setDriverId(v.driverId);
                      }}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                    >
                      <option value="">Выберите</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.plateNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Водитель *</label>
                    <select
                      value={driverId}
                      onChange={(e) => setDriverId(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                    >
                      <option value="">Выберите</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Перевозчик</label>
                    <select
                      value={carrierId}
                      onChange={(e) => setCarrierId(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                    >
                      <option value="">Не выбран</option>
                      {carriers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Ставка перевозчика</label>
                    <input
                      type="number"
                      min={0}
                      value={carrierRate}
                      onChange={(e) => setCarrierRate(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                    />
                  </div>
                </>
              )}
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Основание (договор)</label>
                <input
                  value={basisText}
                  onChange={(e) => setBasisText(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleCreateTrip}
              disabled={creating}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Создать заявку
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
