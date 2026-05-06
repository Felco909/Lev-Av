'use client';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Plus, Trash2, DollarSign, MapPin, Info, AlertTriangle, RefreshCw, ChevronDown, CheckCircle2, Lock, Unlock, FileUp, Paperclip, X, Wand2, Loader2, Archive } from 'lucide-react';
import { formatCurrency, EXPENSE_TYPE_MAP, STATUS_MAP, STATUS_ORDER } from '@/lib/utils';

const CURRENCIES = ['AMD', 'USD', 'EUR', 'RUB', 'GEL'] as const;
const CURRENCY_SYMBOLS: Record<string, string> = { AMD: '֏', USD: '$', EUR: '€', RUB: '₽', GEL: '₾' };
import { VEHICLE_TYPE_MAP } from '@/lib/vehicle-types';

interface Expense {
  expenseType: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  amountAmd: number;
  description: string;
}

interface RouteTemplate {
  id: string;
  routeFrom: string;
  routeTo: string;
  distance: number | null;
  defaultRate: number | null;
  currency: string;
  vehicleType: string | null;
}

export default function TripForm({ tripId, copyFromId }: { tripId?: string; copyFromId?: string }) {
  const router = useRouter();
  const isEdit = !!tripId;

  const [clients, setClients] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [routeTemplates, setRouteTemplates] = useState<RouteTemplate[]>([]);
  const [busyVehicleIds, setBusyVehicleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [clientId, setClientId] = useState('');
  const [contactId, setContactId] = useState('');
  const [routeFrom, setRouteFrom] = useState('');
  const [routeTo, setRouteTo] = useState('');
  const [distance, setDistance] = useState<number | ''>('');
  const [cargoWeight, setCargoWeight] = useState<number | ''>('');
  const [tripType, setTripType] = useState('own_transport');
  const [clientRate, setClientRate] = useState(0);
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [carrierId, setCarrierId] = useState('');
  const [carrierRate, setCarrierRate] = useState(0);
  const [status, setStatus] = useState('new');
  const [tripDate, setTripDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [basisText, setBasisText] = useState('');
  const [clientInvoiceSeries, setClientInvoiceSeries] = useState('');
  const [carrierInvoiceSeries, setCarrierInvoiceSeries] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [notes, setNotes] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [currency, setCurrency] = useState('AMD');
  const [exchangeRate, setExchangeRate] = useState(1);
  const [carrierCurrency, setCarrierCurrency] = useState('AMD');
  const [carrierExchangeRate, setCarrierExchangeRate] = useState(1);
  const [dailyRates, setDailyRates] = useState<Record<string, number>>({});
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [completingTrip, setCompletingTrip] = useState(false);
  const [reopeningTrip, setReopeningTrip] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [savingSeries, setSavingSeries] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isCompleted = status === 'completed' || status === 'paid' || status === 'archived';

  // Payment management
  interface PaymentRecord { id: string; type: string; amount: number; amountAmd: number; currency: string; exchangeRate: number; paymentDate: string; description: string | null; }
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [showPayForm, setShowPayForm] = useState<'client' | 'carrier' | null>(null);
  const [savingPay, setSavingPay] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', currency: 'AMD', exchangeRate: '1', paymentDate: '', description: '', method: 'bank_transfer' });

  // Documents (attachments) — NEW
  interface TripAttachment { id: string; fileName: string; fileType: string; description: string | null; uploadedAt: string; downloadUrl: string; }
  const [pendingFiles, setPendingFiles] = useState<File[]>([]); // queued for upload after trip is created (new trips)
  const [existingAttachments, setExistingAttachments] = useState<TripAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractData, setExtractData] = useState<any | null>(null);
  const [extractFileName, setExtractFileName] = useState<string>('');


  // Load reference data
  useEffect(() => {
    Promise.all([
      fetch('/api/clients').then(r => r.json()),
      fetch('/api/vehicles').then(r => r.json()),
      fetch('/api/drivers').then(r => r.json()),
      fetch('/api/carriers').then(r => r.json()),
      fetch('/api/route-templates').then(r => r.json()),
      fetch('/api/exchange-rates').then(r => r.json()),
    ]).then(([c, v, d, cr, rt, rates]) => {
      setClients(Array.isArray(c) ? c : []);
      setVehicles(Array.isArray(v) ? v : []);
      setDrivers(Array.isArray(d) ? d : []);
      setCarriers(Array.isArray(cr) ? cr : []);
      setRouteTemplates(Array.isArray(rt) ? rt : []);
      if (rates && typeof rates === 'object' && !rates.error) setDailyRates(rates);
    }).catch(() => {}).finally(() => {
      if (!isEdit && !copyFromId) setLoading(false);
    });
  }, [isEdit, copyFromId]);

  // Load existing attachments for edit mode
  useEffect(() => {
    if (!tripId) { setExistingAttachments([]); return; }
    fetch(`/api/trips/${tripId}/attachments`)
      .then(r => r.json())
      .then(d => setExistingAttachments(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [tripId]);

  // Documents: add / remove pending files
  const addPendingFiles = useCallback((files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files as any as File[]);
    if (arr.length === 0) return;
    setPendingFiles(prev => [...prev, ...arr]);
  }, []);

  const removePendingFile = useCallback((idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // Upload a single file to S3 and save attachment record for a given trip
  const uploadSingleFile = useCallback(async (file: File, targetTripId: string, description: string = 'Договор-заявка') => {
    const presignRes = await fetch('/api/upload/presigned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, contentType: file.type || 'application/octet-stream', isPublic: false }),
    });
    if (!presignRes.ok) throw new Error('Ошибка получения URL для загрузки');
    const { uploadUrl, cloud_storage_path } = await presignRes.json();

    const uploadHeaders: Record<string, string> = { 'Content-Type': file.type || 'application/octet-stream' };
    const urlObj = new URL(uploadUrl);
    const signedHeaders = urlObj.searchParams.get('X-Amz-SignedHeaders') || '';
    if (signedHeaders.includes('content-disposition')) uploadHeaders['Content-Disposition'] = 'attachment';
    const uploadRes = await fetch(uploadUrl, { method: 'PUT', headers: uploadHeaders, body: file });
    if (!uploadRes.ok) throw new Error('Ошибка загрузки файла');

    await fetch(`/api/trips/${targetTripId}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        cloudStoragePath: cloud_storage_path,
        isPublic: false,
        description,
      }),
    });
  }, []);

  // Upload all pending files and (for edit mode) refresh existing list
  const uploadPendingToTrip = useCallback(async (targetTripId: string) => {
    if (pendingFiles.length === 0) return;
    setUploadingAttachments(true);
    try {
      for (const f of pendingFiles) {
        try { await uploadSingleFile(f, targetTripId, 'Документ заявки'); } catch (e) { console.error('upload error for', f.name, e); }
      }
      setPendingFiles([]);
      if (tripId) {
        try {
          const r = await fetch(`/api/trips/${tripId}/attachments`);
          const d = await r.json();
          if (Array.isArray(d)) setExistingAttachments(d);
        } catch {}
      }
    } finally {
      setUploadingAttachments(false);
    }
  }, [pendingFiles, uploadSingleFile, tripId]);

  // Delete an existing attachment
  const deleteExistingAttachment = useCallback(async (attachmentId: string) => {
    if (!tripId) return;
    if (!confirm('Удалить файл?')) return;
    try {
      await fetch(`/api/trips/${tripId}/attachments?attachmentId=${attachmentId}`, { method: 'DELETE' });
      setExistingAttachments(prev => prev.filter(a => a.id !== attachmentId));
    } catch { alert('Ошибка удаления'); }
  }, [tripId]);

  // Extract contract data from a file (LLM)
  const extractFromFile = useCallback(async (file: File) => {
    setExtracting(true);
    setExtractData(null);
    setExtractFileName(file.name);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/trips/extract-contract', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { alert(data?.error || 'Ошибка распознавания'); return; }
      setExtractData(data);
    } catch {
      alert('Ошибка соединения');
    } finally {
      setExtracting(false);
    }
  }, []);

  // Apply extracted data to form state (user confirmation)
  const applyExtractedData = useCallback(() => {
    if (!extractData) return;
    if (extractData.tripDate && typeof extractData.tripDate === 'string') {
      // Validate YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(extractData.tripDate)) setTripDate(extractData.tripDate);
    }
    if (extractData.routeFrom) setRouteFrom(String(extractData.routeFrom));
    if (extractData.routeTo) setRouteTo(String(extractData.routeTo));
    if (extractData.amount != null && !isNaN(Number(extractData.amount))) setClientRate(Number(extractData.amount));
    if (extractData.currency && (CURRENCIES as readonly string[]).includes(String(extractData.currency).toUpperCase())) {
      setCurrency(String(extractData.currency).toUpperCase());
    }
    if (extractData.clientName && clients.length > 0) {
      const match = clients.find((c: any) => (c?.name || '').toLowerCase().includes(String(extractData.clientName).toLowerCase()) ||
        String(extractData.clientName).toLowerCase().includes((c?.name || '').toLowerCase()));
      if (match) setClientId(match.id);
    }
    setExtractData(null);
    setExtractFileName('');
  }, [extractData, clients]);

  // 1.4: Auto-fill payment due date = tripDate + 14 days (only if empty)
  useEffect(() => {
    if (!tripDate || paymentDueDate) return;
    try {
      const d = new Date(tripDate);
      d.setDate(d.getDate() + 14);
      setPaymentDueDate(d.toISOString().split('T')[0]);
    } catch {}
  }, [tripDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load vehicle availability when date changes
  useEffect(() => {
    if (!tripDate) { setBusyVehicleIds([]); return; }
    const excludeParam = tripId ? `&excludeTripId=${tripId}` : '';
    fetch(`/api/vehicles/availability?date=${tripDate}${excludeParam}`)
      .then(r => r.json())
      .then(data => setBusyVehicleIds(Array.isArray(data?.busyVehicleIds) ? data.busyVehicleIds : []))
      .catch(() => {});
  }, [tripDate, tripId]);

  // Load trip data if editing or copying
  useEffect(() => {
    const loadId = tripId || copyFromId;
    if (!loadId) return;
    fetch(`/api/trips/${loadId}`)
      .then(r => r.json())
      .then(t => {
        setClientId(t?.clientId ?? '');
        setContactId(t?.contactId ?? '');
        setRouteFrom(t?.routeFrom ?? '');
        setRouteTo(t?.routeTo ?? '');
        setDistance(t?.distance ?? '');
        setCargoWeight(t?.cargoWeight != null ? Number(t.cargoWeight) : '');
        setTripType(t?.tripType ?? 'own_transport');
        setClientRate(t?.clientRate ?? 0);
        setVehicleId(t?.vehicleId ?? '');
        setDriverId(t?.driverId ?? '');
        setCarrierId(t?.carrierId ?? '');
        setCarrierRate(t?.carrierRate ?? 0);
        if (copyFromId) {
          setStatus('new');
          setTripDate(new Date().toISOString().split('T')[0]);
        } else {
          setStatus(t?.status ?? 'new');
          setTripDate(t?.tripDate ? new Date(t.tripDate).toISOString().split('T')[0] : '');
        }
        if ((t?.expenses ?? []).length > 0) setExpensesOpen(true);
        setExpenses((t?.expenses ?? []).map((e: any) => ({
          expenseType: e?.expenseType ?? 'other',
          amount: Number(e?.amount ?? 0),
          currency: e?.currency ?? 'AMD',
          exchangeRate: Number(e?.exchangeRate ?? 1),
          amountAmd: Number(e?.amountAmd ?? e?.amount ?? 0),
          description: e?.description ?? '',
        })));
        setCurrency(t?.currency || 'AMD');
        setExchangeRate(Number(t?.exchangeRate ?? 1));
        setCarrierCurrency(t?.carrierCurrency || t?.currency || 'AMD');
        setCarrierExchangeRate(Number(t?.carrierExchangeRate ?? t?.exchangeRate ?? 1));
        setPaymentDueDate(t?.paymentDueDate || '');
        setBasisText(t?.basisText || '');
        setClientInvoiceSeries(t?.clientInvoiceSeries || '');
        setCarrierInvoiceSeries(t?.carrierInvoiceSeries || '');
        setNotes(t?.notes || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tripId, copyFromId]);

  // Load payments for existing trip
  const loadPayments = useCallback(async () => {
    if (!tripId) return;
    try {
      const res = await fetch(`/api/payments?tripId=${tripId}`);
      const data = await res.json();
      setPayments(Array.isArray(data) ? data : []);
    } catch {}
  }, [tripId]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  const clientPayments = payments.filter(p => p.type === 'client');
  const carrierPayments = payments.filter(p => p.type === 'carrier');
  const clientPaidAmd = clientPayments.reduce((s, p) => s + (p.amountAmd || 0), 0);
  const carrierPaidAmd = carrierPayments.reduce((s, p) => s + (p.amountAmd || 0), 0);

  const openPayForm = (type: 'client' | 'carrier') => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setPayForm({ amount: '', currency: 'AMD', exchangeRate: '1', paymentDate: dateStr, description: '', method: 'bank_transfer' });
    setShowPayForm(type);
  };

  const handleSavePayment = async () => {
    if (!payForm.amount || Number(payForm.amount) <= 0 || !tripId) return;
    // 1.2: Overpayment warning
    const isClient = showPayForm === 'client';
    const totalRate = isClient ? clientRateAmd : carrierRateAmd;
    const currentPaid = isClient ? clientPaidAmd : carrierPaidAmd;
    const remaining = totalRate - currentPaid;
    if (remaining > 0 && payComputedAmd > remaining) {
      const excess = Math.round((payComputedAmd - remaining) * 100) / 100;
      if (!confirm(`Сумма оплаты (${payComputedAmd.toLocaleString('ru-RU')} ֏) превышает остаток (${remaining.toLocaleString('ru-RU')} ֏) на ${excess.toLocaleString('ru-RU')} ֏.\n\nВсё равно добавить?`)) return;
    }
    setSavingPay(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId,
          type: showPayForm,
          amount: Number(payForm.amount),
          currency: payForm.currency,
          exchangeRate: Number(payForm.exchangeRate) || 1,
          paymentDate: payForm.paymentDate,
          description: payForm.description || null,
          method: payForm.method || 'bank_transfer',
        }),
      });
      if (res.ok) {
        setShowPayForm(null);
        await loadPayments();
      }
    } catch {} finally { setSavingPay(false); }
  };

  const handleDeletePayment = async (id: string) => {
    const payment = payments.find(p => p.id === id);
    if (!payment) return;
    const isClient = payment.type === 'client';
    const totalRate = isClient ? clientRateAmd : carrierRateAmd;
    const currentPaid = isClient ? clientPaidAmd : carrierPaidAmd;
    const newPaid = currentPaid - (payment.amountAmd || 0);
    const newDebt = Math.max(0, totalRate - newPaid);
    const label = isClient ? 'клиента' : 'перевозчика';
    const msg = `Удалить оплату на ${payment.amount.toLocaleString('ru-RU')} ${CURRENCY_SYMBOLS[payment.currency] || payment.currency}?\n\nДолг ${label} увеличится до ${newDebt.toLocaleString('ru-RU')} ֏`;
    if (!confirm(msg)) return;
    try {
      await fetch(`/api/payments?id=${id}`, { method: 'DELETE' });
      await loadPayments();
    } catch {}
  };

  const payComputedAmd = payForm.currency === 'AMD'
    ? Number(payForm.amount) || 0
    : Math.round((Number(payForm.amount) || 0) * (Number(payForm.exchangeRate) || 1) * 100) / 100;

  // Route template selection handler
  const handleRouteSelect = (id: string) => {
    setSelectedRouteId(id);
    if (!id) return;
    const rt = routeTemplates.find(r => r.id === id);
    if (!rt) return;
    setRouteFrom(rt.routeFrom);
    setRouteTo(rt.routeTo);
    if (rt.distance != null) setDistance(rt.distance);
    if (rt.defaultRate != null) setClientRate(rt.defaultRate);
    if (rt.currency) handleCurrencyChange(rt.currency);
  };

  // Build flat list: each client + each contact as a selectable option
  const clientOptions = useMemo(() => {
    const opts: { value: string; clientId: string; contactId: string; label: string }[] = [];
    for (const c of clients) {
      const contacts = c?.contacts ?? [];
      if (contacts.length === 0) {
        // Client without contacts — show just company name
        opts.push({ value: `${c.id}||`, clientId: c.id, contactId: '', label: c.name });
      } else {
        for (const ct of contacts) {
          opts.push({ value: `${c.id}||${ct.id}`, clientId: c.id, contactId: ct.id, label: `${c.name} \u2014 ${ct.name}` });
        }
      }
    }
    return opts;
  }, [clients]);

  const selectedOptionValue = `${clientId}||${contactId}`;

  const handleClientOptionChange = (val: string) => {
    const [cId, ctId] = val.split('||');
    setClientId(cId || '');
    setContactId(ctId || '');
  };

  // Last rate hint for client+route
  const [lastRateHint, setLastRateHint] = useState<{ rate: number; currency: string; date: string } | null>(null);

  useEffect(() => {
    if (!clientId || !routeFrom || !routeTo || isEdit) { setLastRateHint(null); return; }
    const timer = setTimeout(() => {
      fetch(`/api/trips?clientId=${clientId}&routeFrom=${encodeURIComponent(routeFrom)}&routeTo=${encodeURIComponent(routeTo)}&lastRate=1`)
        .then(r => r.json())
        .then(data => {
          if (data?.lastRate) setLastRateHint(data.lastRate);
          else setLastRateHint(null);
        })
        .catch(() => setLastRateHint(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [clientId, routeFrom, routeTo, isEdit]);

  // Selected client info
  const selectedClient = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId]);

  // Selected contact info
  const selectedContact = useMemo(() => {
    if (!contactId || !selectedClient) return null;
    return (selectedClient?.contacts ?? []).find((ct: any) => ct.id === contactId) || null;
  }, [selectedClient, contactId]);

  // Calculate totals (all in AMD)
  const totalExpensesAmd = useMemo(() => (expenses ?? []).reduce((s: number, e: Expense) => s + (e?.amountAmd ?? 0), 0), [expenses]);

  const effectiveRate = currency === 'AMD' ? 1 : exchangeRate;
  const effectiveCarrierRate = carrierCurrency === 'AMD' ? 1 : carrierExchangeRate;
  const clientRateAmd = Math.round(clientRate * effectiveRate * 100) / 100;
  const carrierRateAmd = Math.round(carrierRate * effectiveCarrierRate * 100) / 100;
  const profitAmd = useMemo(() => {
    if (tripType === 'expedition') return Math.round((clientRateAmd - carrierRateAmd - totalExpensesAmd) * 100) / 100;
    return Math.round((clientRateAmd - totalExpensesAmd) * 100) / 100;
  }, [tripType, clientRateAmd, carrierRateAmd, totalExpensesAmd]);

  const handleCurrencyChange = (cur: string) => {
    setCurrency(cur);
    if (cur === 'AMD') {
      setExchangeRate(1);
    } else if (dailyRates[cur] && dailyRates[cur] > 0) {
      setExchangeRate(dailyRates[cur]);
    }
  };

  const handleCarrierCurrencyChange = (cur: string) => {
    setCarrierCurrency(cur);
    if (cur === 'AMD') {
      setCarrierExchangeRate(1);
    } else if (dailyRates[cur] && dailyRates[cur] > 0) {
      setCarrierExchangeRate(dailyRates[cur]);
    }
  };

  const applyDailyRate = () => {
    if (currency !== 'AMD' && dailyRates[currency] && dailyRates[currency] > 0) {
      setExchangeRate(dailyRates[currency]);
    }
  };

  const applyCarrierDailyRate = () => {
    if (carrierCurrency !== 'AMD' && dailyRates[carrierCurrency] && dailyRates[carrierCurrency] > 0) {
      setCarrierExchangeRate(dailyRates[carrierCurrency]);
    }
  };

  const addExpense = () => setExpenses([...(expenses ?? []), { expenseType: 'fuel', amount: 0, currency: 'AMD', exchangeRate: 1, amountAmd: 0, description: '' }]);
  const removeExpense = (idx: number) => setExpenses((expenses ?? []).filter((_: any, i: number) => i !== idx));
  const updateExpense = (idx: number, field: string, value: any) => {
    setExpenses((expenses ?? []).map((e: Expense, i: number) => {
      if (i !== idx) return e;
      const updated = { ...(e ?? {}), [field]: value };
      // Recalculate amountAmd when amount, currency, or exchangeRate changes
      if (field === 'amount' || field === 'currency' || field === 'exchangeRate') {
        const amt = Number(field === 'amount' ? value : updated.amount) || 0;
        const cur = field === 'currency' ? value : updated.currency;
        let rate = Number(field === 'exchangeRate' ? value : updated.exchangeRate) || 1;
        // Auto-fill rate from dailyRates when currency changes
        if (field === 'currency') {
          if (value === 'AMD') { rate = 1; } else if (dailyRates[value] > 0) { rate = dailyRates[value]; }
          updated.exchangeRate = rate;
        }
        updated.amountAmd = cur === 'AMD' ? amt : Math.round(amt * rate * 100) / 100;
      }
      return updated;
    }));
  };



  const handleCompleteTrip = async () => {
    if (!tripId || completingTrip) return;
    // 2.6: Warn about unpaid balance
    const clientDebt = clientRateAmd - clientPaidAmd;
    const carrierDebt = carrierRateAmd - carrierPaidAmd;
    let warnMsg = 'Вы уверены, что хотите завершить заявку?\nВсе задолженности будут закрыты.';
    if (clientDebt > 0 || carrierDebt > 0) {
      const parts: string[] = [];
      if (clientDebt > 0) parts.push(`Клиент: ${clientDebt.toLocaleString('ru-RU')} ֏`);
      if (carrierDebt > 0) parts.push(`Перевозчик: ${carrierDebt.toLocaleString('ru-RU')} ֏`);
      warnMsg = `⚠ Есть неоплаченный долг:\n${parts.join('\n')}\n\nВсё равно завершить? Задолженности будут закрыты.`;
    }
    if (!confirm(warnMsg)) return;
    setCompletingTrip(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closeDebts: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Ошибка' }));
        alert(err.error || 'Ошибка завершения заявки');
        return;
      }
      setStatus('completed');
      await loadPayments();
      alert('Заявка завершена. Все задолженности закрыты.');
    } catch { alert('Ошибка завершения заявки'); }
    finally { setCompletingTrip(false); }
  };

  const handleReopenTrip = async () => {
    if (!tripId || reopeningTrip) return;
    if (!confirm('Открыть заявку снова? Статус изменится на «Разгружен».')) return;
    setReopeningTrip(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/close`, { method: 'PUT' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Ошибка' }));
        alert(err.error || 'Ошибка');
        return;
      }
      setStatus('unloaded');
    } catch { alert('Ошибка'); }
    finally { setReopeningTrip(false); }
  };

  const handleArchiveToggle = async () => {
    if (!tripId || archiving) return;
    const newStatus = status === 'archived' ? 'completed' : 'archived';
    const msg = status === 'archived' ? 'Вернуть заявку из архива?' : 'Перенести заявку в архив?';
    if (!confirm(msg)) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Ошибка' }));
        alert(err.error || 'Ошибка');
        return;
      }
      setStatus(newStatus);
    } catch { alert('Ошибка'); }
    finally { setArchiving(false); }
  };

  const handleDeleteTrip = async () => {
    if (!tripId || deleting) return;
    if (!confirm('Вы уверены, что хотите удалить заявку? Это действие нельзя отменить.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/trips/${tripId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Ошибка удаления' }));
        alert(err.error || 'Ошибка удаления');
        return;
      }
      router.push('/trips');
    } catch { alert('Ошибка удаления'); }
    finally { setDeleting(false); }
  };

  const seriesInitRef = useRef(false);
  useEffect(() => {
    if (!tripId || !seriesInitRef.current) { seriesInitRef.current = true; return; }
    const timer = setTimeout(async () => {
      setSavingSeries(true);
      try {
        const res = await fetch(`/api/trips/${tripId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientInvoiceSeries: clientInvoiceSeries || null,
            carrierInvoiceSeries: carrierInvoiceSeries || null,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Ошибка' }));
          alert(err.error || 'Ошибка сохранения серии');
        }
      } catch { alert('Ошибка сохранения серии'); }
      finally { setSavingSeries(false); }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientInvoiceSeries, carrierInvoiceSeries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!clientId) { setError('Выберите клиента'); return; }
    if (!routeFrom || !routeTo) { setError('Укажите маршрут'); return; }
    if (!tripDate) { setError('Укажите дату'); return; }
    if (!clientRate || clientRate <= 0) { setError('Укажите ставку клиента (> 0)'); return; }
    if (tripType === 'own_transport') {
      if (!vehicleId) { setError('Выберите машину для собственного транспорта'); return; }
      if (!driverId) { setError('Выберите водителя'); return; }
    }

    // Check for potential duplicates
    if (!isEdit) {
      try {
        const dupRes = await fetch(`/api/trips?clientId=${clientId}&routeFrom=${encodeURIComponent(routeFrom)}&routeTo=${encodeURIComponent(routeTo)}&dateFrom=${tripDate}&dateTo=${tripDate}&pageSize=1`);
        const dupData = await dupRes.json();
        const dupCount = dupData?.totalCount ?? (Array.isArray(dupData?.data) ? dupData.data.length : 0);
        if (dupCount > 0) {
          if (!confirm(`\u0423 \u044d\u0442\u043e\u0433\u043e \u043a\u043b\u0438\u0435\u043d\u0442\u0430 \u0443\u0436\u0435 \u0435\u0441\u0442\u044c \u0437\u0430\u044f\u0432\u043a\u0430 \u043d\u0430 ${tripDate} \u043f\u043e \u043c\u0430\u0440\u0448\u0440\u0443\u0442\u0443 "${routeFrom} \u2192 ${routeTo}". \u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0435\u0449\u0451 \u043e\u0434\u0438\u043d?`)) return;
        }
      } catch {}
    }

    setSaving(true);
    try {
      const body: any = {
        clientId, contactId: contactId || null, routeFrom, routeTo, tripType, clientRate, status, tripDate,
        paymentDueDate: paymentDueDate || null,
        basisText: basisText || null,
        clientInvoiceSeries: clientInvoiceSeries || null,
        carrierInvoiceSeries: carrierInvoiceSeries || null,
        notes: notes || null,
        currency, exchangeRate: effectiveRate,
        distance: distance ? Number(distance) : null,
        cargoWeight: cargoWeight ? Number(cargoWeight) : null,
        vehicleId: tripType === 'own_transport' ? vehicleId || null : null,
        driverId: tripType === 'own_transport' ? driverId || null : null,
        carrierId: tripType === 'expedition' ? carrierId || null : null,
        carrierRate: tripType === 'expedition' ? carrierRate : null,
        carrierCurrency: tripType === 'expedition' ? carrierCurrency : null,
        carrierExchangeRate: tripType === 'expedition' ? effectiveCarrierRate : null,
        expenses: expenses ?? [],
      };

      const url = isEdit ? `/api/trips/${tripId}` : '/api/trips';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f'); return; }

      // Upload any queued documents to the newly-created/edited trip
      const targetId = isEdit ? (tripId as string) : (data?.id as string);
      if (targetId && pendingFiles.length > 0) {
        try { await uploadPendingToTrip(targetId); } catch (err) { console.error('attachment upload failed', err); }
      }

      // Offer to save route as template if it doesn't exist
      if (!isEdit && routeFrom && routeTo) {
        const exists = routeTemplates.some(rt =>
          rt.routeFrom.toLowerCase() === routeFrom.toLowerCase() &&
          rt.routeTo.toLowerCase() === routeTo.toLowerCase()
        );
        if (!exists && confirm(`\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043c\u0430\u0440\u0448\u0440\u0443\u0442 "${routeFrom} \u2192 ${routeTo}" \u043a\u0430\u043a \u0448\u0430\u0431\u043b\u043e\u043d \u0434\u043b\u044f \u0431\u044b\u0441\u0442\u0440\u043e\u0433\u043e \u0432\u044b\u0431\u043e\u0440\u0430?`)) {
          try {
            await fetch('/api/route-templates', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ routeFrom, routeTo, distance: distance ? Number(distance) : null, defaultRate: clientRate || null, currency }),
            });
          } catch {}
        }
      }

      if (!isEdit && confirm('Заявка создана. Перейти к добавлению оплаты?')) {
        router.replace(`/trips/${data?.id}/edit`);
      } else {
        router.replace(`/trips/${data?.id}`);
      }
    } catch {
      setError('Ошибка соединения');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/trips" className="p-2 hover:bg-muted rounded-lg transition"><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="text-xl font-display font-bold tracking-tight">{isEdit ? 'Редактирование заявки' : copyFromId ? 'Копирование заявки' : 'Новая заявка'}</h1>
      </div>

      {/* Completed / Archived banner */}
      {isEdit && isCompleted && (
        <div className={`${status === 'archived' ? 'bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800' : 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'} border rounded-xl p-4 flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-3">
            <Lock className={`w-5 h-5 ${status === 'archived' ? 'text-slate-600' : 'text-green-600'} shrink-0`} />
            <div>
              <p className={`text-sm font-semibold ${status === 'archived' ? 'text-slate-800 dark:text-slate-300' : 'text-green-800 dark:text-green-300'}`}>
                {status === 'archived' ? 'Заявка в архиве' : 'Заявка завершена'}
              </p>
              <p className={`text-xs ${status === 'archived' ? 'text-slate-600 dark:text-slate-400' : 'text-green-600 dark:text-green-400'}`}>
                Редактирование заблокировано. Нажмите «Открыть заявку снова» для изменений.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {status === 'archived' && (
              <button type="button" onClick={handleArchiveToggle} disabled={archiving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-500 text-white text-sm font-medium rounded-lg hover:bg-slate-600 disabled:opacity-60 transition">
                <Archive className="w-4 h-4" />
                {archiving ? '...' : 'Вернуть из архива'}
              </button>
            )}
            {(status === 'completed' || status === 'paid') && (
              <button type="button" onClick={handleArchiveToggle} disabled={archiving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-500 text-white text-sm font-medium rounded-lg hover:bg-slate-600 disabled:opacity-60 transition">
                <Archive className="w-4 h-4" />
                {archiving ? '...' : 'В архив'}
              </button>
            )}
            <button type="button" onClick={handleReopenTrip} disabled={reopeningTrip}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-60 transition">
              <Unlock className="w-4 h-4" />
              {reopeningTrip ? 'Открытие...' : 'Открыть заявку снова'}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset disabled={isCompleted} className={`space-y-6 ${isCompleted ? 'opacity-70 pointer-events-none' : ''}`}>
        {/* Route Template Quick Select */}
        {routeTemplates.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">Быстрый выбор маршрута</span>
            </div>
            <select value={selectedRouteId} onChange={e => handleRouteSelect(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
              <option value="">Выберите шаблон маршрута...</option>
              {routeTemplates.map(rt => (
                <option key={rt.id} value={rt.id}>
                  {rt.routeFrom} → {rt.routeTo}{rt.distance ? ` (${rt.distance} \u043A\u043C)` : ''}{rt.defaultRate ? ` \u2014 ${Number(rt.defaultRate).toLocaleString('ru-RU')} ${CURRENCY_SYMBOLS[rt.currency] || '\u058F'}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Basic Info */}
        <div className="bg-card rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold">Основная информация</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Клиент *</label>
              <select value={selectedOptionValue} onChange={(e) => handleClientOptionChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" required>
                <option value="||">{"\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043A\u043B\u0438\u0435\u043D\u0442\u0430"}</option>
                {clientOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Дата заявки *</label>
              <input type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" required />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Откуда *</label>
              <input type="text" value={routeFrom} onChange={(e) => setRouteFrom(e.target.value)} placeholder="Город отправления" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" required />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Куда *</label>
              <input type="text" value={routeTo} onChange={(e) => setRouteTo(e.target.value)} placeholder="Город назначения" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" required />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Расстояние (км)</label>
              <input type="number" min={0} value={distance} onChange={(e) => setDistance(e.target.value ? Number(e.target.value) : '')} placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Вес груза (т)</label>
              <input type="number" min={0} step="0.1" value={cargoWeight} onChange={(e) => setCargoWeight(e.target.value ? Number(e.target.value) : '')} placeholder="20" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">{"\u0421\u0442\u0430\u0442\u0443\u0441"}</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_ORDER.map((key) => {
                  const s = STATUS_MAP[key];
                  if (!s) return null;
                  const active = status === key;
                  // 1.3: Only allow adjacent status steps (current ±1)
                  const currentIdx = STATUS_ORDER.indexOf(status);
                  const keyIdx = STATUS_ORDER.indexOf(key);
                  const isAllowed = active || Math.abs(currentIdx - keyIdx) <= 1 || status === 'archived';
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => isAllowed && setStatus(key)}
                      disabled={!isAllowed}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${active ? 'ring-2 ring-offset-1 ring-primary border-transparent text-white' : isAllowed ? 'bg-background text-muted-foreground border-border hover:border-primary/40' : 'bg-muted/30 text-muted-foreground/40 border-border/30 cursor-not-allowed'}`}
                      style={active ? { backgroundColor: s.color } : undefined}
                    >
                      {s.label}
                    </button>
                  );
                })}
                {/* Archive status badge (read-only) */}
                {status === 'archived' && (
                  <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700 ring-2 ring-offset-1 ring-slate-400 border-transparent">
                    Архив ✓
                  </span>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Дата оплаты (дедлайн)</label>
              <input type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs text-muted-foreground mb-1 block">{"\u0414\u043E\u0433\u043E\u0432\u043E\u0440-\u0437\u0430\u044F\u0432\u043A\u0430 (\u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435)"}</label>
            <textarea value={basisText} onChange={(e) => setBasisText(e.target.value)} placeholder={"\u0414\u043E\u0433\u043E\u0432\u043E\u0440 \u2116109379/101 \u043E\u0442 03.01.2024"} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" />
          </div>
        </div>

        {/* Client Info Card */}
        {selectedClient && (
          <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-semibold">{"\u0418\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F \u043E \u043A\u043B\u0438\u0435\u043D\u0442\u0435"}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><span className="text-muted-foreground">{"\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435"}</span><p className="font-medium mt-0.5">{selectedClient.name}</p></div>
              {selectedClient.inn && <div><span className="text-muted-foreground">{"\u0418\u041D\u041D"}</span><p className="font-medium mt-0.5">{selectedClient.inn}</p></div>}
              {selectedClient.phone && <div><span className="text-muted-foreground">{"\u0422\u0435\u043B\u0435\u0444\u043E\u043D"}</span><p className="font-medium mt-0.5">{selectedClient.phone}</p></div>}
              {selectedClient.address && <div><span className="text-muted-foreground">{"\u0410\u0434\u0440\u0435\u0441"}</span><p className="font-medium mt-0.5">{selectedClient.address}</p></div>}
            </div>
            {selectedContact && (
              <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                <p className="text-[10px] text-muted-foreground mb-1">{"\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u043D\u043E\u0435 \u043B\u0438\u0446\u043E"}</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-semibold">{selectedContact.name}</span>
                  {selectedContact.phone && (
                    <a href={`tel:${selectedContact.phone}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                      \u260E {selectedContact.phone}
                    </a>
                  )}
                  {selectedContact.email && (
                    <a href={`mailto:${selectedContact.email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      {selectedContact.email}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Trip Type */}
        <div className="bg-card rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold">Тип заявки</h3>
          <div className="flex gap-3">
            <button type="button" onClick={() => setTripType('own_transport')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition ${tripType === 'own_transport' ? 'border-primary bg-primary/5 text-primary' : 'border-muted hover:border-primary/30'}`}>
              \ud83d\ude9a Собственные машины
            </button>
            <button type="button" onClick={() => setTripType('expedition')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition ${tripType === 'expedition' ? 'border-primary bg-primary/5 text-primary' : 'border-muted hover:border-primary/30'}`}>
              \ud83c\udfe2 Экспедиция
            </button>
          </div>

          {tripType === 'own_transport' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Машина *</label>
                <select value={vehicleId} onChange={(e) => { setVehicleId(e.target.value); const v = vehicles.find((v: any) => v?.id === e.target.value); if (v?.driverId) setDriverId(v.driverId); }} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="">Выберите машину</option>
                  {(vehicles ?? []).filter((v: any) => v?.status === 'active').map((v: any) => {
                    const isBusy = busyVehicleIds.includes(v?.id);
                    return (
                      <option key={v?.id} value={v?.id} disabled={isBusy}>
                        {v?.brand} {v?.model} ({v?.plateNumber}){isBusy ? ' — Занят' : ''}
                      </option>
                    );
                  })}
                </select>
                {vehicleId && busyVehicleIds.includes(vehicleId) && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Эта машина уже назначена на эту дату</p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Водитель *</label>
                <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="">Выберите водителя</option>
                  {(drivers ?? []).filter((d: any) => d?.status === 'active').map((d: any) => <option key={d?.id} value={d?.id}>{d?.fullName}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{"\u041F\u0435\u0440\u0435\u0432\u043E\u0437\u0447\u0438\u043A"}</label>
                  <select value={carrierId} onChange={(e) => setCarrierId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                    <option value="">{"\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0435\u0440\u0435\u0432\u043E\u0437\u0447\u0438\u043A\u0430"}</option>
                    {(carriers ?? []).map((c: any) => <option key={c?.id} value={c?.id}>{c?.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{"\u0421\u0442\u0430\u0432\u043A\u0430 \u043F\u0435\u0440\u0435\u0432\u043E\u0437\u0447\u0438\u043A\u0430"}, {CURRENCY_SYMBOLS[carrierCurrency] || carrierCurrency}</label>
                  <input type="number" min={0} value={carrierRate} onChange={(e) => setCarrierRate(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{"\u0412\u0430\u043B\u044E\u0442\u0430 \u0440\u0430\u0441\u0445\u043E\u0434\u0430"}</label>
                  <select value={carrierCurrency} onChange={(e) => handleCarrierCurrencyChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c} {CURRENCY_SYMBOLS[c]}</option>)}
                  </select>
                </div>
                {carrierCurrency !== 'AMD' && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{"\u041A\u0443\u0440\u0441 \u0440\u0430\u0441\u0445\u043E\u0434\u0430 \u043A AMD"}</label>
                    <div className="flex gap-1">
                      <input type="number" min={0} step="0.01" value={carrierExchangeRate} onChange={(e) => setCarrierExchangeRate(Number(e.target.value))}
                        className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                      {dailyRates[carrierCurrency] > 0 && (
                        <button type="button" onClick={applyCarrierDailyRate} title={`\u041A\u0443\u0440\u0441 \u0434\u043D\u044F: ${dailyRates[carrierCurrency]}`}
                          className="px-2 py-2 border rounded-lg text-xs hover:bg-muted transition flex items-center gap-1 whitespace-nowrap">
                          <RefreshCw className="w-3 h-3" /> {dailyRates[carrierCurrency]}
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">1 {carrierCurrency} = {carrierExchangeRate} AMD</p>
                    {dailyRates[carrierCurrency] > 0 && Math.abs(carrierExchangeRate - dailyRates[carrierCurrency]) / dailyRates[carrierCurrency] > 0.15 && (
                      <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" /> Курс отличается от дневного более чем на 15%</p>
                    )}
                  </div>
                )}
                {carrierCurrency !== 'AMD' && (
                  <div className="flex flex-col justify-end">
                    <span className="text-xs text-muted-foreground">{"\u0420\u0430\u0441\u0445\u043E\u0434 \u0432 AMD"}</span>
                    <span className="text-lg font-mono font-semibold text-red-500">{carrierRateAmd.toLocaleString('ru-RU')} {"\u058F"}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Expenses — collapsible */}
        <div className="bg-card rounded-xl shadow-sm">
          <button type="button" onClick={() => setExpensesOpen(!expensesOpen)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition rounded-xl">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              Расходы
              {(expenses?.length ?? 0) > 0 && <span className="text-xs font-normal text-muted-foreground">({expenses.length}) — {totalExpensesAmd.toLocaleString('ru-RU')} ֏</span>}
            </h3>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expensesOpen ? 'rotate-180' : ''}`} />
          </button>
          {expensesOpen && <div className="px-5 pb-5 space-y-4">
            <div className="flex items-center justify-end">
              <button type="button" onClick={addExpense} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <Plus className="w-3 h-3" /> Добавить
              </button>
            </div>
            {(expenses?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{'\u041D\u0435\u0442 \u0440\u0430\u0441\u0445\u043E\u0434\u043E\u0432. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C" \u0434\u043B\u044F \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0438\u044F.'}</p>
            ) : (
              <div className="space-y-3">
                {(expenses ?? []).map((exp: Expense, idx: number) => (
                  <div key={idx} className="p-3 bg-muted/50 rounded-lg space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select value={exp?.expenseType ?? 'other'} onChange={(e) => updateExpense(idx, 'expenseType', e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background sm:w-36">
                        {Object.entries(EXPENSE_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <input type="number" min={0} value={exp?.amount ?? 0} onChange={(e) => updateExpense(idx, 'amount', Number(e.target.value))} placeholder={"\u0421\u0443\u043C\u043C\u0430"} className="border rounded-lg px-3 py-2 text-sm bg-background sm:w-32" />
                      <select value={exp?.currency ?? 'AMD'} onChange={(e) => updateExpense(idx, 'currency', e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background w-24">
                        {CURRENCIES.map(c => <option key={c} value={c}>{c} {CURRENCY_SYMBOLS[c]}</option>)}
                      </select>
                      <input type="text" value={exp?.description ?? ''} onChange={(e) => updateExpense(idx, 'description', e.target.value)} placeholder={"\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435"} className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background" />
                      <button type="button" onClick={() => removeExpense(idx)} className="p-2 hover:bg-red-50 rounded-lg transition self-center">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                    {exp?.currency && exp.currency !== 'AMD' && (
                      <div className="flex items-center gap-3 pl-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">{"\u041A\u0443\u0440\u0441"}:</span>
                          <input type="number" min={0} step="0.01" value={exp?.exchangeRate ?? 1} onChange={(e) => updateExpense(idx, 'exchangeRate', Number(e.target.value))} className="border rounded px-2 py-1 text-xs bg-background w-20 font-mono" />
                          {dailyRates[exp.currency] > 0 && exp.exchangeRate !== dailyRates[exp.currency] && (
                            <button type="button" onClick={() => updateExpense(idx, 'exchangeRate', dailyRates[exp.currency])} className="text-[10px] text-primary hover:underline" title={`\u041A\u0443\u0440\u0441 \u0434\u043D\u044F: ${dailyRates[exp.currency]}`}>
                              {dailyRates[exp.currency]}
                            </button>
                          )}
                        </div>
                        <span className="text-xs font-mono text-amber-600">{"\u2192"} {(exp?.amountAmd ?? 0).toLocaleString('ru-RU')} {"\u058F"}</span>
                      </div>
                    )}
                  </div>
                ))}
                {/* Totals row */}
                <div className="flex items-center justify-between pt-2 border-t border-muted">
                  <span className="text-xs font-semibold text-muted-foreground">{"\u0418\u0442\u043E\u0433\u043E \u0440\u0430\u0441\u0445\u043E\u0434\u043E\u0432"}</span>
                  <span className="text-sm font-bold font-mono text-red-600">{totalExpensesAmd.toLocaleString('ru-RU')} {"\u058F"}</span>
                </div>
              </div>
            )}
          </div>}
        </div>

        {/* Finance Summary */}
        <div className="bg-card rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary" /> Финансы</h3>

          {/* Currency & Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Валюта</label>
              <select value={currency} onChange={(e) => handleCurrencyChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                {CURRENCIES.map(c => <option key={c} value={c}>{c} {CURRENCY_SYMBOLS[c]}</option>)}
              </select>
            </div>
            {currency !== 'AMD' && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Курс к AMD</label>
                <div className="flex gap-1">
                  <input type="number" min={0} step="0.01" value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value))}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  {dailyRates[currency] > 0 && (
                    <button type="button" onClick={applyDailyRate} title={`Курс дня: ${dailyRates[currency]}`}
                      className="px-2 py-2 border rounded-lg text-xs hover:bg-muted transition flex items-center gap-1 whitespace-nowrap">
                      <RefreshCw className="w-3 h-3" /> {dailyRates[currency]}
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">1 {currency} = {exchangeRate} AMD</p>
                {dailyRates[currency] > 0 && Math.abs(exchangeRate - dailyRates[currency]) / dailyRates[currency] > 0.15 && (
                  <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" /> Курс отличается от дневного более чем на 15%</p>
                )}
              </div>
            )}
            {currency !== 'AMD' && (
              <div className="flex flex-col justify-end">
                <span className="text-xs text-muted-foreground">Ставка в AMD</span>
                <span className="text-lg font-mono font-semibold text-primary">{clientRateAmd.toLocaleString('ru-RU')} ֏</span>
              </div>
            )}
          </div>

          {/* ═══ КЛИЕНТ ═══ */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Клиент</p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ставка клиента, {CURRENCY_SYMBOLS[currency] || currency} *</label>
              <input type="number" min={0} value={clientRate} onChange={(e) => setClientRate(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-mono" required />
              {currency !== 'AMD' && (
                <p className="text-xs font-mono text-muted-foreground mt-1">{clientRateAmd.toLocaleString('ru-RU')} ֏</p>
              )}
            </div>
            {lastRateHint && !isEdit && (
              <button type="button" onClick={() => { setClientRate(lastRateHint.rate); if (lastRateHint.currency !== currency) handleCurrencyChange(lastRateHint.currency); }}
                className="w-full text-left text-[11px] bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg px-2.5 py-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition">
                <span className="text-blue-800 dark:text-blue-300">Последняя ставка: <strong>{lastRateHint.rate.toLocaleString('ru-RU')} {CURRENCY_SYMBOLS[lastRateHint.currency] || lastRateHint.currency}</strong> ({lastRateHint.date})</span>
                <span className="text-blue-600 dark:text-blue-400 ml-1">← применить</span>
              </button>
            )}
            {/* Client summary: Ставка / Оплачено / Остаток */}
            {isEdit && (
              <div className="grid grid-cols-3 gap-3 bg-blue-50/50 dark:bg-blue-950/10 rounded-lg p-3">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Ставка</p>
                  <p className="text-sm font-mono font-semibold">{clientRateAmd.toLocaleString('ru-RU')} ֏</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Оплачено</p>
                  <p className="text-sm font-mono font-semibold text-green-600">{clientPaidAmd.toLocaleString('ru-RU')} ֏</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Остаток</p>
                  <p className={`text-sm font-mono font-semibold ${clientRateAmd - clientPaidAmd > 0 ? 'text-red-600' : 'text-green-600'}`}>{(clientRateAmd - clientPaidAmd).toLocaleString('ru-RU')} ֏</p>
                </div>
              </div>
            )}
            {/* Client payment list + add */}
            {isEdit && (
              <div className="space-y-2">
                <div className="flex items-center justify-end gap-3">
                  {clientRateAmd - clientPaidAmd > 0 && (
                    <button type="button" onClick={() => {
                      const rem = clientRateAmd - clientPaidAmd;
                      const now = new Date();
                      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                      setPayForm({ amount: String(rem), currency: 'AMD', exchangeRate: '1', paymentDate: dateStr, description: 'Полная оплата', method: 'bank_transfer' });
                      setShowPayForm('client');
                    }}
                      className="text-xs text-green-600 hover:text-green-800 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Оплачено полностью
                    </button>
                  )}
                  <button type="button" onClick={() => openPayForm('client')}
                    className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Добавить оплату
                  </button>
                </div>
                {clientPayments.length > 0 && (
                  <div className="space-y-1.5">
                    {clientPayments.map(p => (
                      <div key={p.id} className="group flex items-center justify-between bg-muted/30 rounded-lg px-3 py-1.5">
                        <div className="flex items-center gap-2 text-xs flex-wrap min-w-0">
                          <span className="text-muted-foreground shrink-0">{new Date(p.paymentDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                          <span className="font-mono font-semibold">{p.amount.toLocaleString('ru-RU')} {CURRENCY_SYMBOLS[p.currency] || p.currency}</span>
                          {p.currency !== 'AMD' && (
                            <span className="text-muted-foreground">× {Number(p.exchangeRate)} → <span className="font-semibold text-blue-600">{p.amountAmd.toLocaleString('ru-RU')} ֏</span></span>
                          )}
                          {p.description && <span className="text-muted-foreground truncate">— {p.description}</span>}
                        </div>
                        <button type="button" onClick={() => handleDeletePayment(p.id)}
                          className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition p-1 shrink-0" title="Удалить">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Add payment form — client */}
                {showPayForm === 'client' && (
                  <div className="bg-blue-50/50 dark:bg-blue-950/20 rounded-lg p-3 space-y-2 border border-dashed border-blue-300 dark:border-blue-700">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Новая оплата от клиента</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground">Сумма *</label>
                        <input type="number" step="0.01" min="0" value={payForm.amount}
                          onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                          className="w-full border rounded-md px-2 py-1.5 text-sm bg-background font-mono" placeholder="0" autoFocus />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Валюта</label>
                        <select value={payForm.currency}
                          onChange={e => { const cur = e.target.value; const rate = cur === 'AMD' ? '1' : (dailyRates[cur] > 0 ? String(dailyRates[cur]) : '1'); setPayForm(f => ({ ...f, currency: cur, exchangeRate: rate })); }}
                          className="w-full border rounded-md px-2 py-1.5 text-sm bg-background">
                          {CURRENCIES.map(c => <option key={c} value={c}>{c} {CURRENCY_SYMBOLS[c]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Курс</label>
                        <input type="number" step="0.0001" min="0.0001" value={payForm.exchangeRate}
                          onChange={e => setPayForm(f => ({ ...f, exchangeRate: e.target.value }))}
                          disabled={payForm.currency === 'AMD'}
                          className="w-full border rounded-md px-2 py-1.5 text-sm bg-background disabled:opacity-50 font-mono" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Дата *</label>
                        <input type="date" value={payForm.paymentDate}
                          onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))}
                          className="w-full border rounded-md px-2 py-1.5 text-sm bg-background" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Комментарий</label>
                      <input type="text" value={payForm.description}
                        onChange={e => setPayForm(f => ({ ...f, description: e.target.value }))}
                        className="w-full border rounded-md px-2 py-1.5 text-sm bg-background"
                        placeholder="Примечание к оплате" />
                    </div>
                    {payForm.currency !== 'AMD' && Number(payForm.amount) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {Number(payForm.amount).toLocaleString('ru-RU')} {payForm.currency} × {payForm.exchangeRate} = <span className="font-mono font-semibold">{payComputedAmd.toLocaleString('ru-RU')} ֏</span>
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button type="button" onClick={handleSavePayment} disabled={savingPay || !payForm.amount || Number(payForm.amount) <= 0}
                        className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                        {savingPay ? 'Сохранение...' : 'Добавить'}
                      </button>
                      <button type="button" onClick={() => setShowPayForm(null)}
                        className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Отмена</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ═══ ПЕРЕВОЗЧИК (только для экспедиции) ═══ */}
          {tripType === 'expedition' && (
            <div className="pt-4 border-t space-y-3">
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 uppercase tracking-wide">Перевозчик</p>
              {/* Carrier summary: Сумма / Оплачено / Остаток */}
              {isEdit && (
                <div className="grid grid-cols-3 gap-3 bg-orange-50/50 dark:bg-orange-950/10 rounded-lg p-3">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Сумма</p>
                    <p className="text-sm font-mono font-semibold">{carrierRateAmd.toLocaleString('ru-RU')} ֏</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Оплачено</p>
                    <p className="text-sm font-mono font-semibold text-green-600">{carrierPaidAmd.toLocaleString('ru-RU')} ֏</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Остаток</p>
                    <p className={`text-sm font-mono font-semibold ${carrierRateAmd - carrierPaidAmd > 0 ? 'text-red-600' : 'text-green-600'}`}>{(carrierRateAmd - carrierPaidAmd).toLocaleString('ru-RU')} ֏</p>
                  </div>
                </div>
              )}
              {/* Carrier payment list + add */}
              {isEdit && (
                <div className="space-y-2">
                  <div className="flex items-center justify-end gap-3">
                    {carrierRateAmd - carrierPaidAmd > 0 && (
                      <button type="button" onClick={() => {
                        const rem = carrierRateAmd - carrierPaidAmd;
                        const now = new Date();
                        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                        setPayForm({ amount: String(rem), currency: 'AMD', exchangeRate: '1', paymentDate: dateStr, description: 'Полная оплата', method: 'bank_transfer' });
                        setShowPayForm('carrier');
                      }}
                        className="text-xs text-green-600 hover:text-green-800 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Оплачено полностью
                      </button>
                    )}
                    <button type="button" onClick={() => openPayForm('carrier')}
                      className="text-xs text-orange-600 hover:text-orange-800 dark:text-orange-400 flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Добавить оплату
                    </button>
                  </div>
                  {carrierPayments.length > 0 && (
                    <div className="space-y-1.5">
                      {carrierPayments.map(p => (
                        <div key={p.id} className="group flex items-center justify-between bg-muted/30 rounded-lg px-3 py-1.5">
                          <div className="flex items-center gap-2 text-xs flex-wrap min-w-0">
                            <span className="text-muted-foreground shrink-0">{new Date(p.paymentDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                            <span className="font-mono font-semibold">{p.amount.toLocaleString('ru-RU')} {CURRENCY_SYMBOLS[p.currency] || p.currency}</span>
                            {p.currency !== 'AMD' && (
                              <span className="text-muted-foreground">× {Number(p.exchangeRate)} → <span className="font-semibold text-orange-600">{p.amountAmd.toLocaleString('ru-RU')} ֏</span></span>
                            )}
                            {p.description && <span className="text-muted-foreground truncate">— {p.description}</span>}
                          </div>
                          <button type="button" onClick={() => handleDeletePayment(p.id)}
                            className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition p-1 shrink-0" title="Удалить">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Add payment form — carrier */}
                  {showPayForm === 'carrier' && (
                    <div className="bg-orange-50/50 dark:bg-orange-950/20 rounded-lg p-3 space-y-2 border border-dashed border-orange-300 dark:border-orange-700">
                      <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">Новая оплата перевозчику</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground">Сумма *</label>
                          <input type="number" step="0.01" min="0" value={payForm.amount}
                            onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                            className="w-full border rounded-md px-2 py-1.5 text-sm bg-background font-mono" placeholder="0" autoFocus />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Валюта</label>
                          <select value={payForm.currency}
                            onChange={e => { const cur = e.target.value; const rate = cur === 'AMD' ? '1' : (dailyRates[cur] > 0 ? String(dailyRates[cur]) : '1'); setPayForm(f => ({ ...f, currency: cur, exchangeRate: rate })); }}
                            className="w-full border rounded-md px-2 py-1.5 text-sm bg-background">
                            {CURRENCIES.map(c => <option key={c} value={c}>{c} {CURRENCY_SYMBOLS[c]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Курс</label>
                          <input type="number" step="0.0001" min="0.0001" value={payForm.exchangeRate}
                            onChange={e => setPayForm(f => ({ ...f, exchangeRate: e.target.value }))}
                            disabled={payForm.currency === 'AMD'}
                            className="w-full border rounded-md px-2 py-1.5 text-sm bg-background disabled:opacity-50 font-mono" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Дата *</label>
                          <input type="date" value={payForm.paymentDate}
                            onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))}
                            className="w-full border rounded-md px-2 py-1.5 text-sm bg-background" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Комментарий</label>
                        <input type="text" value={payForm.description}
                          onChange={e => setPayForm(f => ({ ...f, description: e.target.value }))}
                          className="w-full border rounded-md px-2 py-1.5 text-sm bg-background"
                          placeholder="Примечание к оплате" />
                      </div>
                      {payForm.currency !== 'AMD' && Number(payForm.amount) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {Number(payForm.amount).toLocaleString('ru-RU')} {payForm.currency} × {payForm.exchangeRate} = <span className="font-mono font-semibold">{payComputedAmd.toLocaleString('ru-RU')} ֏</span>
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button type="button" onClick={handleSavePayment} disabled={savingPay || !payForm.amount || Number(payForm.amount) <= 0}
                          className="px-3 py-1.5 text-xs font-medium bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50">
                          {savingPay ? 'Сохранение...' : 'Добавить'}
                        </button>
                        <button type="button" onClick={() => setShowPayForm(null)}
                          className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Отмена</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══ Прибыль (краткая сводка) ═══ */}
          {isEdit && (
            <div className="pt-3 border-t">
              <div className={`flex items-center justify-between rounded-lg p-3 ${profitAmd >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}>
                <span className="text-xs font-medium text-muted-foreground">Прибыль</span>
                <span className={`text-lg font-bold font-mono ${profitAmd >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>{profitAmd.toLocaleString('ru-RU')} ֏</span>
              </div>
            </div>
          )}

          {/* ═══ Документы ═══ */}
          <div className="pt-3 border-t border-dashed space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-primary" /> Документы
              <span className="text-[10px] text-muted-foreground font-normal">(PDF, Word, Excel, фото)</span>
            </label>

            {/* Drag-drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); addPendingFiles(e.dataTransfer.files); }}
              className={`border-2 border-dashed rounded-xl p-5 text-center transition ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'}`}
            >
              <FileUp className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-2">Перетащите файлы сюда или</p>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 transition cursor-pointer">
                <FileUp className="w-3.5 h-3.5" /> Выбрать файлы
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => { addPendingFiles(e.target.files); e.target.value = ''; }}
                />
              </label>
              <p className="text-[10px] text-muted-foreground mt-2">Можно выбрать несколько файлов</p>
            </div>

            {/* Pending files list (queued, not yet uploaded) */}
            {pendingFiles.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">{isEdit ? 'К загрузке:' : 'Загрузятся после сохранения:'}</p>
                {pendingFiles.map((f, i) => {
                  const isPdf = (f.type || '').toLowerCase().includes('pdf') || f.name.toLowerCase().endsWith('.pdf');
                  const isImage = (f.type || '').toLowerCase().startsWith('image/');
                  return (
                    <div key={`${f.name}-${i}`} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-xs">
                      <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{Math.round(f.size / 1024)} КБ</span>
                      {(isPdf || isImage) && (
                        <button type="button" onClick={() => extractFromFile(f)} disabled={extracting}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 text-[10px] font-medium transition disabled:opacity-60"
                          title="Попытаться извлечь данные (номер, дату, клиента, сумму)">
                          {extracting && extractFileName === f.name ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                          Распознать
                        </button>
                      )}
                      <button type="button" onClick={() => removePendingFile(i)} className="p-1 hover:bg-red-100 rounded-md transition" title="Удалить">
                        <X className="w-3 h-3 text-red-500" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Existing attachments (edit mode) */}
            {existingAttachments.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">Уже загружено:</p>
                {existingAttachments.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 p-2 bg-card border rounded-lg text-xs">
                    <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <a href={a.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-primary hover:underline">{a.fileName}</a>
                    <button type="button" onClick={() => deleteExistingAttachment(a.id)} className="p-1 hover:bg-red-100 rounded-md transition" title="Удалить">
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Extract confirmation dialog */}
            {extractData && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-amber-600" />
                  <p className="text-sm font-semibold text-amber-900">Распознано из «{extractFileName}»</p>
                  <span className="ml-auto text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-medium">
                    {extractData?.confidence === 'high' ? 'Высокая точность' : extractData?.confidence === 'medium' ? 'Средняя точность' : 'Низкая точность'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {extractData.tripNumber && <div><span className="text-muted-foreground">№:</span> <span className="font-medium">{extractData.tripNumber}</span></div>}
                  {extractData.tripDate && <div><span className="text-muted-foreground">Дата:</span> <span className="font-medium">{extractData.tripDate}</span></div>}
                  {extractData.clientName && <div><span className="text-muted-foreground">Клиент:</span> <span className="font-medium">{extractData.clientName}</span></div>}
                  {extractData.amount != null && <div><span className="text-muted-foreground">Сумма:</span> <span className="font-medium font-mono">{Number(extractData.amount).toLocaleString('ru-RU')} {extractData.currency || ''}</span></div>}
                  {extractData.routeFrom && <div><span className="text-muted-foreground">Откуда:</span> <span className="font-medium">{extractData.routeFrom}</span></div>}
                  {extractData.routeTo && <div><span className="text-muted-foreground">Куда:</span> <span className="font-medium">{extractData.routeTo}</span></div>}
                </div>
                <p className="text-[11px] text-amber-800">Проверьте данные перед применением — они заполнят поля формы (можно отредактировать).</p>
                <div className="flex gap-2">
                  <button type="button" onClick={applyExtractedData}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-md hover:bg-amber-700 transition">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Применить
                  </button>
                  <button type="button" onClick={() => { setExtractData(null); setExtractFileName(''); }}
                    className="px-3 py-1.5 border text-xs rounded-md hover:bg-muted transition">
                    Отмена
                  </button>
                </div>
              </div>
            )}

            {uploadingAttachments && (
              <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Загрузка файлов...</p>
            )}
          </div>

          {/* ═══ Внутренние заметки ═══ */}
          <div className="pt-3 border-t border-dashed space-y-2">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="w-3 h-3" /> Внутренние заметки <span className="text-[10px]">(не попадают в документы)</span>
            </label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Заметки для внутреннего пользования..." rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" />
          </div>

        </div>

      </fieldset>

      {/* ═══ Серии счетов (вне fieldset — всегда редактируемы) ═══ */}
      {isEdit && (
        <div className="bg-card border rounded-xl p-5 space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Archive className="w-4 h-4 text-primary" /> Серии счетов для налоговой отчётности
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Серия счёта клиента</label>
              <input type="text" value={clientInvoiceSeries} onChange={(e) => setClientInvoiceSeries(e.target.value)}
                placeholder="Например: ԱԲ-001"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            </div>
            {tripType === 'expedition' && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Серия счёта перевозчика</label>
                <input type="text" value={carrierInvoiceSeries} onChange={(e) => setCarrierInvoiceSeries(e.target.value)}
                  placeholder="Например: ԱԲ-002"
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            )}
          </div>
          {savingSeries && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Сохранение...
            </p>
          )}
        </div>
      )}

        {error && <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">{error}</p>}

        {!isCompleted ? (
          <div className="flex items-center gap-3 flex-wrap">
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition">
              <Save className="w-4 h-4" /> {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
            <Link href="/trips" className="px-6 py-2.5 border rounded-lg text-sm hover:bg-muted transition">Отмена</Link>
            {isEdit && status !== 'new' && (
              <button type="button" onClick={handleCompleteTrip} disabled={completingTrip || saving}
                className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-60 transition">
                <CheckCircle2 className="w-4 h-4" />
                {completingTrip ? 'Завершение...' : 'Завершить заявку'}
              </button>
            )}
            {isEdit && (
              <button type="button" onClick={handleDeleteTrip} disabled={deleting || saving}
                className={`${status === 'new' ? 'ml-auto' : ''} inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60 transition`}>
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Удаление...' : 'Удалить заявку'}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link href="/trips" className="px-6 py-2.5 border rounded-lg text-sm hover:bg-muted transition">← К списку заявок</Link>
            <button type="button" onClick={handleReopenTrip} disabled={reopeningTrip}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-60 transition">
              <Unlock className="w-4 h-4" />
              {reopeningTrip ? 'Открытие...' : 'Открыть заявку снова'}
            </button>
          </div>
        )}
      </form>

    </div>
  );
}