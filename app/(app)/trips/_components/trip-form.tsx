'use client';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Plus, Trash2, DollarSign, MapPin, Info, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, CheckCircle2, Lock, Unlock, FileUp, Paperclip, X, Wand2, Loader2, Archive, Download, FileText, Eye } from 'lucide-react';
import { openTripAttachment } from '@/lib/trip-attachment-open';
import {
  detectTripAttachmentSection,
  getTripAttachmentStorageMessage,
  TRIP_ATTACHMENT_SECTION_LABELS,
  type TripAttachmentSection,
} from '@/lib/trip-attachment-section';
import {
  TRIP_ATTACHMENT_SECTION_DESCRIPTIONS,
  tripSectionToStorageCategory,
} from '@/lib/trip-attachment-service';
import { formatCurrency, EXPENSE_TYPE_MAP, STATUS_MAP, STATUS_ORDER, canonicalWorkflowTripStatus, RATE_INPUT_CLASS, parseRateInput } from '@/lib/utils';
import { computeTripProfitAmd, CARRIER_EXPENSE_MARKER } from '@/lib/finance/formulas';
import { taxCodeIndicatorLabel } from '@/lib/trip-tax-code';
import { appToast } from '@/lib/app-toast';
import { addCalendarDaysFromDateOnly, WARNING_CLIENT_PAYMENT_TERMS } from '@/lib/trip-unload-flow';

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
  const [unloadDate, setUnloadDate] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [unloadPaymentHint, setUnloadPaymentHint] = useState('');
  const paymentDueManualRef = useRef(false);
  const [basisText, setBasisText] = useState('');
  const [clientInvoiceSeries, setClientInvoiceSeries] = useState('');
  const [carrierInvoiceSeries, setCarrierInvoiceSeries] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [clientExpenses, setClientExpenses] = useState<Expense[]>([]);
  const [carrierExpenses, setCarrierExpenses] = useState<Expense[]>([]);
  const [notes, setNotes] = useState('');
  const [customsDeparture, setCustomsDeparture] = useState('');
  const [customsDestination, setCustomsDestination] = useState('');
  const [cargoName, setCargoName] = useState('');
  const [cargoValue, setCargoValue] = useState<number | ''>('');
  const [truckType, setTruckType] = useState('');
  const [loadingAddress, setLoadingAddress] = useState('');
  const [unloadingAddress, setUnloadingAddress] = useState('');
  const [trailerPlate, setTrailerPlate] = useState('');
  const [additionalTerms, setAdditionalTerms] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [currency, setCurrency] = useState('AMD');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [carrierCurrency, setCarrierCurrency] = useState('AMD');
  const [carrierExchangeRate, setCarrierExchangeRate] = useState('1');
  const [dailyRates, setDailyRates] = useState<Record<string, number>>({});
  const [completingTrip, setCompletingTrip] = useState(false);
  const [reopeningTrip, setReopeningTrip] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [savingSeries, setSavingSeries] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const actionLockRef = useRef({ save: false, complete: false, reopen: false, archive: false, delete: false });

  const isArchived = status === 'archived';
  const isFinanciallyCompleted = status === 'completed' || status === 'paid';
  const formLocked = isArchived;

  // Payment management
  interface PaymentRecord { id: string; type: string; amount: number; amountAmd: number; currency: string; exchangeRate: number; paymentDate: string; description: string | null; }
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [showPayForm, setShowPayForm] = useState<'client' | 'carrier' | null>(null);
  const [savingPay, setSavingPay] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', currency: 'AMD', exchangeRate: '1', paymentDate: '', description: '', method: 'bank_transfer' });

  // Documents (attachments)
  interface TripAttachment {
    id: string;
    fileName: string;
    fileType: string;
    description: string | null;
    uploadedAt: string;
    downloadUrl: string | null;
    downloadAvailable?: boolean;
    storageReadable?: boolean;
    fileSizeBytes?: number | null;
  }
  interface PendingAttachment { file: File; section: TripAttachmentSection; }
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]); // queued for upload after trip is created (new trips)
  const [existingAttachments, setExistingAttachments] = useState<TripAttachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractData, setExtractData] = useState<any | null>(null);
  const [extractFileName, setExtractFileName] = useState<string>('');
  const contractInputRef = useRef<HTMLInputElement>(null);
  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const actInputRef = useRef<HTMLInputElement>(null);
  const signedInputRef = useRef<HTMLInputElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);


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
    fetch(`/api/trips/${tripId}/attachments`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('attachments');
        return r.json();
      })
      .then(d => setExistingAttachments(Array.isArray(d) ? d : []))
      .catch(() => setExistingAttachments([]));
  }, [tripId]);

  // Documents: add / remove pending files
  const addPendingFiles = useCallback((files: FileList | File[] | null, section: TripAttachmentSection) => {
    if (!files) return;
    const arr = Array.from(files as any as File[]);
    if (arr.length === 0) return;
    setPendingFiles(prev => [...prev, ...arr.map((file) => ({ file, section }))]);
  }, []);

  const removePendingFile = useCallback((idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const sectionDescription = TRIP_ATTACHMENT_SECTION_DESCRIPTIONS;

  const formatFileSize = useCallback((bytes?: number | null) => {
    if (bytes == null || Number.isNaN(bytes)) return 'н/д';
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  }, []);

  // Upload a single file to local storage and save attachment record for a given trip
  const uploadSingleFile = useCallback(async (file: File, targetTripId: string, description: string = 'Договор-заявка', section: TripAttachmentSection = 'contract') => {
    const presignRes = await fetch('/api/upload/presigned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          storageCategory: tripSectionToStorageCategory(section),
        }),
    });
    if (!presignRes.ok) throw new Error('Ошибка получения URL для загрузки');
    const { uploadUrl, cloud_storage_path } = await presignRes.json();

    const uploadHeaders: Record<string, string> = { 'Content-Type': file.type || 'application/octet-stream' };
    const uploadRes = await fetch(uploadUrl, { method: 'PUT', headers: uploadHeaders, body: file, credentials: 'include' });
    if (!uploadRes.ok) throw new Error('Ошибка загрузки файла');

    const saveRes = await fetch(`/api/trips/${targetTripId}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        cloudStoragePath: cloud_storage_path,
        isPublic: false,
        description,
      }),
    });
    if (!saveRes.ok) {
      const err = await saveRes.json().catch(() => ({}));
      throw new Error(err?.error || 'Ошибка сохранения вложения');
    }
  }, []);

  // Upload all pending files and (for edit mode) refresh existing list
  const uploadPendingToTrip = useCallback(async (targetTripId: string) => {
    if (pendingFiles.length === 0) return;
    setUploadingAttachments(true);
    try {
      for (const p of pendingFiles) {
        try { await uploadSingleFile(p.file, targetTripId, sectionDescription[p.section], p.section); } catch (e) { console.error('upload error for', p.file.name, e); }
      }
      setPendingFiles([]);
      if (tripId) {
        try {
          const r = await fetch(`/api/trips/${tripId}/attachments`, { credentials: 'include' });
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
      await fetch(`/api/trips/${tripId}/attachments?attachmentId=${attachmentId}`, { method: 'DELETE', credentials: 'include' });
      setExistingAttachments(prev => prev.filter(a => a.id !== attachmentId));
    } catch { appToast.error('Ошибка удаления'); }
  }, [tripId]);

  const replaceExistingAttachment = useCallback(async (attachment: TripAttachment, section: TripAttachmentSection) => {
    if (!tripId) return;
    if (!confirm(`Заменить файл "${attachment.fileName}"?`)) return;

    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    picker.onchange = async () => {
      const nextFile = picker.files?.[0];
      if (!nextFile) return;
      setUploadingAttachments(true);
      try {
        await uploadSingleFile(nextFile, tripId, sectionDescription[section], section);
        await fetch(`/api/trips/${tripId}/attachments?attachmentId=${attachment.id}`, { method: 'DELETE', credentials: 'include' });
        const r = await fetch(`/api/trips/${tripId}/attachments`, { credentials: 'include' });
        const d = await r.json();
        if (Array.isArray(d)) setExistingAttachments(d);
      } catch {
        appToast.error('Ошибка замены файла');
      } finally {
        setUploadingAttachments(false);
      }
    };
    picker.click();
  }, [tripId, sectionDescription, uploadSingleFile]);

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
      if (!res.ok) { appToast.error(data?.error || 'Ошибка распознавания'); return; }
      setExtractData(data);
    } catch {
      appToast.error('Ошибка соединения');
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
        paymentDueManualRef.current = false;
        setUnloadPaymentHint('');
        if (copyFromId) {
          setStatus('new');
          setTripDate(new Date().toISOString().split('T')[0]);
          setUnloadDate('');
        } else {
          const st = t?.status ?? 'new';
          const normalized = st === 'paid' ? 'completed' : st;
          setStatus(normalized);
          setTripDate(t?.tripDate ? new Date(t.tripDate).toISOString().split('T')[0] : '');
          setUnloadDate(t?.unloadDate ? new Date(t.unloadDate).toISOString().split('T')[0] : '');
        }
        const _rawExp = (t?.expenses ?? []);
        const _toExp = (e: any) => ({ expenseType: e?.expenseType ?? 'other', amount: Number(e?.amount ?? 0), currency: e?.currency ?? 'AMD', exchangeRate: Number(e?.exchangeRate ?? 1), amountAmd: Number(e?.amountAmd ?? e?.amount ?? 0), description: '' });
        setClientExpenses(_rawExp.filter((e: any) => e?.description !== '__carrier__').map(_toExp));
        setCarrierExpenses(_rawExp.filter((e: any) => e?.description === '__carrier__').map(_toExp));
        setCurrency(t?.currency || 'AMD');
        setExchangeRate(String(t?.exchangeRate ?? 1));
        setCarrierCurrency(t?.carrierCurrency || t?.currency || 'AMD');
        setCarrierExchangeRate(String(t?.carrierExchangeRate ?? t?.exchangeRate ?? 1));
        setPaymentDueDate(t?.paymentDueDate || '');
        setBasisText(t?.basisText || '');
        setClientInvoiceSeries(t?.clientInvoiceSeries || '');
        setCarrierInvoiceSeries(t?.carrierInvoiceSeries || '');
        setTaxCode(t?.taxCode || '');
        setNotes(t?.notes || '');
        setCustomsDeparture(t?.customsDeparture || '');
        setCustomsDestination(t?.customsDestination || '');
        setCargoName(t?.cargoName || '');
        setCargoValue(t?.cargoValue != null ? Number(t.cargoValue) : '');
        setTruckType(t?.truckType || '');
        setLoadingAddress(t?.loadingAddress || '');
        setUnloadingAddress(t?.unloadingAddress || '');
        setTrailerPlate(t?.trailerPlate || '');
        setAdditionalTerms(t?.additionalTerms || '');
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
    const totalRate = isClient ? totalClientAmd : totalCarrierAmd;
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
          exchangeRate: parseRateInput(payForm.exchangeRate) || 1,
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
    const totalRate = isClient ? totalClientAmd : totalCarrierAmd;
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
    : Math.round((Number(payForm.amount) || 0) * (parseRateInput(payForm.exchangeRate) || 1) * 100) / 100;

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

  const applyPaymentDueFromUnload = useCallback(
    (dateStr: string, clientIdOverride?: string) => {
      if (!dateStr) {
        setUnloadPaymentHint('');
        return;
      }
      if (paymentDueManualRef.current) return;
      const id = clientIdOverride ?? clientId;
      const c = clients.find((x: any) => x.id === id);
      const d = c?.paymentTermsDays;
      if (d != null && Number(d) > 0) {
        const base = new Date(`${dateStr}T12:00:00`);
        const due = addCalendarDaysFromDateOnly(base, Number(d));
        setPaymentDueDate(due.toISOString().slice(0, 10));
        setUnloadPaymentHint('');
      } else {
        setUnloadPaymentHint(WARNING_CLIENT_PAYMENT_TERMS);
      }
    },
    [clients, clientId],
  );

  const handleClientOptionChange = (val: string) => {
    const [cId, ctId] = val.split('||');
    const nextClient = cId || '';
    setClientId(nextClient);
    setContactId(ctId || '');
    paymentDueManualRef.current = false;
    if (unloadDate) applyPaymentDueFromUnload(unloadDate, nextClient);
  };

  /** Предупреждение если у выбранного клиента не задан срок оплаты в днях. */
  useEffect(() => {
    if (loading || clients.length === 0) return;
    if (!clientId) { setUnloadPaymentHint(''); return; }
    const c = clients.find((x: any) => x.id === clientId);
    const d = c?.paymentTermsDays;
    if (d != null && Number(d) > 0) setUnloadPaymentHint('');
    else setUnloadPaymentHint(WARNING_CLIENT_PAYMENT_TERMS);
  }, [loading, clientId, clients]);

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
  const totalClientExpensesAmd = useMemo(() => clientExpenses.reduce((s: number, e: Expense) => s + (e?.amountAmd ?? 0), 0), [clientExpenses]);
  const totalCarrierExpensesAmd = useMemo(() => carrierExpenses.reduce((s: number, e: Expense) => s + (e?.amountAmd ?? 0), 0), [carrierExpenses]);

  const effectiveRate = currency === 'AMD' ? 1 : (parseRateInput(exchangeRate) || 1);
  const effectiveCarrierRate = carrierCurrency === 'AMD' ? 1 : (parseRateInput(carrierExchangeRate) || 1);
  const clientRateAmd = Math.round(clientRate * effectiveRate * 100) / 100;
  const carrierRateAmd = Math.round(carrierRate * effectiveCarrierRate * 100) / 100;
  const totalClientAmd = useMemo(() => Math.round((clientRateAmd + totalClientExpensesAmd) * 100) / 100, [clientRateAmd, totalClientExpensesAmd]);
  const totalCarrierAmd = useMemo(() => Math.round((carrierRateAmd + totalCarrierExpensesAmd) * 100) / 100, [carrierRateAmd, totalCarrierExpensesAmd]);
  // Единая формула прибыли (lib/finance/formulas.ts) — та же, что использует бэкенд.
  const profitAmd = useMemo(() => computeTripProfitAmd({
    clientRateAmd,
    carrierRateAmd,
    expenses: [
      { amountAmd: totalClientExpensesAmd, description: '' },
      { amountAmd: totalCarrierExpensesAmd, description: CARRIER_EXPENSE_MARKER },
    ],
  }), [clientRateAmd, carrierRateAmd, totalClientExpensesAmd, totalCarrierExpensesAmd]);

  const handleCurrencyChange = (cur: string) => {
    setCurrency(cur);
    if (cur === 'AMD') setExchangeRate('1');
  };

  const handleCarrierCurrencyChange = (cur: string) => {
    setCarrierCurrency(cur);
    if (cur === 'AMD') setCarrierExchangeRate('1');
  };

  const applyDailyRate = () => {
    if (currency !== 'AMD' && dailyRates[currency] && dailyRates[currency] > 0) {
      setExchangeRate(String(dailyRates[currency]));
    }
  };

  const applyCarrierDailyRate = () => {
    if (carrierCurrency !== 'AMD' && dailyRates[carrierCurrency] && dailyRates[carrierCurrency] > 0) {
      setCarrierExchangeRate(String(dailyRates[carrierCurrency]));
    }
  };

  const _makeExpHandler = (setter: React.Dispatch<React.SetStateAction<Expense[]>>) => ({
    add: () => setter(prev => [...prev, { expenseType: 'fuel', amount: 0, currency: 'AMD', exchangeRate: 1, amountAmd: 0, description: '' }]),
    remove: (idx: number) => setter(prev => prev.filter((_, i) => i !== idx)),
    update: (idx: number, field: string, value: any) => setter(prev => prev.map((e: Expense, i: number) => {
      if (i !== idx) return e;
      const u = { ...e, [field]: value };
      if (field === 'amount' || field === 'currency' || field === 'exchangeRate') {
        const amt = Number(field === 'amount' ? value : u.amount) || 0;
        const cur = field === 'currency' ? value : u.currency;
        let rate = Number(field === 'exchangeRate' ? value : u.exchangeRate) || 1;
        if (field === 'currency' && value === 'AMD') { rate = 1; u.exchangeRate = 1; }
        u.amountAmd = cur === 'AMD' ? amt : Math.round(amt * rate * 100) / 100;
      }
      return u;
    })),
  });
  const _cliH = _makeExpHandler(setClientExpenses);
  const _carH = _makeExpHandler(setCarrierExpenses);
  const addClientExpense = () => _cliH.add();
  const removeClientExpense = (idx: number) => _cliH.remove(idx);
  const updateClientExpense = (idx: number, f: string, v: any) => _cliH.update(idx, f, v);
  const addCarrierExpense = () => _carH.add();
  const removeCarrierExpense = (idx: number) => _carH.remove(idx);
  const updateCarrierExpense = (idx: number, f: string, v: any) => _carH.update(idx, f, v);



  const handleCompleteTrip = async () => {
    if (!tripId || completingTrip || actionLockRef.current.complete) return;
    // 2.6: Warn about unpaid balance
    const clientDebt = totalClientAmd - clientPaidAmd;
    const carrierDebt = totalCarrierAmd - carrierPaidAmd;
    let warnMsg = 'Перевести заявку в статус «Оплачен / Завершён»? Автозакрытие долгов не выполняется.';
    if (clientDebt > 0 || carrierDebt > 0) {
      const parts: string[] = [];
      if (clientDebt > 0) parts.push(`Клиент: ${clientDebt.toLocaleString('ru-RU')} ֏`);
      if (carrierDebt > 0) parts.push(`Перевозчик: ${carrierDebt.toLocaleString('ru-RU')} ֏`);
      warnMsg = `Есть неоплаченный остаток:\n${parts.join('\n')}\n\nВсё равно перевести в «Оплачен / Завершён»? Долги не закрываются автоматически.`;
    }
    if (!confirm(warnMsg)) return;
    actionLockRef.current.complete = true;
    setCompletingTrip(true);
    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Ошибка' }));
        appToast.error(err.error || 'Ошибка завершения заявки');
        return;
      }
      setStatus('completed');
      await loadPayments();
      appToast.success('Статус изменён на «Оплачен / Завершён». Налоговый код можно внести до отправки в архив.');
    } catch { appToast.error('Ошибка завершения заявки'); }
    finally {
      actionLockRef.current.complete = false;
      setCompletingTrip(false);
    }
  };

  const handleReopenTrip = async () => {
    if (!tripId || reopeningTrip || actionLockRef.current.reopen) return;
    if (!confirm('Открыть заявку снова? Статус изменится на «Сверка».')) return;
    actionLockRef.current.reopen = true;
    setReopeningTrip(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/close`, { method: 'PUT' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Ошибка' }));
        appToast.error(err.error || 'Ошибка');
        return;
      }
      setStatus('sverka');
      appToast.success('Заявка снова в статусе «Сверка».');
    } catch { appToast.error('Ошибка'); }
    finally {
      actionLockRef.current.reopen = false;
      setReopeningTrip(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!tripId || archiving || actionLockRef.current.archive) return;
    if (status === 'archived') {
      if (!confirm('Вернуть заявку из архива в статус «Оплачен / Завершён»?')) return;
      actionLockRef.current.archive = true;
      setArchiving(true);
      try {
        const res = await fetch(`/api/trips/${tripId}/archive`, { method: 'PUT' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Ошибка' }));
          appToast.error(err.error || 'Ошибка');
          return;
        }
        setStatus('completed');
        appToast.success('Заявка возвращена из архива в статус «Оплачен / Завершён».');
      } catch { appToast.error('Ошибка'); }
      finally {
        actionLockRef.current.archive = false;
        setArchiving(false);
      }
      return;
    }

    if (!confirm('Отправить заявку в архив? Требуется статус «Оплачен / Завершён» и заполненный налоговый код — иначе архивация будет отклонена.')) return;
    actionLockRef.current.archive = true;
    setArchiving(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/archive`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        appToast.error(data?.error || 'Нельзя отправить в архив');
        return;
      }
      setStatus('archived');
      appToast.success('Заявка отправлена в архив.');
    } catch { appToast.error('Ошибка'); }
    finally {
      actionLockRef.current.archive = false;
      setArchiving(false);
    }
  };

  const handleDeleteTrip = async () => {
    if (!tripId || deleting || actionLockRef.current.delete) return;
    if (!confirm('Удалить заявку без возможности восстановления?')) return;
    if (!confirm('Подтвердите удаление ещё раз. Операция необратима.')) return;
    actionLockRef.current.delete = true;
    setDeleting(true);
    try {
      const res = await fetch(`/api/trips/${tripId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Ошибка удаления' }));
        appToast.error(err.error || 'Ошибка удаления');
        return;
      }
      appToast.success('Заявка удалена');
      router.push('/trips');
    } catch { appToast.error('Ошибка удаления'); }
    finally {
      actionLockRef.current.delete = false;
      setDeleting(false);
    }
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
            taxCode: taxCode.trim() || null,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Ошибка' }));
          appToast.error(err.error || 'Ошибка сохранения серии');
        }
      } catch { appToast.error('Ошибка сохранения серии'); }
      finally { setSavingSeries(false); }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientInvoiceSeries, carrierInvoiceSeries, taxCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || actionLockRef.current.save) return;

    if (!clientId) { appToast.error('Выберите клиента'); return; }
    if (!routeFrom || !routeTo) { appToast.error('Укажите маршрут'); return; }
    if (!tripDate) { appToast.error('Укажите дату'); return; }
    if (!clientRate || clientRate <= 0) { appToast.error('Укажите ставку клиента (> 0)'); return; }
    if (tripType === 'own_transport') {
      if (!vehicleId) { appToast.error('Выберите машину для собственного транспорта'); return; }
      if (!driverId) { appToast.error('Выберите водителя'); return; }
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

    actionLockRef.current.save = true;
    setSaving(true);
    try {
      const body: any = {
        clientId, contactId: contactId || null, routeFrom, routeTo, tripType, clientRate, status, tripDate,
        unloadDate: unloadDate || null,
        paymentDueDate: paymentDueDate || null,
        basisText: basisText || null,
        clientInvoiceSeries: clientInvoiceSeries || null,
        carrierInvoiceSeries: carrierInvoiceSeries || null,
        taxCode: taxCode.trim() || null,
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
        customsDeparture: customsDeparture || null,
        customsDestination: customsDestination || null,
        cargoName: cargoName || null,
        cargoValue: cargoValue ? Number(cargoValue) : null,
        truckType: truckType || null,
        loadingAddress: loadingAddress || null,
        unloadingAddress: unloadingAddress || null,
        trailerPlate: trailerPlate || null,
        additionalTerms: additionalTerms || null,
        expenses: [
          ...clientExpenses.map((e: Expense) => ({ ...e, description: '' })),
          ...carrierExpenses.map((e: Expense) => ({ ...e, description: '__carrier__' })),
        ],
      };

      const url = isEdit ? `/api/trips/${tripId}` : '/api/trips';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { appToast.error(data?.error ?? 'Ошибка сохранения'); return; }

      if (Array.isArray(data?.warnings) && data.warnings.length > 0) {
        appToast.warning(data.warnings.join('\n\n'));
      }
      appToast.success(isEdit ? 'Заявка сохранена' : 'Заявка создана');
      if (data?.status && isEdit) {
        setStatus(data.status === 'paid' ? 'completed' : data.status);
      }
      if (data?.unloadDate) setUnloadDate(String(data.unloadDate).slice(0, 10));
      if (data?.paymentDueDate) setPaymentDueDate(String(data.paymentDueDate).slice(0, 10));

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
      appToast.error('Ошибка соединения');
    } finally {
      actionLockRef.current.save = false;
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

      {/* ═══ Статус ═══ */}
      {isEdit && (
        <div className="bg-card rounded-xl px-4 py-3 shadow-sm border mb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              {(['new', 'in_progress', 'unloaded', 'awaiting_payment', 'sverka', 'completed'] as const).map((key, idx) => {
                const FLOW_LABELS: Record<string, string> = {
                  new: 'Новая',
                  in_progress: 'В пути',
                  unloaded: 'Разгружен',
                  awaiting_payment: 'На оплату',
                  sverka: 'Сверка',
                  completed: 'Завершён',
                };
                const FLOW_COLORS: Record<string, string> = {
                  new: 'bg-blue-500',
                  in_progress: 'bg-amber-500',
                  unloaded: 'bg-orange-500',
                  awaiting_payment: 'bg-purple-500',
                  sverka: 'bg-teal-500',
                  completed: 'bg-green-500',
                };
                const FLOW = ['new', 'in_progress', 'unloaded', 'awaiting_payment', 'sverka', 'completed'];
                const canonSt = (status === 'paid' ? 'completed' : status) as string;
                const currentIdx = FLOW.indexOf(isArchived ? '' : canonSt);
                const active = !isArchived && canonSt === key;
                const isAllowed = !isArchived && !active && Math.abs(currentIdx - idx) <= 1;
                // Block sverka->completed if conditions unmet
                const completionBlocks: string[] = [];
                if (key === 'completed' && canonSt === 'sverka') {
                  const cDebt = Math.round(totalClientAmd - clientPaidAmd);
                  const crDebt = Math.round(totalCarrierAmd - carrierPaidAmd);
                  if (cDebt > 0) completionBlocks.push(`❌ Клиент не полностью оплатил (остаток: ${cDebt.toLocaleString('ru-RU')} AMD)`);
                  if (tripType === 'expedition' && crDebt > 0) completionBlocks.push(`❌ Перевозчик не получил полную оплату (остаток: ${crDebt.toLocaleString('ru-RU')} AMD)`);
                  if (!taxCode.trim()) completionBlocks.push('❌ Налоговый код не заполнен');
                }
                const isBlocked = completionBlocks.length > 0;
                return (
                  <div key={key} className="flex items-center gap-1">
                    {idx > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
                    <button
                      type="button"
                      onClick={() => { if (isAllowed && !isBlocked) setStatus(key); }}
                      disabled={!isAllowed || isBlocked}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        active
                          ? `${FLOW_COLORS[key]} text-white ring-2 ring-offset-1 ring-primary/60`
                          : isBlocked
                          ? 'bg-red-100 text-red-400 cursor-not-allowed border border-red-200'
                          : isAllowed
                          ? 'bg-muted/50 text-muted-foreground hover:bg-muted border border-border/50'
                          : 'text-muted-foreground/40 cursor-not-allowed'
                      }`}
                    >
                      {FLOW_LABELS[key]}
                    </button>
                  </div>
                );
              })}
              {/* Conditions blocking Сверка→Завершён */}
              {status === 'sverka' && !isArchived && (() => {
                const cDebt = Math.round(totalClientAmd - clientPaidAmd);
                const crDebt = Math.round(totalCarrierAmd - carrierPaidAmd);
                const blocks: string[] = [];
                if (cDebt > 0) blocks.push(`❌ Клиент не полностью оплатил (остаток: ${cDebt.toLocaleString('ru-RU')} AMD)`);
                if (tripType === 'expedition' && crDebt > 0) blocks.push(`❌ Перевозчик не получил полную оплату (остаток: ${crDebt.toLocaleString('ru-RU')} AMD)`);
                if (!taxCode.trim()) blocks.push('❌ Налоговый код не заполнен');
                if (blocks.length === 0) return null;
                return (
                  <div className="w-full mt-2 p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-[11px] font-semibold text-red-700 dark:text-red-300 mb-1">Для перехода в «Завершён» необходимо:</p>
                    {blocks.map((b, i) => <p key={i} className="text-[11px] text-red-600 dark:text-red-400">{b}</p>)}
                  </div>
                );
              })()}
              {isArchived && (
                <div className="flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500 text-white ring-2 ring-offset-1 ring-slate-400">Архив ✓</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {isFinanciallyCompleted && !isArchived && (
                <button type="button" onClick={handleArchiveToggle} disabled={archiving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 text-white text-xs font-medium rounded-lg hover:bg-slate-700 disabled:opacity-60 transition">
                  <Archive className="w-3.5 h-3.5" />
                  {archiving ? '...' : 'В архив'}
                </button>
              )}
              {isArchived && (
                <button type="button" onClick={handleArchiveToggle} disabled={archiving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-500 text-white text-xs font-medium rounded-lg hover:bg-slate-600 disabled:opacity-60 transition">
                  <Archive className="w-3.5 h-3.5" />
                  {archiving ? '...' : 'Из архива'}
                </button>
              )}
              {(isFinanciallyCompleted || isArchived) && (
                <button type="button" onClick={handleReopenTrip} disabled={reopeningTrip}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 disabled:opacity-60 transition">
                  <Unlock className="w-3.5 h-3.5" />
                  {reopeningTrip ? 'Открытие...' : 'Открыть снова'}
                </button>
              )}
              {(isFinanciallyCompleted || status === 'sverka') && !isArchived && (
                <span className={`text-xs font-medium ml-1 ${taxCode.trim() ? 'text-emerald-700' : 'text-amber-700'}`}>{taxCodeIndicatorLabel(taxCode)}</span>
              )}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset disabled={formLocked} className={`space-y-6 ${formLocked ? 'opacity-70 pointer-events-none' : ''}`}>
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
              <input type="number" min={0} value={distance} onChange={(e) => setDistance(e.target.value ? Number(e.target.value) : '')} placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"  onWheel={(e) => e.currentTarget.blur()}/>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Вес груза (т)</label>
              <input type="number" min={0} step="0.1" value={cargoWeight} onChange={(e) => setCargoWeight(e.target.value ? Number(e.target.value) : '')} placeholder="20" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"  onWheel={(e) => e.currentTarget.blur()}/>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Дата разгрузки</label>
                <input
                  type="date"
                  value={unloadDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setUnloadDate(v);
                    applyPaymentDueFromUnload(v);
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Срок оплаты</label>
                <input
                  type="date"
                  value={paymentDueDate}
                  onChange={(e) => {
                    paymentDueManualRef.current = true;
                    setPaymentDueDate(e.target.value);
                    if (e.target.value) setUnloadPaymentHint('');
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
            </div>
            {unloadPaymentHint ? (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {unloadPaymentHint}
              </p>
            ) : null}
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
              <div>
                <span className="text-muted-foreground">Срок оплаты, дней</span>
                <p className="font-medium mt-0.5">
                  {selectedClient.paymentTermsDays != null
                    ? `${selectedClient.paymentTermsDays} дн.`
                    : '—'}
                </p>
              </div>
            </div>
            {selectedContact && (
              <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                <p className="text-[10px] text-muted-foreground mb-1">{"\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u043D\u043E\u0435 \u043B\u0438\u0446\u043E"}</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-semibold">{selectedContact.name}</span>
                  {selectedContact.phone && (
                    <a href={`tel:${selectedContact.phone}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                      ☎ {selectedContact.phone}
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
              🚚 Собственные машины
            </button>
            <button type="button" onClick={() => setTripType('expedition')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition ${tripType === 'expedition' ? 'border-primary bg-primary/5 text-primary' : 'border-muted hover:border-primary/30'}`}>
              🏢 Экспедиция
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
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{"\u041F\u0435\u0440\u0435\u0432\u043E\u0437\u0447\u0438\u043A"}</label>
              <select value={carrierId} onChange={(e) => setCarrierId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                <option value="">{"\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0435\u0440\u0435\u0432\u043E\u0437\u0447\u0438\u043A\u0430"}</option>
                {(carriers ?? []).map((c: any) => <option key={c?.id} value={c?.id}>{c?.name}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">{"\u0421\u0442\u0430\u0432\u043A\u0430 \u0438 \u0432\u0430\u043B\u044E\u0442\u0430 \u043F\u0435\u0440\u0435\u0432\u043E\u0437\u0447\u0438\u043A\u0430 \u2014 \u0432 \u0431\u043B\u043E\u043A\u0435 \u00AB\u0424\u0438\u043D\u0430\u043D\u0441\u044B\u00BB \u043D\u0438\u0436\u0435"}</p>
            </div>
          )}
        </div>

      </fieldset>

        {/* Finance Summary */}
        <div className="bg-card rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary" /> {"\u0424\u0438\u043d\u0430\u043d\u0441\u044b"}</h3>

          {/* \u0421\u0442\u0440\u043e\u043a\u0430 \u043f\u0440\u0438\u0431\u044b\u043b\u0438 */}
          {isEdit && (
            <div className={`flex items-center justify-between rounded-lg p-3 ${profitAmd >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}>
              <div className="flex items-center gap-3 text-xs flex-wrap">
                <span className="text-muted-foreground">{"Клиент:"}</span>
                <span className="font-mono font-semibold text-blue-700 dark:text-blue-300">{totalClientAmd.toLocaleString('ru-RU')} {"֏"}</span>
                {tripType === 'expedition' && (<>
                  <span className="text-muted-foreground">{"−"}</span>
                  <span className="text-muted-foreground">{"Перевозчик:"}</span>
                  <span className="font-mono font-semibold text-red-600">{totalCarrierAmd.toLocaleString('ru-RU')} {"֏"}</span>
                </>)}
                <span className="text-muted-foreground">{"="}</span>
              </div>
              <span className={`text-lg font-bold font-mono ${profitAmd >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                {profitAmd.toLocaleString('ru-RU')} {"\u058F"}
              </span>
            </div>
          )}

          {/* \u041a\u0430\u0441\u0441\u043e\u0432\u044b\u0439 \u0440\u0430\u0437\u0440\u044b\u0432 */}
          {isEdit && tripType === 'expedition' && carrierPaidAmd > clientPaidAmd && (
            <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 dark:text-amber-200 space-y-0.5">
                <p className="font-semibold">{"\u041a\u0430\u0441\u0441\u043e\u0432\u044b\u0439 \u0440\u0430\u0437\u0440\u044b\u0432 \u2014 \u043c\u044b \u0432\u043b\u043e\u0436\u0438\u043b\u0438 \u0441\u0432\u043e\u0438 \u0434\u0435\u043d\u044c\u0433\u0438"}</p>
                <p>{"\u0412\u044b\u043f\u043b\u0430\u0447\u0435\u043d\u043e \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0443: "}<span className="font-mono font-semibold">{carrierPaidAmd.toLocaleString('ru-RU')} {"\u058F"}</span>{" \u00b7 \u041f\u043e\u043b\u0443\u0447\u0435\u043d\u043e \u043e\u0442 \u043a\u043b\u0438\u0435\u043d\u0442\u0430: "}<span className="font-mono font-semibold">{clientPaidAmd.toLocaleString('ru-RU')} {"\u058F"}</span>{" \u00b7 \u0420\u0430\u0437\u0440\u044b\u0432: "}<span className="font-mono font-semibold text-amber-900 dark:text-amber-100">{(carrierPaidAmd - clientPaidAmd).toLocaleString('ru-RU')} {"\u058F"}</span></p>
              </div>
            </div>
          )}

          {/* \u0414\u0432\u0435 \u043a\u043e\u043b\u043e\u043d\u043a\u0438 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* \u041a\u041b\u0418\u0415\u041d\u0422 */}
            <div className="space-y-4">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide border-b border-blue-100 dark:border-blue-900 pb-2">{"\u041a\u043b\u0438\u0435\u043d\u0442"}</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{"\u0412\u0430\u043b\u044e\u0442\u0430"}</label>
                  <select value={currency} onChange={(e) => handleCurrencyChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c} {CURRENCY_SYMBOLS[c]}</option>)}
                  </select>
                </div>
                {currency !== 'AMD' && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{"\u041a\u0443\u0440\u0441 \u043a AMD"}</label>
                    <div className="flex gap-1">
                      <input type="text" inputMode="decimal" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} className={`flex-1 ${RATE_INPUT_CLASS}`} />
                      {dailyRates[currency] > 0 && (
                        <button type="button" onClick={applyDailyRate} title={`\u041a\u0443\u0440\u0441 \u0434\u043d\u044f: ${dailyRates[currency]}`} className="px-2 py-2 border rounded-lg text-xs hover:bg-muted transition flex items-center gap-1 whitespace-nowrap">
                          <RefreshCw className="w-3 h-3" /> {dailyRates[currency]}
                        </button>
                      )}
                    </div>
                    {dailyRates[currency] > 0 && Math.abs(parseRateInput(exchangeRate) - dailyRates[currency]) / dailyRates[currency] > 0.15 && (
                      <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" /> {"\u041a\u0443\u0440\u0441 \u043e\u0442\u043b\u0438\u0447\u0430\u0435\u0442\u0441\u044f \u043e\u0442 \u0434\u043d\u0435\u0432\u043d\u043e\u0433\u043e \u0431\u043e\u043b\u0435\u0435 \u0447\u0435\u043c \u043d\u0430 15%"}</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{"\u0421\u0442\u0430\u0432\u043a\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430"}, {CURRENCY_SYMBOLS[currency] || currency} *</label>
                <input type="number" min={0} value={clientRate} onChange={(e) => setClientRate(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-mono" required  onWheel={(e) => e.currentTarget.blur()}/>
                {currency !== 'AMD' && (
                  <p className="text-xs font-mono text-muted-foreground mt-1">{clientRateAmd.toLocaleString('ru-RU')} {"\u058F"}</p>
                )}
              </div>

              {lastRateHint && !isEdit && (
                <button type="button" onClick={() => { setClientRate(lastRateHint.rate); if (lastRateHint.currency !== currency) handleCurrencyChange(lastRateHint.currency); }}
                  className="w-full text-left text-[11px] bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg px-2.5 py-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition">
                  <span className="text-blue-800 dark:text-blue-300">{"\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u044f\u044f \u0441\u0442\u0430\u0432\u043a\u0430: "}<strong>{lastRateHint.rate.toLocaleString('ru-RU')} {CURRENCY_SYMBOLS[lastRateHint.currency] || lastRateHint.currency}</strong> ({lastRateHint.date})</span>
                  <span className="text-blue-600 dark:text-blue-400 ml-1">{"\u2190 \u043f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c"}</span>
                </button>
              )}

              {/* Доп. расходы клиента */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Доп. расходы</span>
                  <button type="button" onClick={addClientExpense} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Plus className="w-3 h-3" /> Добавить
                  </button>
                </div>
                {clientExpenses.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2 bg-muted/20 rounded">Нет расходов</p>
                ) : (
                  <div className="space-y-2">
                    {clientExpenses.map((exp: Expense, idx: number) => (
                      <div key={idx} className="p-2 bg-muted/40 rounded-lg">
                        <div className="flex gap-1.5 flex-wrap items-center">
                          <select value={exp.expenseType} onChange={(e) => updateClientExpense(idx, 'expenseType', e.target.value)} className="border rounded px-2 py-1.5 text-xs bg-background flex-1 min-w-[90px]">
                            {Object.entries(EXPENSE_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <input type="number" min={0} value={exp.amount} onChange={(e) => updateClientExpense(idx, 'amount', Number(e.target.value))} placeholder="Сумма" className="border rounded px-2 py-1.5 text-xs bg-background w-20 font-mono"  onWheel={(e) => e.currentTarget.blur()}/>
                          <select value={exp.currency} onChange={(e) => updateClientExpense(idx, 'currency', e.target.value)} className="border rounded px-2 py-1.5 text-xs bg-background w-[68px]">
                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          {exp.currency !== 'AMD' && (
                            <input type="text" inputMode="decimal" value={exp.exchangeRate} onChange={(e) => updateClientExpense(idx, 'exchangeRate', parseRateInput(e.target.value) || 1)} className="border rounded px-2 py-1.5 text-xs bg-background w-16 font-mono" placeholder="Курс" />
                          )}
                          {exp.currency !== 'AMD' && dailyRates[exp.currency] > 0 && Number(exp.exchangeRate) !== dailyRates[exp.currency] && (
                            <button type="button" onClick={() => updateClientExpense(idx, 'exchangeRate', dailyRates[exp.currency])} className="text-[10px] text-primary hover:underline self-center px-1">{dailyRates[exp.currency]}</button>
                          )}
                          {exp.currency !== 'AMD' && (
                            <span className="text-xs font-mono text-amber-600 self-center whitespace-nowrap">{exp.amountAmd.toLocaleString('ru-RU')} ֏</span>
                          )}
                          <button type="button" onClick={() => removeClientExpense(idx)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition ml-auto shrink-0" title="Удалить">
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1.5 border-t border-muted">
                      <span className="text-xs text-muted-foreground">Итого расходы</span>
                      <span className="text-sm font-bold font-mono text-red-600">{totalClientExpensesAmd.toLocaleString('ru-RU')} ֏</span>
                    </div>
                  </div>
                )}
              </div>

              {/* \u0418\u0422\u041e\u0413\u041e \u041a\u041b\u0418\u0415\u041d\u0422 */}
              <div className="bg-blue-50/60 dark:bg-blue-950/15 rounded-lg p-3 border border-blue-100 dark:border-blue-900">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">{"Итого (AMD)"}</span>
                  <span className="text-base font-bold font-mono text-blue-700 dark:text-blue-300">{totalClientAmd.toLocaleString('ru-RU')} {"֏"}</span>
                </div>
                {isEdit && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">{"Оплачено: "}</span><span className="font-mono font-semibold text-green-600">{clientPaidAmd.toLocaleString('ru-RU')} {"֏"}</span></div>
                    <div><span className="text-muted-foreground">{"Остаток: "}</span><span className={`font-mono font-semibold ${totalClientAmd - clientPaidAmd > 0 ? 'text-red-600' : 'text-green-600'}`}>{(totalClientAmd - clientPaidAmd).toLocaleString('ru-RU')} {"֏"}</span></div>
                  </div>
                )}
              </div>

              {/* \u041e\u043f\u043b\u0430\u0442\u044b \u043a\u043b\u0438\u0435\u043d\u0442\u0430 */}
              {isEdit && (
                <div className="space-y-2">
                  <div className="flex items-center justify-end gap-3">
                    {totalClientAmd - clientPaidAmd > 0 && (
                      <button type="button" onClick={() => {
                        const rem = totalClientAmd - clientPaidAmd;
                        const now = new Date();
                        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                        setPayForm({ amount: String(rem), currency: 'AMD', exchangeRate: '1', paymentDate: dateStr, description: '\u041f\u043e\u043b\u043d\u0430\u044f \u043e\u043f\u043b\u0430\u0442\u0430', method: 'bank_transfer' });
                        setShowPayForm('client');
                      }} className="text-xs text-green-600 hover:text-green-800 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {"\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e \u043f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e"}
                      </button>
                    )}
                    <button type="button" onClick={() => openPayForm('client')} className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 flex items-center gap-1">
                      <Plus className="w-3 h-3" /> {"\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043e\u043f\u043b\u0430\u0442\u0443"}
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
                              <span className="text-muted-foreground">{"\u00d7 "}{Number(p.exchangeRate)}{" \u2192 "}<span className="font-semibold text-blue-600">{p.amountAmd.toLocaleString('ru-RU')} {"\u058F"}</span></span>
                            )}
                            {p.description && <span className="text-muted-foreground truncate">{"\u2014 "}{p.description}</span>}
                          </div>
                          <button type="button" onClick={() => handleDeletePayment(p.id)} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition p-1 shrink-0" title={"\u0423\u0434\u0430\u043b\u0438\u0442\u044c"}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {showPayForm === 'client' && (
                    <div className="bg-blue-50/50 dark:bg-blue-950/20 rounded-lg p-3 space-y-2 border border-dashed border-blue-300 dark:border-blue-700">
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">{"\u041d\u043e\u0432\u0430\u044f \u043e\u043f\u043b\u0430\u0442\u0430 \u043e\u0442 \u043a\u043b\u0438\u0435\u043d\u0442\u0430"}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground">{"\u0421\u0443\u043c\u043c\u0430 *"}</label>
                          <input type="number" step="0.01" min="0" value={payForm.amount}
                            onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                            className="w-full border rounded-md px-2 py-1.5 text-sm bg-background font-mono" placeholder="0" autoFocus  onWheel={(e) => e.currentTarget.blur()}/>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">{"\u0412\u0430\u043b\u044e\u0442\u0430"}</label>
                          <select value={payForm.currency}
                            onChange={e => { const cur = e.target.value; setPayForm(f => ({ ...f, currency: cur, exchangeRate: cur === 'AMD' ? '1' : f.exchangeRate })); }}
                            className="w-full border rounded-md px-2 py-1.5 text-sm bg-background">
                            {CURRENCIES.map(c => <option key={c} value={c}>{c} {CURRENCY_SYMBOLS[c]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">{"\u041a\u0443\u0440\u0441"}</label>
                          <input type="text" inputMode="decimal" value={payForm.exchangeRate}
                            onChange={e => setPayForm(f => ({ ...f, exchangeRate: e.target.value }))}
                            disabled={payForm.currency === 'AMD'}
                            className={`w-full ${RATE_INPUT_CLASS} !rounded-md disabled:opacity-50`} />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">{"\u0414\u0430\u0442\u0430 *"}</label>
                          <input type="date" value={payForm.paymentDate}
                            onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))}
                            className="w-full border rounded-md px-2 py-1.5 text-sm bg-background" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{"\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439"}</label>
                        <input type="text" value={payForm.description}
                          onChange={e => setPayForm(f => ({ ...f, description: e.target.value }))}
                          className="w-full border rounded-md px-2 py-1.5 text-sm bg-background"
                          placeholder={"\u041f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435 \u043a \u043e\u043f\u043b\u0430\u0442\u0435"} />
                      </div>
                      {payForm.currency !== 'AMD' && Number(payForm.amount) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {Number(payForm.amount).toLocaleString('ru-RU')} {payForm.currency} {"\u00d7"} {payForm.exchangeRate} = <span className="font-mono font-semibold">{payComputedAmd.toLocaleString('ru-RU')} {"\u058F"}</span>
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button type="button" onClick={handleSavePayment} disabled={savingPay || !payForm.amount || Number(payForm.amount) <= 0}
                          className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                          {savingPay ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...' : '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c'}
                        </button>
                        <button type="button" onClick={() => setShowPayForm(null)}
                          className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">{"\u041e\u0442\u043c\u0435\u043d\u0430"}</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* \u041f\u0415\u0420\u0415\u0412\u041e\u0417\u0427\u0418\u041a (expedition only) */}
            {tripType === 'expedition' && (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 uppercase tracking-wide border-b border-orange-100 dark:border-orange-900 pb-2">{"\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a"}</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{"\u0412\u0430\u043b\u044e\u0442\u0430"}</label>
                    <select value={carrierCurrency} onChange={(e) => handleCarrierCurrencyChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                      {CURRENCIES.map(c => <option key={c} value={c}>{c} {CURRENCY_SYMBOLS[c]}</option>)}
                    </select>
                  </div>
                  {carrierCurrency !== 'AMD' && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{"\u041a\u0443\u0440\u0441 \u043a AMD"}</label>
                      <div className="flex gap-1">
                        <input type="text" inputMode="decimal" value={carrierExchangeRate} onChange={(e) => setCarrierExchangeRate(e.target.value)} className={`flex-1 ${RATE_INPUT_CLASS}`} />
                        {dailyRates[carrierCurrency] > 0 && (
                          <button type="button" onClick={applyCarrierDailyRate} title={`\u041a\u0443\u0440\u0441 \u0434\u043d\u044f: ${dailyRates[carrierCurrency]}`} className="px-2 py-2 border rounded-lg text-xs hover:bg-muted transition flex items-center gap-1 whitespace-nowrap">
                            <RefreshCw className="w-3 h-3" /> {dailyRates[carrierCurrency]}
                          </button>
                        )}
                      </div>
                      {dailyRates[carrierCurrency] > 0 && Math.abs(parseRateInput(carrierExchangeRate) - dailyRates[carrierCurrency]) / dailyRates[carrierCurrency] > 0.15 && (
                        <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" /> {"\u041a\u0443\u0440\u0441 \u043e\u0442\u043b\u0438\u0447\u0430\u0435\u0442\u0441\u044f \u0431\u043e\u043b\u0435\u0435 \u0447\u0435\u043c \u043d\u0430 15%"}</p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{"\u0421\u0442\u0430\u0432\u043a\u0430 \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0430"}, {CURRENCY_SYMBOLS[carrierCurrency] || carrierCurrency}</label>
                  <input type="number" min={0} value={carrierRate} onChange={(e) => setCarrierRate(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-mono"  onWheel={(e) => e.currentTarget.blur()}/>
                  {carrierCurrency !== 'AMD' && (
                    <p className="text-xs font-mono text-muted-foreground mt-1">{carrierRateAmd.toLocaleString('ru-RU')} {"\u058F"}</p>
                  )}
                </div>

                {/* Доп. расходы перевозчика */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Доп. расходы</span>
                    <button type="button" onClick={addCarrierExpense} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <Plus className="w-3 h-3" /> Добавить
                    </button>
                  </div>
                  {carrierExpenses.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2 bg-muted/20 rounded">Нет расходов</p>
                  ) : (
                    <div className="space-y-2">
                      {carrierExpenses.map((exp: Expense, idx: number) => (
                        <div key={idx} className="p-2 bg-muted/40 rounded-lg">
                          <div className="flex gap-1.5 flex-wrap items-center">
                            <select value={exp.expenseType} onChange={(e) => updateCarrierExpense(idx, 'expenseType', e.target.value)} className="border rounded px-2 py-1.5 text-xs bg-background flex-1 min-w-[90px]">
                              {Object.entries(EXPENSE_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                            <input type="number" min={0} value={exp.amount} onChange={(e) => updateCarrierExpense(idx, 'amount', Number(e.target.value))} placeholder="Сумма" className="border rounded px-2 py-1.5 text-xs bg-background w-20 font-mono"  onWheel={(e) => e.currentTarget.blur()}/>
                            <select value={exp.currency} onChange={(e) => updateCarrierExpense(idx, 'currency', e.target.value)} className="border rounded px-2 py-1.5 text-xs bg-background w-[68px]">
                              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            {exp.currency !== 'AMD' && (
                              <input type="text" inputMode="decimal" value={exp.exchangeRate} onChange={(e) => updateCarrierExpense(idx, 'exchangeRate', parseRateInput(e.target.value) || 1)} className="border rounded px-2 py-1.5 text-xs bg-background w-16 font-mono" placeholder="Курс" />
                            )}
                            {exp.currency !== 'AMD' && dailyRates[exp.currency] > 0 && Number(exp.exchangeRate) !== dailyRates[exp.currency] && (
                              <button type="button" onClick={() => updateCarrierExpense(idx, 'exchangeRate', dailyRates[exp.currency])} className="text-[10px] text-primary hover:underline self-center px-1">{dailyRates[exp.currency]}</button>
                            )}
                            {exp.currency !== 'AMD' && (
                              <span className="text-xs font-mono text-amber-600 self-center whitespace-nowrap">{exp.amountAmd.toLocaleString('ru-RU')} ֏</span>
                            )}
                            <button type="button" onClick={() => removeCarrierExpense(idx)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition ml-auto shrink-0" title="Удалить">
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-1.5 border-t border-muted">
                        <span className="text-xs text-muted-foreground">Итого расходы</span>
                        <span className="text-sm font-bold font-mono text-red-600">{totalCarrierExpensesAmd.toLocaleString('ru-RU')} ֏</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-orange-50/60 dark:bg-orange-950/15 rounded-lg p-3 border border-orange-100 dark:border-orange-900">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">{"\u0418\u0442\u043e\u0433\u043e (AMD)"}</span>
                    <span className="text-base font-bold font-mono text-orange-700 dark:text-orange-300">{totalCarrierAmd.toLocaleString('ru-RU')} {"\u058F"}</span>
                  </div>
                  {isEdit && (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">{"\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e: "}</span><span className="font-mono font-semibold text-green-600">{carrierPaidAmd.toLocaleString('ru-RU')} {"\u058F"}</span></div>
                      <div><span className="text-muted-foreground">{"\u041e\u0441\u0442\u0430\u0442\u043e\u043a: "}</span><span className={`font-mono font-semibold ${totalCarrierAmd - carrierPaidAmd > 0 ? 'text-red-600' : 'text-green-600'}`}>{(totalCarrierAmd - carrierPaidAmd).toLocaleString('ru-RU')} {"\u058F"}</span></div>
                    </div>
                  )}
                </div>

                {isEdit && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-end gap-3">
                      {totalCarrierAmd - carrierPaidAmd > 0 && (
                        <button type="button" onClick={() => {
                          const rem = totalCarrierAmd - carrierPaidAmd;
                          const now = new Date();
                          const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                          setPayForm({ amount: String(rem), currency: 'AMD', exchangeRate: '1', paymentDate: dateStr, description: '\u041f\u043e\u043b\u043d\u0430\u044f \u043e\u043f\u043b\u0430\u0442\u0430', method: 'bank_transfer' });
                          setShowPayForm('carrier');
                        }} className="text-xs text-green-600 hover:text-green-800 dark:text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {"\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e \u043f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e"}
                        </button>
                      )}
                      <button type="button" onClick={() => openPayForm('carrier')} className="text-xs text-orange-600 hover:text-orange-800 dark:text-orange-400 flex items-center gap-1">
                        <Plus className="w-3 h-3" /> {"\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043e\u043f\u043b\u0430\u0442\u0443"}
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
                                <span className="text-muted-foreground">{"\u00d7 "}{Number(p.exchangeRate)}{" \u2192 "}<span className="font-semibold text-orange-600">{p.amountAmd.toLocaleString('ru-RU')} {"\u058F"}</span></span>
                              )}
                              {p.description && <span className="text-muted-foreground truncate">{"\u2014 "}{p.description}</span>}
                            </div>
                            <button type="button" onClick={() => handleDeletePayment(p.id)} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition p-1 shrink-0" title={"\u0423\u0434\u0430\u043b\u0438\u0442\u044c"}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {showPayForm === 'carrier' && (
                      <div className="bg-orange-50/50 dark:bg-orange-950/20 rounded-lg p-3 space-y-2 border border-dashed border-orange-300 dark:border-orange-700">
                        <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">{"\u041d\u043e\u0432\u0430\u044f \u043e\u043f\u043b\u0430\u0442\u0430 \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0443"}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground">{"\u0421\u0443\u043c\u043c\u0430 *"}</label>
                            <input type="number" step="0.01" min="0" value={payForm.amount}
                              onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                              className="w-full border rounded-md px-2 py-1.5 text-sm bg-background font-mono" placeholder="0" autoFocus  onWheel={(e) => e.currentTarget.blur()}/>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">{"\u0412\u0430\u043b\u044e\u0442\u0430"}</label>
                            <select value={payForm.currency}
                              onChange={e => { const cur = e.target.value; setPayForm(f => ({ ...f, currency: cur, exchangeRate: cur === 'AMD' ? '1' : f.exchangeRate })); }}
                              className="w-full border rounded-md px-2 py-1.5 text-sm bg-background">
                              {CURRENCIES.map(c => <option key={c} value={c}>{c} {CURRENCY_SYMBOLS[c]}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">{"\u041a\u0443\u0440\u0441"}</label>
                            <input type="text" inputMode="decimal" value={payForm.exchangeRate}
                              onChange={e => setPayForm(f => ({ ...f, exchangeRate: e.target.value }))}
                              disabled={payForm.currency === 'AMD'}
                              className={`w-full ${RATE_INPUT_CLASS} !rounded-md disabled:opacity-50`} />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">{"\u0414\u0430\u0442\u0430 *"}</label>
                            <input type="date" value={payForm.paymentDate}
                              onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))}
                              className="w-full border rounded-md px-2 py-1.5 text-sm bg-background" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">{"\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439"}</label>
                          <input type="text" value={payForm.description}
                            onChange={e => setPayForm(f => ({ ...f, description: e.target.value }))}
                            className="w-full border rounded-md px-2 py-1.5 text-sm bg-background"
                            placeholder={"\u041f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435 \u043a \u043e\u043f\u043b\u0430\u0442\u0435"} />
                        </div>
                        {payForm.currency !== 'AMD' && Number(payForm.amount) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {Number(payForm.amount).toLocaleString('ru-RU')} {payForm.currency} {"\u00d7"} {payForm.exchangeRate} = <span className="font-mono font-semibold">{payComputedAmd.toLocaleString('ru-RU')} {"\u058F"}</span>
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button type="button" onClick={handleSavePayment} disabled={savingPay || !payForm.amount || Number(payForm.amount) <= 0}
                            className="px-3 py-1.5 text-xs font-medium bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50">
                            {savingPay ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...' : '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c'}
                          </button>
                          <button type="button" onClick={() => setShowPayForm(null)}
                            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">{"\u041e\u0442\u043c\u0435\u043d\u0430"}</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>


          {/* ═══ Документы ═══ */}
          <div className="pt-3 border-t border-dashed space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-primary" /> Документы заявки
            </label>
            <p className="text-[11px] text-muted-foreground">
              Статусы показываются отдельно по секциям: договор-заявка, счёт, акт, подписанные и прочие документы.
            </p>
            {existingAttachments.length > 0 && (
              <p className="text-[11px] text-muted-foreground">Всего сохранено файлов: {existingAttachments.length}</p>
            )}

            <input
              ref={contractInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => { addPendingFiles(e.target.files, 'contract'); e.target.value = ''; }}
            />
            <input
              ref={invoiceInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => { addPendingFiles(e.target.files, 'invoice'); e.target.value = ''; }}
            />
            <input
              ref={actInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => { addPendingFiles(e.target.files, 'act'); e.target.value = ''; }}
            />
            <input
              ref={otherInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => { addPendingFiles(e.target.files, 'other'); e.target.value = ''; }}
            />
            <input
              ref={signedInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => { addPendingFiles(e.target.files, 'signed'); e.target.value = ''; }}
            />

            {(['contract', 'invoice', 'act', 'signed', 'other'] as TripAttachmentSection[]).map((section) => {
              const queued = pendingFiles.filter((p) => p.section === section);
              const existing = existingAttachments
                .filter((a) => detectTripAttachmentSection(a) === section)
                .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
              const hasAny = queued.length + existing.length > 0;
              const viewableAttachment = existing.find((a) => a.downloadUrl) ?? existing[0] ?? null;
              const openPicker = () => {
                if (section === 'contract') contractInputRef.current?.click();
                if (section === 'invoice') invoiceInputRef.current?.click();
                if (section === 'act') actInputRef.current?.click();
                if (section === 'signed') signedInputRef.current?.click();
                if (section === 'other') otherInputRef.current?.click();
              };
              const openSectionView = () => {
                if (!viewableAttachment?.downloadUrl) return;
                openTripAttachment({
                  downloadUrl: viewableAttachment.downloadUrl,
                  fileName: viewableAttachment.fileName,
                  fileType: viewableAttachment.fileType,
                });
              };
              return (
                <div key={section} className="rounded-xl border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{TRIP_ATTACHMENT_SECTION_LABELS[section]}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${hasAny ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                      {hasAny ? `${existing.length + queued.length} файл(ов)` : 'Нет файла'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={openPicker}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 transition"
                    >
                      <FileUp className="w-3.5 h-3.5" /> Загрузить файл
                    </button>
                    {viewableAttachment?.downloadUrl && (
                      <button
                        type="button"
                        onClick={openSectionView}
                        className="inline-flex items-center gap-2 px-3 py-1.5 border border-primary/30 text-primary text-xs font-medium rounded-lg hover:bg-primary/5 transition"
                      >
                        <Eye className="w-3.5 h-3.5" /> Просмотр
                      </button>
                    )}
                    <span className="text-[10px] text-muted-foreground">{isEdit ? 'Файл привяжется к текущей заявке' : 'Файл привяжется после сохранения заявки'}</span>
                  </div>
                  {queued.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-muted-foreground">{isEdit ? 'К загрузке:' : 'Загрузятся после сохранения:'}</p>
                      {queued.map((p) => {
                        const idx = pendingFiles.findIndex((x) => x === p);
                        const f = p.file;
                        const isPdf = (f.type || '').toLowerCase().includes('pdf') || f.name.toLowerCase().endsWith('.pdf');
                        const isImage = (f.type || '').toLowerCase().startsWith('image/');
                        return (
                          <div key={`${f.name}-${idx}`} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-xs">
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
                            <button type="button" onClick={() => removePendingFile(idx)} className="p-1 hover:bg-red-100 rounded-md transition" title="Удалить">
                              <X className="w-3 h-3 text-red-500" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {existing.length > 0 && (
                    <div className="space-y-1.5">
                      {existing.map((a) => (
                        <div key={a.id} className="p-2 bg-card border rounded-lg text-xs space-y-2">
                          <div className="flex items-center gap-2">
                            <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            {a.downloadUrl ? (
                              <a
                                href={a.downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 truncate text-primary hover:underline"
                                title="Открыть файл"
                              >
                                {a.fileName}
                              </a>
                            ) : (
                              <div className="flex-1 min-w-0">
                                <p className="truncate text-foreground">{a.fileName}</p>
                                <p className="text-[10px] text-amber-700">Файл есть в базе, ссылка временно недоступна</p>
                              </div>
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">{TRIP_ATTACHMENT_SECTION_LABELS[section]}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-2">
                            <span>Размер: {formatFileSize(a.fileSizeBytes)}</span>
                            <span>Дата: {new Date(a.uploadedAt).toLocaleDateString('ru-RU')}</span>
                            {getTripAttachmentStorageMessage(a) && (
                              <span className="text-amber-700">{getTripAttachmentStorageMessage(a)}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {a.downloadUrl && (
                              <button
                                type="button"
                                onClick={() => openTripAttachment({
                                  downloadUrl: a.downloadUrl as string,
                                  fileName: a.fileName,
                                  fileType: a.fileType,
                                })}
                                className="inline-flex items-center gap-1 px-2 py-1 hover:bg-muted rounded-md transition"
                                title="Просмотр"
                              >
                                <Eye className="w-3 h-3 text-primary" /> Просмотр
                              </button>
                            )}
                            {a.downloadUrl && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!a.downloadUrl) return;
                                  const link = document.createElement('a');
                                  link.href = a.downloadUrl;
                                  link.download = a.fileName;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 hover:bg-primary/10 rounded-md transition"
                                title="Скачать"
                              >
                                <Download className="w-3 h-3 text-primary" /> Скачать
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => replaceExistingAttachment(a, section)}
                              className="inline-flex items-center gap-1 px-2 py-1 hover:bg-amber-100 rounded-md transition"
                              title="Заменить файл"
                            >
                              <RefreshCw className="w-3 h-3 text-amber-700" /> Заменить файл
                            </button>
                            <button type="button" onClick={() => deleteExistingAttachment(a.id)} className="inline-flex items-center gap-1 px-2 py-1 hover:bg-red-100 rounded-md transition" title="Удалить">
                              <Trash2 className="w-3 h-3 text-red-500" /> Удалить
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

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

          {/* ═══ Поля для заявки перевозчику ═══ */}
          {tripType === 'expedition' && (
            <div className="pt-3 border-t border-dashed space-y-3">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <FileText className="w-3 h-3" /> Данные для заявки перевозчику
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Таможня отправления</label>
                  <input type="text" value={customsDeparture} onChange={e => setCustomsDeparture(e.target.value)}
                    placeholder="Гюмри / Меграздзор..." className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Таможня назначения</label>
                  <input type="text" value={customsDestination} onChange={e => setCustomsDestination(e.target.value)}
                    placeholder="Москва / Брест..." className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Наименование груза</label>
                  <input type="text" value={cargoName} onChange={e => setCargoName(e.target.value)}
                    placeholder="Товары народного потребления..." className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Стоимость груза (USD)</label>
                  <input type="number" min="0" step="0.01" value={cargoValue} onChange={e => setCargoValue(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" onWheel={e => e.currentTarget.blur()} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Тип ТС / прицепа</label>
                  <input type="text" value={truckType} onChange={e => setTruckType(e.target.value)}
                    placeholder="Тент 13,6м / рефрижератор..." className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Гос. номер прицепа</label>
                  <input type="text" value={trailerPlate} onChange={e => setTrailerPlate(e.target.value)}
                    placeholder="AA 123 BB" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Адрес загрузки (дополнение)</label>
                  <input type="text" value={loadingAddress} onChange={e => setLoadingAddress(e.target.value)}
                    placeholder="ул. Ленина 5, склад №2..." className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Адрес выгрузки (дополнение)</label>
                  <input type="text" value={unloadingAddress} onChange={e => setUnloadingAddress(e.target.value)}
                    placeholder="ул. Фрунзе 10..." className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Дополнительные условия</label>
                <textarea value={additionalTerms} onChange={e => setAdditionalTerms(e.target.value)}
                  placeholder="Особые требования к перевозке..." rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" />
              </div>
            </div>
          )}

        </div>

      {/* ═══ Налоговый код (отдельно от серии счёта) ═══ */}
      {isEdit && (
        <div className="bg-card border rounded-xl p-5 space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Налоговый код
          </p>
          <p className={`text-xs font-medium ${taxCode.trim() ? 'text-emerald-700' : 'text-amber-700'}`}>
            {taxCodeIndicatorLabel(taxCode)}
          </p>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Код налоговой</label>
            <input
              type="text"
              value={taxCode}
              onChange={(e) => setTaxCode(e.target.value)}
              disabled={isArchived}
              placeholder="Код после одобрения налоговой"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none disabled:opacity-60"
            />
          </div>
        </div>
      )}


        <div className="flex items-center gap-3 flex-wrap">
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition">
            <Save className="w-4 h-4" /> {saving ? 'Сохранение...' : 'Сохранить заявку'}
          </button>
          <Link href="/trips" className="px-6 py-2.5 border rounded-lg text-sm hover:bg-muted transition">Отмена</Link>
          {isEdit && !isArchived && (
            <button type="button" onClick={handleDeleteTrip} disabled={deleting || saving}
              className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60 transition">
              <Trash2 className="w-4 h-4" />
              {deleting ? 'Удаление...' : 'Удалить заявку'}
            </button>
          )}
        </div>
      </form>

    </div>
  );
}