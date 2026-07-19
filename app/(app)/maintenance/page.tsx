'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Wrench, X, Trash2, Pencil, AlertTriangle, Settings2, Truck, History, ChevronDown, ChevronUp, Gauge, Calendar, Save, Circle, Package, Building2, CreditCard, Paperclip, Upload, Download, DollarSign, FileText, Filter, BarChart3, Fuel } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

/* ─── Types ─── */
interface Vehicle {
  id: string; plateNumber: string; brand: string; model: string; currentMileage: number | null;
}
interface Regulation {
  id: string; name: string; description: string | null; vehicleModel: string | null; mileageInterval: number | null; monthsInterval: number | null;
  _count?: { serviceRecords: number };
}
interface ServiceRecord {
  id: string; vehicleId: string; regulationId: string; date: string; mileage: number; cost: number; comment: string | null;
  vehicle: Vehicle; regulation: { id: string; name: string; mileageInterval: number | null; monthsInterval: number | null };
}
interface RegStatus {
  regulation: { id: string; name: string; vehicleModel: string | null; mileageInterval: number | null; monthsInterval: number | null };
  lastRecord: { id: string; date: string; mileage: number; cost: number } | null;
  nextMileage: number | null; nextDate: string | null;
  remainingKm: number | null; remainingDays: number | null;
  status: 'green' | 'yellow' | 'red';
}
interface VehicleStatus {
  vehicle: Vehicle;
  statuses: RegStatus[];
  overallStatus: 'green' | 'yellow' | 'red';
}
interface SupplierItem {
  id: string; name: string; contactPerson: string | null; phone: string | null; paymentTerms: string | null;
  _count?: { partPurchases: number };
}
interface PartPaymentItem {
  id: string; amount: number; paymentDate: string; notes: string | null;
}
interface PartAttachmentItem {
  id: string; fileName: string; fileType: string; cloudStoragePath: string; isPublic: boolean; url?: string;
}
interface PartPurchaseItem {
  id: string; vehicleId: string; supplierId: string | null; date: string; partName: string;
  quantity: number; unitPrice: number; totalAmount: number; paidAmount: number; paymentStatus: string;
  notes: string | null;
  vehicle: Vehicle; supplier: { id: string; name: string } | null;
  payments: PartPaymentItem[]; attachments: PartAttachmentItem[];
}
interface DebtRow {
  id: string; date: string; partName: string; quantity: number; totalAmount: number; paidAmount: number;
  debtAmount: number; paymentStatus: string;
  vehicle: Vehicle; supplier: { id: string; name: string } | null;
}
interface SupplierDebt {
  supplier: { id: string; name: string };
  totalAmount: number; paidAmount: number; debtAmount: number; count: number;
}

const STATUS_COLOR: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-700',
  yellow: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
};
const STATUS_DOT: Record<string, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
};
const STATUS_LABEL: Record<string, string> = {
  green: '\u0412 \u043d\u043e\u0440\u043c\u0435',
  yellow: '\u0421\u043a\u043e\u0440\u043e \u0422\u041e',
  red: '\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f \u0422\u041e',
};

const PAY_STATUS_MAP: Record<string, string> = { paid: '\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e', unpaid: '\u041d\u0435 \u043e\u043f\u043b\u0430\u0447\u0435\u043d\u043e', partial: '\u0427\u0430\u0441\u0442\u0438\u0447\u043d\u043e' };
const PAY_STATUS_COLOR: Record<string, string> = { paid: 'bg-emerald-100 text-emerald-700', unpaid: 'bg-red-100 text-red-700', partial: 'bg-amber-100 text-amber-700' };

interface TireSet {
  id: string; vehicleId: string | null; brand: string; size: string; position: string | null;
  installDate: string | null; installMileage: number | null; removeDate: string | null; removeMileage: number | null;
  status: string; comment: string | null;
  vehicle: { id: string; plateNumber: string; brand: string; model: string } | null;
}
const TIRE_STATUS_MAP: Record<string, string> = { installed: '\u0423\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0430', warehouse: '\u041d\u0430 \u0441\u043a\u043b\u0430\u0434\u0435', disposed: '\u0421\u043f\u0438\u0441\u0430\u043d\u0430' };
const TIRE_STATUS_COLOR: Record<string, string> = { installed: 'bg-emerald-100 text-emerald-700', warehouse: 'bg-blue-100 text-blue-700', disposed: 'bg-gray-100 text-gray-500' };

type Tab = 'vehicles' | 'regulations' | 'history' | 'tires' | 'parts' | 'suppliers' | 'debts' | 'expenses';

interface ExpenseVehicle {
  vehicle: { id: string; plateNumber: string; brand: string; model: string };
  months: Record<string, { fuel: number; maintenance: number; service: number; parts: number; total: number; fuelLiters: number }>;
  totals: { fuel: number; maintenance: number; service: number; parts: number; total: number; fuelLiters: number };
}
interface ExpenseReport {
  vehicles: ExpenseVehicle[];
  grandTotals: { fuel: number; maintenance: number; service: number; parts: number; total: number; fuelLiters: number };
  monthKeys: string[];
  year: number;
  month: number | null;
}

export default function MaintenancePage() {
  const [tab, setTab] = useState<Tab>('vehicles');
  const [loading, setLoading] = useState(true);

  // Data
  const [vehicleStatuses, setVehicleStatuses] = useState<VehicleStatus[]>([]);
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Modals
  const [showRegModal, setShowRegModal] = useState(false);
  const [editRegId, setEditRegId] = useState<string | null>(null);
  const [regForm, setRegForm] = useState({ name: '', description: '', vehicleModel: '', mileageInterval: '', monthsInterval: '' });

  const [showRecordModal, setShowRecordModal] = useState(false);
  const [recordForm, setRecordForm] = useState({ vehicleId: '', regulationId: '', date: '', mileage: '', cost: '', comment: '' });

  const [showMileageModal, setShowMileageModal] = useState(false);
  const [mileageForm, setMileageForm] = useState({ vehicleId: '', mileage: '' });

  // Tires
  const [tireSets, setTireSets] = useState<TireSet[]>([]);
  const [showTireModal, setShowTireModal] = useState(false);
  const [editTireId, setEditTireId] = useState<string | null>(null);
  const [tireForm, setTireForm] = useState({ vehicleId: '', brand: '', size: '', position: '', installDate: '', installMileage: '', status: 'installed', comment: '' });

  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterVehicle, setFilterVehicle] = useState('');

  /* ─── Load data ─── */
  const loadAll = useCallback(async () => {
    try {
      const [statusRes, regRes, recRes, vehRes, tireRes] = await Promise.all([
        fetch('/api/maintenance/status'),
        fetch('/api/service-regulations'),
        fetch('/api/service-records'),
        fetch('/api/vehicles'),
        fetch('/api/tire-sets'),
      ]);
      const [statusData, regData, recData, vehData, tireData] = await Promise.all([
        statusRes.json(), regRes.json(), recRes.json(), vehRes.json(), tireRes.json(),
      ]);
      setVehicleStatuses(statusData.vehicles || []);
      setRegulations(Array.isArray(regData) ? regData : []);
      setRecords(Array.isArray(recData) ? recData : []);
      setVehicles(Array.isArray(vehData) ? vehData : []);
      setTireSets(Array.isArray(tireData) ? tireData : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ─── Regulation CRUD ─── */
  const openNewReg = () => {
    setEditRegId(null);
    setRegForm({ name: '', description: '', vehicleModel: '', mileageInterval: '', monthsInterval: '' });
    setShowRegModal(true);
  };
  const openEditReg = (r: Regulation) => {
    setEditRegId(r.id);
    setRegForm({
      name: r.name,
      description: r.description || '',
      vehicleModel: r.vehicleModel || '',
      mileageInterval: r.mileageInterval ? String(r.mileageInterval) : '',
      monthsInterval: r.monthsInterval ? String(r.monthsInterval) : '',
    });
    setShowRegModal(true);
  };
  const saveReg = async () => {
    if (!regForm.name || (!regForm.mileageInterval && !regForm.monthsInterval)) return;
    setSaving(true);
    try {
      const url = editRegId ? `/api/service-regulations/${editRegId}` : '/api/service-regulations';
      const method = editRegId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regForm.name,
          description: regForm.description || null,
          vehicleModel: regForm.vehicleModel || null,
          mileageInterval: regForm.mileageInterval ? Number(regForm.mileageInterval) : null,
          monthsInterval: regForm.monthsInterval ? Number(regForm.monthsInterval) : null,
        }),
      });
      if (res.ok) { setShowRegModal(false); await loadAll(); }
    } catch {} finally { setSaving(false); }
  };
  const deleteReg = async (id: string) => {
    if (!confirm('Удалить регламент? Все связанные записи будут удалены.')) return;
    await fetch(`/api/service-regulations/${id}`, { method: 'DELETE' });
    await loadAll();
  };

  /* ─── Service Record CRUD ─── */
  const openNewRecord = (vehicleId?: string, regulationId?: string) => {
    setRecordForm({
      vehicleId: vehicleId || '',
      regulationId: regulationId || '',
      date: new Date().toISOString().split('T')[0],
      mileage: vehicleId ? String(vehicles.find(v => v.id === vehicleId)?.currentMileage || '') : '',
      cost: '',
      comment: '',
    });
    setShowRecordModal(true);
  };
  const saveRecord = async () => {
    if (!recordForm.vehicleId || !recordForm.regulationId || !recordForm.date || !recordForm.mileage) return;
    setSaving(true);
    try {
      const res = await fetch('/api/service-records', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: recordForm.vehicleId,
          regulationId: recordForm.regulationId,
          date: recordForm.date,
          mileage: Number(recordForm.mileage),
          cost: recordForm.cost ? Number(recordForm.cost) : 0,
          comment: recordForm.comment || null,
        }),
      });
      if (res.ok) { setShowRecordModal(false); await loadAll(); }
    } catch {} finally { setSaving(false); }
  };
  const deleteRecord = async (id: string) => {
    if (!confirm('Удалить запись?')) return;
    await fetch(`/api/service-records/${id}`, { method: 'DELETE' });
    await loadAll();
  };

  /* ─── Mileage update ─── */
  const openMileage = (v: Vehicle) => {
    setMileageForm({ vehicleId: v.id, mileage: v.currentMileage ? String(v.currentMileage) : '' });
    setShowMileageModal(true);
  };
  const saveMileage = async () => {
    if (!mileageForm.vehicleId || !mileageForm.mileage) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/vehicles/${mileageForm.vehicleId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentMileage: Number(mileageForm.mileage) }),
      });
      if (res.ok) { setShowMileageModal(false); await loadAll(); }
    } catch {} finally { setSaving(false); }
  };

  /* ─── Tire CRUD ─── */
  const openNewTire = () => {
    setEditTireId(null);
    setTireForm({ vehicleId: '', brand: '', size: '', position: '', installDate: new Date().toISOString().split('T')[0], installMileage: '', status: 'installed', comment: '' });
    setShowTireModal(true);
  };
  const openEditTire = (t: TireSet) => {
    setEditTireId(t.id);
    setTireForm({
      vehicleId: t.vehicleId || '', brand: t.brand, size: t.size, position: t.position || '',
      installDate: t.installDate ? new Date(t.installDate).toISOString().split('T')[0] : '',
      installMileage: t.installMileage ? String(t.installMileage) : '',
      status: t.status, comment: t.comment || '',
    });
    setShowTireModal(true);
  };
  const saveTire = async () => {
    if (!tireForm.brand || !tireForm.size) return;
    setSaving(true);
    try {
      const url = editTireId ? `/api/tire-sets/${editTireId}` : '/api/tire-sets';
      const method = editTireId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: tireForm.vehicleId || null, brand: tireForm.brand, size: tireForm.size,
          position: tireForm.position || null,
          installDate: tireForm.installDate || null,
          installMileage: tireForm.installMileage ? Number(tireForm.installMileage) : null,
          status: tireForm.status, comment: tireForm.comment || null,
        }),
      });
      if (res.ok) { setShowTireModal(false); await loadAll(); }
    } catch {} finally { setSaving(false); }
  };
  const deleteTire = async (id: string) => {
    if (!confirm('Удалить шину?')) return;
    await fetch(`/api/tire-sets/${id}`, { method: 'DELETE' });
    await loadAll();
  };

  /* ─── Suppliers ─── */
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editSupplierId, setEditSupplierId] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState({ name: '', contactPerson: '', phone: '', paymentTerms: '' });

  /* ─── Parts ─── */
  const [parts, setParts] = useState<PartPurchaseItem[]>([]);
  const [showPartModal, setShowPartModal] = useState(false);
  const [editPartId, setEditPartId] = useState<string | null>(null);
  const [partForm, setPartForm] = useState({ vehicleId: '', supplierId: '', date: '', partName: '', quantity: '1', unitPrice: '', notes: '' });
  const [partFilterVehicle, setPartFilterVehicle] = useState('');
  const [partFilterSupplier, setPartFilterSupplier] = useState('');
  const [partFilterStatus, setPartFilterStatus] = useState('');
  const [partFilterDateFrom, setPartFilterDateFrom] = useState('');
  const [partFilterDateTo, setPartFilterDateTo] = useState('');

  /* ─── Payments ─── */
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentPurchaseId, setPaymentPurchaseId] = useState('');
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentDate: '', notes: '' });
  const [expandedPart, setExpandedPart] = useState<string | null>(null);

  /* ─── Debts ─── */
  const [debtRows, setDebtRows] = useState<DebtRow[]>([]);
  const [debtSuppliers, setDebtSuppliers] = useState<SupplierDebt[]>([]);
  const [debtTotals, setDebtTotals] = useState({ grandTotal: 0, grandPaid: 0, grandDebt: 0 });
  const [debtFilterSupplier, setDebtFilterSupplier] = useState('');
  const [debtFilterVehicle, setDebtFilterVehicle] = useState('');
  const [debtFilterStatus, setDebtFilterStatus] = useState('');

  /* ─── File upload ─── */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPartId, setUploadingPartId] = useState<string | null>(null);

  /* ─── Load suppliers & parts ─── */
  const loadSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers');
      const data = await res.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  const loadParts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (partFilterVehicle) params.set('vehicleId', partFilterVehicle);
      if (partFilterSupplier) params.set('supplierId', partFilterSupplier);
      if (partFilterStatus) params.set('paymentStatus', partFilterStatus);
      if (partFilterDateFrom) params.set('dateFrom', partFilterDateFrom);
      if (partFilterDateTo) params.set('dateTo', partFilterDateTo);
      const res = await fetch(`/api/part-purchases?${params}`);
      const data = await res.json();
      setParts(Array.isArray(data) ? data : []);
    } catch {}
  }, [partFilterVehicle, partFilterSupplier, partFilterStatus, partFilterDateFrom, partFilterDateTo]);

  const loadDebts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (debtFilterSupplier) params.set('supplierId', debtFilterSupplier);
      if (debtFilterVehicle) params.set('vehicleId', debtFilterVehicle);
      if (debtFilterStatus) params.set('paymentStatus', debtFilterStatus);
      const res = await fetch(`/api/reports/supplier-debts?${params}`);
      const data = await res.json();
      setDebtRows(data.rows || []);
      setDebtSuppliers(data.suppliers || []);
      setDebtTotals(data.totals || { grandTotal: 0, grandPaid: 0, grandDebt: 0 });
    } catch {}
  }, [debtFilterSupplier, debtFilterVehicle, debtFilterStatus]);

  useEffect(() => { if (tab === 'suppliers' || tab === 'parts' || tab === 'debts') loadSuppliers(); }, [tab, loadSuppliers]);
  useEffect(() => { if (tab === 'parts') loadParts(); }, [tab, loadParts]);
  useEffect(() => { if (tab === 'debts') loadDebts(); }, [tab, loadDebts]);

  /* ─── Expenses report ─── */
  const currentYear = new Date().getFullYear();
  const [expYear, setExpYear] = useState(currentYear);
  const [expMonth, setExpMonth] = useState<number | null>(null);
  const [expVehicle, setExpVehicle] = useState('');
  const [expReport, setExpReport] = useState<ExpenseReport | null>(null);
  const [expLoading, setExpLoading] = useState(false);
  const [expExpandedVehicle, setExpExpandedVehicle] = useState<string | null>(null);

  const MONTH_NAMES: Record<string, string> = {
    '01': '\u042f\u043d\u0432', '02': '\u0424\u0435\u0432', '03': '\u041c\u0430\u0440', '04': '\u0410\u043f\u0440',
    '05': '\u041c\u0430\u0439', '06': '\u0418\u044e\u043d', '07': '\u0418\u044e\u043b', '08': '\u0410\u0432\u0433',
    '09': '\u0421\u0435\u043d', '10': '\u041e\u043a\u0442', '11': '\u041d\u043e\u044f', '12': '\u0414\u0435\u043a',
  };

  const loadExpenses = useCallback(async () => {
    setExpLoading(true);
    try {
      const params = new URLSearchParams({ year: String(expYear) });
      if (expMonth) params.set('month', String(expMonth));
      if (expVehicle) params.set('vehicleId', expVehicle);
      const res = await fetch(`/api/reports/vehicle-expenses?${params}`);
      const data = await res.json();
      setExpReport(data);
    } catch { setExpReport(null); }
    setExpLoading(false);
  }, [expYear, expMonth, expVehicle]);

  useEffect(() => { if (tab === 'expenses') loadExpenses(); }, [tab, loadExpenses]);

  /* ─── Supplier CRUD ─── */
  const openNewSupplier = () => {
    setEditSupplierId(null);
    setSupplierForm({ name: '', contactPerson: '', phone: '', paymentTerms: '' });
    setShowSupplierModal(true);
  };
  const openEditSupplier = (s: SupplierItem) => {
    setEditSupplierId(s.id);
    setSupplierForm({ name: s.name, contactPerson: s.contactPerson || '', phone: s.phone || '', paymentTerms: s.paymentTerms || '' });
    setShowSupplierModal(true);
  };
  const saveSupplier = async () => {
    if (!supplierForm.name) return;
    setSaving(true);
    try {
      const url = editSupplierId ? `/api/suppliers/${editSupplierId}` : '/api/suppliers';
      const method = editSupplierId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(supplierForm) });
      if (res.ok) { setShowSupplierModal(false); await loadSuppliers(); }
    } catch {} finally { setSaving(false); }
  };
  const deleteSupplier = async (id: string) => {
    if (!confirm('\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0430?')) return;
    const res = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); alert(d.error || '\u041e\u0448\u0438\u0431\u043a\u0430'); return; }
    await loadSuppliers();
  };

  /* ─── Parts CRUD ─── */
  const openNewPart = () => {
    setEditPartId(null);
    setPartForm({ vehicleId: '', supplierId: '', date: new Date().toISOString().split('T')[0], partName: '', quantity: '1', unitPrice: '', notes: '' });
    setShowPartModal(true);
  };
  const openEditPart = (p: PartPurchaseItem) => {
    setEditPartId(p.id);
    setPartForm({
      vehicleId: p.vehicleId, supplierId: p.supplierId || '',
      date: p.date ? new Date(p.date).toISOString().split('T')[0] : '',
      partName: p.partName, quantity: String(p.quantity), unitPrice: String(p.unitPrice), notes: p.notes || '',
    });
    setShowPartModal(true);
  };
  const savePart = async () => {
    if (!partForm.vehicleId || !partForm.date || !partForm.partName) return;
    setSaving(true);
    try {
      const url = editPartId ? `/api/part-purchases/${editPartId}` : '/api/part-purchases';
      const method = editPartId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(partForm) });
      if (res.ok) { setShowPartModal(false); await loadParts(); }
    } catch {} finally { setSaving(false); }
  };
  const deletePart = async (id: string) => {
    if (!confirm('\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0437\u0430\u043f\u0438\u0441\u044c?')) return;
    await fetch(`/api/part-purchases/${id}`, { method: 'DELETE' });
    await loadParts();
  };

  /* ─── Part Payments ─── */
  const openPayment = (purchaseId: string) => {
    setPaymentPurchaseId(purchaseId);
    setPaymentForm({ amount: '', paymentDate: new Date().toISOString().split('T')[0], notes: '' });
    setShowPaymentModal(true);
  };
  const savePayment = async () => {
    if (!paymentForm.amount || !paymentForm.paymentDate) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/part-purchases/${paymentPurchaseId}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(paymentForm),
      });
      if (res.ok) { setShowPaymentModal(false); await loadParts(); if (tab === 'debts') await loadDebts(); }
    } catch {} finally { setSaving(false); }
  };
  const deletePayment = async (purchaseId: string, paymentId: string) => {
    if (!confirm('\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u043e\u043f\u043b\u0430\u0442\u0443?')) return;
    await fetch(`/api/part-purchases/${purchaseId}/payments?paymentId=${paymentId}`, { method: 'DELETE' });
    await loadParts();
    if (tab === 'debts') await loadDebts();
  };

  /* ─── File upload ─── */
  const handleFileUpload = async (purchaseId: string, file: File) => {
    setUploadingPartId(purchaseId);
    try {
      const presignRes = await fetch('/api/upload/presigned', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, isPublic: false }),
      });
      const { uploadUrl, cloud_storage_path } = await presignRes.json();

      const headers: Record<string, string> = { 'Content-Type': file.type };
      if (uploadUrl.includes('content-disposition')) headers['Content-Disposition'] = 'attachment';
      await fetch(uploadUrl, { method: 'PUT', headers, body: file });

      await fetch(`/api/part-purchases/${purchaseId}/attachments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileType: file.type, cloudStoragePath: cloud_storage_path, isPublic: false }),
      });
      await loadParts();
    } catch { alert('\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0444\u0430\u0439\u043b\u0430'); }
    finally { setUploadingPartId(null); }
  };

  const downloadAttachment = (att: PartAttachmentItem) => {
    if (att.url) {
      const a = document.createElement('a'); a.href = att.url; a.download = att.fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  };

  const deleteAttachment = async (purchaseId: string, attId: string) => {
    if (!confirm('\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0444\u0430\u0439\u043b?')) return;
    await fetch(`/api/part-purchases/${purchaseId}/attachments?attachmentId=${attId}`, { method: 'DELETE' });
    await loadParts();
  };

  /* ─── Helpers ─── */
  const urgentCount = vehicleStatuses.filter(v => v.overallStatus === 'red').length;
  const warnCount = vehicleStatuses.filter(v => v.overallStatus === 'yellow').length;
  const filteredRecords = filterVehicle ? records.filter(r => r.vehicleId === filterVehicle) : records;

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'vehicles', label: '\u041c\u0430\u0448\u0438\u043d\u044b', icon: <Truck className="w-4 h-4" /> },
    { key: 'regulations', label: '\u0420\u0435\u0433\u043b\u0430\u043c\u0435\u043d\u0442\u044b', icon: <Settings2 className="w-4 h-4" /> },
    { key: 'history', label: '\u0418\u0441\u0442\u043e\u0440\u0438\u044f', icon: <History className="w-4 h-4" /> },
    { key: 'tires', label: '\u0428\u0438\u043d\u044b', icon: <Circle className="w-4 h-4" /> },
    { key: 'parts', label: '\u0417\u0430\u043f\u0447\u0430\u0441\u0442\u0438', icon: <Package className="w-4 h-4" /> },
    { key: 'suppliers', label: '\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0438', icon: <Building2 className="w-4 h-4" /> },
    { key: 'debts', label: '\u0414\u043e\u043b\u0433\u0438', icon: <CreditCard className="w-4 h-4" /> },
    { key: 'expenses', label: '\u0420\u0430\u0441\u0445\u043e\u0434\u044b', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Техобслуживание</h1>
          <p className="text-sm text-muted-foreground">Регламенты, статусы и история ТО</p>
        </div>
        <button onClick={() => openNewRecord()} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition">
          <Plus className="w-4 h-4" /> Записать ТО
        </button>
      </div>

      {/* Warning banner */}
      {(urgentCount > 0 || warnCount > 0) && (
        <div className={`rounded-xl p-4 border ${urgentCount > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: urgentCount > 0 ? '#b91c1c' : '#92400e' }}>
            <AlertTriangle className="w-4 h-4" />
            {urgentCount > 0 && <span>{urgentCount} {urgentCount === 1 ? 'машина требует' : 'машин требуют'} обслуживания</span>}
            {urgentCount > 0 && warnCount > 0 && <span className="mx-1">•</span>}
            {warnCount > 0 && <span className="text-amber-700">{warnCount} скоро потребуют ТО</span>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-muted/50 rounded-lg p-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition ${tab === t.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.icon} <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ═══════ VEHICLES TAB ═══════ */}
      {tab === 'vehicles' && (
        <div className="space-y-4">
          {vehicleStatuses.length === 0 && regulations.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Settings2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Сначала добавьте регламенты ТО</p>
              <button onClick={() => { setTab('regulations'); openNewReg(); }} className="mt-3 text-sm text-primary hover:underline">Добавить регламент →</button>
            </div>
          ) : vehicleStatuses.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Нет активных машин</p>
            </div>
          ) : (
            vehicleStatuses.map(vs => {
              const isExpanded = expandedVehicle === vs.vehicle.id;
              return (
                <div key={vs.vehicle.id} className="bg-card rounded-xl shadow-sm overflow-hidden">
                  {/* Vehicle header */}
                  <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition" onClick={() => setExpandedVehicle(isExpanded ? null : vs.vehicle.id)}>
                    <div className={`w-3 h-3 rounded-full shrink-0 ${STATUS_DOT[vs.overallStatus]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{vs.vehicle.brand} {vs.vehicle.model}</span>
                        <span className="text-xs text-muted-foreground">{vs.vehicle.plateNumber}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Gauge className="w-3 h-3" />
                          {vs.vehicle.currentMileage ? `${vs.vehicle.currentMileage.toLocaleString()} км` : 'Пробег не указан'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[vs.overallStatus]}`}>
                          {STATUS_LABEL[vs.overallStatus]}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={e => { e.stopPropagation(); openMileage(vs.vehicle); }} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-muted transition" title="Обновить пробег">
                        <Gauge className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); openNewRecord(vs.vehicle.id); }} className="text-xs px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition" title="Записать ТО">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t">
                      {vs.statuses.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">Нет регламентов</div>
                      ) : (
                        <div className="divide-y">
                          {vs.statuses.map(s => (
                            <div key={s.regulation.id} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/20">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s.status]}`} />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{s.regulation.name}</span>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                                  {s.lastRecord ? (
                                    <>
                                      <span>Последнее: {formatDate(s.lastRecord.date)} при {s.lastRecord.mileage.toLocaleString()} км</span>
                                      {s.nextMileage && (
                                        <span className="flex items-center gap-1">
                                          <Gauge className="w-3 h-3" />След: {s.nextMileage.toLocaleString()} км
                                          {s.remainingKm != null && ` (осталось ${s.remainingKm.toLocaleString()} км)`}
                                        </span>
                                      )}
                                      {s.nextDate && (
                                        <span className="flex items-center gap-1">
                                          <Calendar className="w-3 h-3" />До: {formatDate(s.nextDate)}
                                          {s.remainingDays != null && ` (осталось ${s.remainingDays} дн.)`}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-amber-600">Нет записей — требуется первое обслуживание</span>
                                  )}
                                </div>
                              </div>
                              <button onClick={() => openNewRecord(vs.vehicle.id, s.regulation.id)} className="text-xs px-2 py-1 border rounded-md hover:bg-muted transition shrink-0" title="Записать">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ═══════ REGULATIONS TAB ═══════ */}
      {tab === 'regulations' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openNewReg} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition">
              <Plus className="w-4 h-4" /> Добавить регламент
            </button>
          </div>
          {regulations.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Settings2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Нет регламентов ТО</p>
              <p className="text-xs mt-1">Добавьте виды обслуживания с интервалами по пробегу и/или времени</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {regulations.map(r => (
                <div key={r.id} className="bg-card rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-sm">{r.name}</h4>
                      {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>}
                      <span className="inline-block text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded mt-1">
                        {r.vehicleModel || 'Все модели'}
                      </span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEditReg(r)} className="p-1.5 hover:bg-muted rounded-md transition"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteReg(r.id)} className="p-1.5 hover:bg-red-50 rounded-md transition"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-3">
                    {r.mileageInterval && (
                      <span className="text-xs px-2 py-1 bg-muted rounded-md flex items-center gap-1">
                        <Gauge className="w-3 h-3" /> {r.mileageInterval.toLocaleString()} км
                      </span>
                    )}
                    {r.monthsInterval && (
                      <span className="text-xs px-2 py-1 bg-muted rounded-md flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {r.monthsInterval} мес.
                      </span>
                    )}
                  </div>
                  {r._count && <p className="text-xs text-muted-foreground mt-2">Записей: {r._count.serviceRecords}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════ HISTORY TAB ═══════ */}
      {tab === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="">Все машины</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
            </select>
            <span className="text-xs text-muted-foreground">Всего записей: {filteredRecords.length}</span>
          </div>
          {filteredRecords.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Нет записей об обслуживании</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-muted-foreground border-b bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium">Машина</th>
                    <th className="text-left py-3 px-4 font-medium">Регламент</th>
                    <th className="text-left py-3 px-4 font-medium">Дата</th>
                    <th className="text-left py-3 px-4 font-medium">Пробег</th>
                    <th className="text-right py-3 px-4 font-medium">Стоимость</th>
                    <th className="text-left py-3 px-4 font-medium">Комментарий</th>
                    <th className="text-right py-3 px-4 font-medium"></th>
                  </tr></thead>
                  <tbody>
                    {filteredRecords.map(rec => (
                      <tr key={rec.id} className="border-b border-muted last:border-0 hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium">{rec.vehicle.brand} {rec.vehicle.model}<br/><span className="text-xs text-muted-foreground">{rec.vehicle.plateNumber}</span></td>
                        <td className="py-3 px-4"><span className="text-xs px-2 py-1 rounded-full bg-muted font-medium">{rec.regulation.name}</span></td>
                        <td className="py-3 px-4">{formatDate(rec.date)}</td>
                        <td className="py-3 px-4">{rec.mileage.toLocaleString()} км</td>
                        <td className="py-3 px-4 text-right font-mono">{formatCurrency(rec.cost)}</td>
                        <td className="py-3 px-4 text-muted-foreground max-w-[200px] truncate">{rec.comment || '—'}</td>
                        <td className="py-3 px-4 text-right">
                          <button onClick={() => deleteRecord(rec.id)} className="p-1.5 hover:bg-red-50 rounded-md transition" title="Удалить"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ MODALS ═══════ */}

      {/* Regulation Modal */}
      {showRegModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowRegModal(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-display font-bold">{editRegId ? 'Редактировать регламент' : 'Новый регламент'}</h2>
              <button onClick={() => setShowRegModal(false)} className="p-1 hover:bg-muted rounded-md transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Название *</label>
                <input type="text" value={regForm.name} onChange={e => setRegForm({ ...regForm, name: e.target.value })} placeholder="Напр: Замена масла" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
                <input type="text" value={regForm.description} onChange={e => setRegForm({ ...regForm, description: e.target.value })} placeholder="Необязательно" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Модель техники</label>
                <select value={regForm.vehicleModel} onChange={e => setRegForm({ ...regForm, vehicleModel: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="">Все модели</option>
                  {Array.from(new Set(vehicles.map(v => v.model))).sort().map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">«Все модели» — общий регламент для всего парка</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Интервал, км</label>
                  <input type="number" min={0} value={regForm.mileageInterval} onChange={e => setRegForm({ ...regForm, mileageInterval: e.target.value })} placeholder="10000" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Интервал, мес.</label>
                  <input type="number" min={0} value={regForm.monthsInterval} onChange={e => setRegForm({ ...regForm, monthsInterval: e.target.value })} placeholder="6" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Укажите хотя бы один интервал (по пробегу или по времени)</p>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t">
              <button onClick={() => setShowRegModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition">Отмена</button>
              <button onClick={saveReg} disabled={saving || !regForm.name || (!regForm.mileageInterval && !regForm.monthsInterval)} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition font-medium">
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Service Record Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowRecordModal(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-display font-bold">Записать обслуживание</h2>
              <button onClick={() => setShowRecordModal(false)} className="p-1 hover:bg-muted rounded-md transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Машина *</label>
                <select value={recordForm.vehicleId} onChange={e => {
                  const veh = vehicles.find(v => v.id === e.target.value);
                  setRecordForm({ ...recordForm, vehicleId: e.target.value, mileage: veh?.currentMileage ? String(veh.currentMileage) : recordForm.mileage });
                }} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="">Выберите машину</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Регламент *</label>
                <select value={recordForm.regulationId} onChange={e => setRecordForm({ ...recordForm, regulationId: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="">Выберите регламент</option>
                  {regulations.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Дата *</label>
                  <input type="date" value={recordForm.date} onChange={e => setRecordForm({ ...recordForm, date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Пробег, км *</label>
                  <input type="number" min={0} value={recordForm.mileage} onChange={e => setRecordForm({ ...recordForm, mileage: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Стоимость, \u058F</label>
                <input type="number" min={0} value={recordForm.cost} onChange={e => setRecordForm({ ...recordForm, cost: e.target.value })} placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Комментарий</label>
                <textarea value={recordForm.comment} onChange={e => setRecordForm({ ...recordForm, comment: e.target.value })} rows={2} placeholder="Необязательно" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t">
              <button onClick={() => setShowRecordModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition">Отмена</button>
              <button onClick={saveRecord} disabled={saving || !recordForm.vehicleId || !recordForm.regulationId || !recordForm.date || !recordForm.mileage} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition font-medium">
                {saving ? 'Сохранение...' : 'Записать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ TIRES TAB ═══════ */}
      {tab === 'tires' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openNewTire} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition">
              <Plus className="w-4 h-4" /> Добавить шину
            </button>
          </div>
          {tireSets.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Circle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Нет записей о шинах</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-muted-foreground border-b bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium">Марка / Размер</th>
                    <th className="text-left py-3 px-4 font-medium">Машина</th>
                    <th className="text-left py-3 px-4 font-medium">Позиция</th>
                    <th className="text-left py-3 px-4 font-medium">Установлена</th>
                    <th className="text-left py-3 px-4 font-medium">Пробег шины</th>
                    <th className="text-left py-3 px-4 font-medium">Статус</th>
                    <th className="text-right py-3 px-4 font-medium"></th>
                  </tr></thead>
                  <tbody>
                    {tireSets.map(t => {
                      const tireMileage = (t.installMileage && t.vehicle?.plateNumber)
                        ? (() => {
                            const vStatus = vehicleStatuses.find(vs => vs.vehicle.id === t.vehicleId);
                            const cur = vStatus?.vehicle.currentMileage;
                            if (cur && t.installMileage) return cur - t.installMileage;
                            return null;
                          })()
                        : (t.removeMileage && t.installMileage ? t.removeMileage - t.installMileage : null);
                      return (
                        <tr key={t.id} className="border-b border-muted last:border-0 hover:bg-muted/50">
                          <td className="py-3 px-4"><span className="font-medium">{t.brand}</span><br/><span className="text-xs text-muted-foreground">{t.size}</span></td>
                          <td className="py-3 px-4">{t.vehicle ? `${t.vehicle.brand} ${t.vehicle.model}` : <span className="text-muted-foreground">—</span>}<br/>{t.vehicle && <span className="text-xs text-muted-foreground">{t.vehicle.plateNumber}</span>}</td>
                          <td className="py-3 px-4">{t.position || '—'}</td>
                          <td className="py-3 px-4">{t.installDate ? formatDate(t.installDate) : '—'}<br/>{t.installMileage && <span className="text-xs text-muted-foreground">{t.installMileage.toLocaleString()} км</span>}</td>
                          <td className="py-3 px-4">{tireMileage !== null ? <span className="font-mono">{tireMileage.toLocaleString()} км</span> : '—'}</td>
                          <td className="py-3 px-4"><span className={`text-xs px-2 py-1 rounded-full font-medium ${TIRE_STATUS_COLOR[t.status] || 'bg-muted'}`}>{TIRE_STATUS_MAP[t.status] || t.status}</span></td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => openEditTire(t)} className="p-1.5 hover:bg-muted rounded-md transition"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteTire(t.id)} className="p-1.5 hover:bg-red-50 rounded-md transition"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ MODALS ═══════ */}

      {/* Tire Modal */}
      {showTireModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowTireModal(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-display font-bold">{editTireId ? 'Редактировать шину' : 'Новая шина'}</h2>
              <button onClick={() => setShowTireModal(false)} className="p-1 hover:bg-muted rounded-md transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Марка *</label>
                  <input type="text" value={tireForm.brand} onChange={e => setTireForm({ ...tireForm, brand: e.target.value })} placeholder="Continental, Michelin..." className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Размер *</label>
                  <input type="text" value={tireForm.size} onChange={e => setTireForm({ ...tireForm, size: e.target.value })} placeholder="315/80R22.5" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Машина</label>
                <select value={tireForm.vehicleId} onChange={e => setTireForm({ ...tireForm, vehicleId: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="">Не привязана / Склад</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Позиция</label>
                  <input type="text" value={tireForm.position} onChange={e => setTireForm({ ...tireForm, position: e.target.value })} placeholder="Перед лев., Зад прав. и т.д." className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Статус</label>
                  <select value={tireForm.status} onChange={e => setTireForm({ ...tireForm, status: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                    <option value="installed">Установлена</option>
                    <option value="warehouse">На складе</option>
                    <option value="disposed">Списана</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Дата установки</label>
                  <input type="date" value={tireForm.installDate} onChange={e => setTireForm({ ...tireForm, installDate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Пробег при уст., км</label>
                  <input type="number" min={0} value={tireForm.installMileage} onChange={e => setTireForm({ ...tireForm, installMileage: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Комментарий</label>
                <input type="text" value={tireForm.comment} onChange={e => setTireForm({ ...tireForm, comment: e.target.value })} placeholder="Необязательно" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t">
              <button onClick={() => setShowTireModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition">Отмена</button>
              <button onClick={saveTire} disabled={saving || !tireForm.brand || !tireForm.size} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition font-medium">
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mileage Modal */}
      {showMileageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowMileageModal(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-display font-bold">{'\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043f\u0440\u043e\u0431\u0435\u0433'}</h2>
              <button onClick={() => setShowMileageModal(false)} className="p-1 hover:bg-muted rounded-md transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{'\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043f\u0440\u043e\u0431\u0435\u0433, \u043a\u043c'}</label>
                <input type="number" min={0} value={mileageForm.mileage} onChange={e => setMileageForm({ ...mileageForm, mileage: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" autoFocus />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t">
              <button onClick={() => setShowMileageModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition">{'\u041e\u0442\u043c\u0435\u043d\u0430'}</button>
              <button onClick={saveMileage} disabled={saving || !mileageForm.mileage} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition font-medium">
                {saving ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...' : '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ PARTS TAB ═══════ */}
      {tab === 'parts' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{'\u041c\u0430\u0448\u0438\u043d\u0430'}</label>
              <select value={partFilterVehicle} onChange={e => setPartFilterVehicle(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background">
                <option value="">{'\u0412\u0441\u0435 \u043c\u0430\u0448\u0438\u043d\u044b'}</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{'\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a'}</label>
              <select value={partFilterSupplier} onChange={e => setPartFilterSupplier(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background">
                <option value="">{'\u0412\u0441\u0435 \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0438'}</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{'\u0421\u0442\u0430\u0442\u0443\u0441 \u043e\u043f\u043b\u0430\u0442\u044b'}</label>
              <select value={partFilterStatus} onChange={e => setPartFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background">
                <option value="">{'\u0412\u0441\u0435'}</option>
                <option value="unpaid">{'\u041d\u0435 \u043e\u043f\u043b\u0430\u0447\u0435\u043d\u043e'}</option>
                <option value="partial">{'\u0427\u0430\u0441\u0442\u0438\u0447\u043d\u043e'}</option>
                <option value="paid">{'\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e'}</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{'\u0421'}</label>
              <input type="date" value={partFilterDateFrom} onChange={e => setPartFilterDateFrom(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{'\u041f\u043e'}</label>
              <input type="date" value={partFilterDateTo} onChange={e => setPartFilterDateTo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <button onClick={openNewPart} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition ml-auto">
              <Plus className="w-4 h-4" /> {'\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c'}
            </button>
          </div>

          {parts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{'\u041d\u0435\u0442 \u0437\u0430\u043f\u0438\u0441\u0435\u0439 \u043e \u0437\u0430\u043f\u0447\u0430\u0441\u0442\u044f\u0445'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {parts.map(p => {
                const isExp = expandedPart === p.id;
                const debt = Number(p.totalAmount) - Number(p.paidAmount);
                return (
                  <div key={p.id} className="bg-card rounded-xl shadow-sm overflow-hidden">
                    <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition" onClick={() => setExpandedPart(isExp ? null : p.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{p.partName}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAY_STATUS_COLOR[p.paymentStatus] || 'bg-muted'}`}>
                            {PAY_STATUS_MAP[p.paymentStatus] || p.paymentStatus}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                          <span>{p.vehicle.brand} {p.vehicle.model} ({p.vehicle.plateNumber})</span>
                          {p.supplier && <span>{'\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a: '}{p.supplier.name}</span>}
                          <span>{formatDate(p.date)}</span>
                          <span>{Number(p.quantity)} × {formatCurrency(Number(p.unitPrice))} = {formatCurrency(Number(p.totalAmount))}</span>
                          {debt > 0 && <span className="text-red-600 font-medium">{'\u0414\u043e\u043b\u0433: '}{formatCurrency(debt)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.attachments.length > 0 && <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />}
                        {p.paymentStatus !== 'paid' && (
                          <button onClick={e => { e.stopPropagation(); openPayment(p.id); }} className="text-xs px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition" title={'\u0412\u043d\u0435\u0441\u0442\u0438 \u043e\u043f\u043b\u0430\u0442\u0443'}>
                            <DollarSign className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={e => { e.stopPropagation(); openEditPart(p); }} className="p-1.5 hover:bg-muted rounded-md transition"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={e => { e.stopPropagation(); deletePart(p.id); }} className="p-1.5 hover:bg-red-50 rounded-md transition"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                        {isExp ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>
                    {isExp && (
                      <div className="border-t p-4 space-y-4">
                        {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}

                        {/* Payments */}
                        <div>
                          <h4 className="text-xs font-semibold mb-2">{'\u041e\u043f\u043b\u0430\u0442\u044b'} ({p.payments.length})</h4>
                          {p.payments.length > 0 ? (
                            <div className="space-y-1">
                              {p.payments.map(pay => (
                                <div key={pay.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-2">
                                  <div className="flex gap-3">
                                    <span className="font-mono font-medium">{formatCurrency(Number(pay.amount))}</span>
                                    <span className="text-muted-foreground">{formatDate(pay.paymentDate)}</span>
                                    {pay.notes && <span className="text-muted-foreground">{pay.notes}</span>}
                                  </div>
                                  <button onClick={() => deletePayment(p.id, pay.id)} className="p-1 hover:bg-red-50 rounded transition"><Trash2 className="w-3 h-3 text-red-500" /></button>
                                </div>
                              ))}
                            </div>
                          ) : <p className="text-xs text-muted-foreground">{'\u041d\u0435\u0442 \u043e\u043f\u043b\u0430\u0442'}</p>}
                          {p.paymentStatus !== 'paid' && (
                            <button onClick={() => openPayment(p.id)} className="mt-2 text-xs text-emerald-600 hover:underline">+ {'\u0412\u043d\u0435\u0441\u0442\u0438 \u043e\u043f\u043b\u0430\u0442\u0443'}</button>
                          )}
                        </div>

                        {/* Attachments */}
                        <div>
                          <h4 className="text-xs font-semibold mb-2">{'\u0424\u0430\u0439\u043b\u044b'} ({p.attachments.length})</h4>
                          {p.attachments.length > 0 && (
                            <div className="space-y-1">
                              {p.attachments.map(att => (
                                <div key={att.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="truncate max-w-[200px]">{att.fileName}</span>
                                  </div>
                                  <div className="flex gap-1">
                                    {att.url && (
                                      <button onClick={() => { const a = document.createElement('a'); a.href = att.url!; a.download = att.fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); }} className="p-1 hover:bg-muted rounded transition"><Download className="w-3 h-3" /></button>
                                    )}
                                    <button onClick={() => deleteAttachment(p.id, att.id)} className="p-1 hover:bg-red-50 rounded transition"><Trash2 className="w-3 h-3 text-red-500" /></button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          <label className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                            <Upload className="w-3 h-3" /> {'\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0444\u0430\u0439\u043b'}
                            <input type="file" className="hidden" onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) handleFileUpload(p.id, f);
                              e.target.value = '';
                            }} />
                          </label>
                          {uploadingPartId === p.id && <span className="ml-2 text-xs text-muted-foreground">{'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════ SUPPLIERS TAB ═══════ */}
      {tab === 'suppliers' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openNewSupplier} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition">
              <Plus className="w-4 h-4" /> {'\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0430'}
            </button>
          </div>
          {suppliers.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{'\u041d\u0435\u0442 \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u043e\u0432'}</p>
              <p className="text-xs mt-1">{'\u0414\u043e\u0431\u0430\u0432\u044c\u0442\u0435 \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u043e\u0432 \u0437\u0430\u043f\u0447\u0430\u0441\u0442\u0435\u0439 \u0438 \u0443\u0441\u043b\u0443\u0433'}</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {suppliers.map(s => (
                <div key={s.id} className="bg-card rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-sm">{s.name}</h4>
                      {s.contactPerson && <p className="text-xs text-muted-foreground mt-0.5">{s.contactPerson}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEditSupplier(s)} className="p-1.5 hover:bg-muted rounded-md transition"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteSupplier(s.id)} className="p-1.5 hover:bg-red-50 rounded-md transition"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {s.phone && <p>{'\u0422\u0435\u043b: '}<a href={`tel:${s.phone}`} className="text-primary hover:underline">{s.phone}</a></p>}
                    {s.paymentTerms && <p>{'\u0423\u0441\u043b\u043e\u0432\u0438\u044f: '}{s.paymentTerms}</p>}
                    {s._count && <p>{'\u0417\u0430\u043f\u0438\u0441\u0435\u0439: '}{s._count.partPurchases}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════ DEBTS TAB ═══════ */}
      {tab === 'debts' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{'\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a'}</label>
              <select value={debtFilterSupplier} onChange={e => setDebtFilterSupplier(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background">
                <option value="">{'\u0412\u0441\u0435'}</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{'\u041c\u0430\u0448\u0438\u043d\u0430'}</label>
              <select value={debtFilterVehicle} onChange={e => setDebtFilterVehicle(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background">
                <option value="">{'\u0412\u0441\u0435'}</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{'\u0421\u0442\u0430\u0442\u0443\u0441'}</label>
              <select value={debtFilterStatus} onChange={e => setDebtFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background">
                <option value="">{'\u0412\u0441\u0435'}</option>
                <option value="unpaid">{'\u041d\u0435 \u043e\u043f\u043b\u0430\u0447\u0435\u043d\u043e'}</option>
                <option value="partial">{'\u0427\u0430\u0441\u0442\u0438\u0447\u043d\u043e'}</option>
                <option value="paid">{'\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e'}</option>
              </select>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="bg-card rounded-xl p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">{'\u041e\u0431\u0449\u0430\u044f \u0441\u0443\u043c\u043c\u0430'}</p>
              <p className="text-lg font-bold font-mono mt-1">{formatCurrency(debtTotals.grandTotal)}</p>
            </div>
            <div className="bg-card rounded-xl p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">{'\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e'}</p>
              <p className="text-lg font-bold font-mono mt-1 text-emerald-600">{formatCurrency(debtTotals.grandPaid)}</p>
            </div>
            <div className="bg-card rounded-xl p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">{'\u041e\u0431\u0449\u0438\u0439 \u0434\u043e\u043b\u0433'}</p>
              <p className="text-lg font-bold font-mono mt-1 text-red-600">{formatCurrency(debtTotals.grandDebt)}</p>
            </div>
          </div>

          {/* Per-supplier summary */}
          {debtSuppliers.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{'\u0417\u0430\u0434\u043e\u043b\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u044c \u043f\u043e \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0430\u043c'}</h3>
              {debtSuppliers.filter(sd => sd.debtAmount > 0).map(sd => (
                <div key={sd.supplier.id} className="bg-card rounded-xl p-4 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm">{sd.supplier.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">({sd.count} {'\u0437\u0430\u043f\u0438\u0441\u0435\u0439'})</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-mono font-bold text-red-600">{formatCurrency(sd.debtAmount)}</span>
                    <span className="text-xs text-muted-foreground ml-2">{'\u0438\u0437'} {formatCurrency(sd.totalAmount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Detail table */}
          {debtRows.length > 0 ? (
            <div className="bg-card rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-muted-foreground border-b bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium">{'\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a'}</th>
                    <th className="text-left py-3 px-4 font-medium">{'\u041c\u0430\u0448\u0438\u043d\u0430'}</th>
                    <th className="text-left py-3 px-4 font-medium">{'\u0417\u0430\u043f\u0447\u0430\u0441\u0442\u044c'}</th>
                    <th className="text-left py-3 px-4 font-medium">{'\u0414\u0430\u0442\u0430'}</th>
                    <th className="text-right py-3 px-4 font-medium">{'\u0421\u0443\u043c\u043c\u0430'}</th>
                    <th className="text-right py-3 px-4 font-medium">{'\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e'}</th>
                    <th className="text-right py-3 px-4 font-medium">{'\u041e\u0441\u0442\u0430\u0442\u043e\u043a'}</th>
                    <th className="text-left py-3 px-4 font-medium">{'\u0421\u0442\u0430\u0442\u0443\u0441'}</th>
                  </tr></thead>
                  <tbody>
                    {debtRows.map(r => (
                      <tr key={r.id} className="border-b border-muted last:border-0 hover:bg-muted/50">
                        <td className="py-3 px-4">{r.supplier?.name || '\u2014'}</td>
                        <td className="py-3 px-4">{r.vehicle.brand} {r.vehicle.model}<br/><span className="text-xs text-muted-foreground">{r.vehicle.plateNumber}</span></td>
                        <td className="py-3 px-4 font-medium">{r.partName}</td>
                        <td className="py-3 px-4">{formatDate(r.date)}</td>
                        <td className="py-3 px-4 text-right font-mono">{formatCurrency(Number(r.totalAmount))}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-600">{formatCurrency(Number(r.paidAmount))}</td>
                        <td className="py-3 px-4 text-right font-mono text-red-600 font-medium">{formatCurrency(r.debtAmount)}</td>
                        <td className="py-3 px-4"><span className={`text-xs px-2 py-1 rounded-full font-medium ${PAY_STATUS_COLOR[r.paymentStatus] || 'bg-muted'}`}>{PAY_STATUS_MAP[r.paymentStatus] || r.paymentStatus}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{'\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u043e \u0437\u0430\u0434\u043e\u043b\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u0438'}</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════ EXPENSES TAB ═══════ */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{'\u0413\u043e\u0434'}</label>
              <select value={expYear} onChange={e => setExpYear(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm bg-background">
                {Array.from({ length: 5 }, (_, i) => currentYear - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{'\u041c\u0435\u0441\u044f\u0446'}</label>
              <select value={expMonth ?? ''} onChange={e => setExpMonth(e.target.value ? Number(e.target.value) : null)} className="border rounded-lg px-3 py-2 text-sm bg-background">
                <option value="">{'\u0412\u0435\u0441\u044c \u0433\u043e\u0434'}</option>
                {Object.entries(MONTH_NAMES).map(([num, name]) => (
                  <option key={num} value={Number(num)}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{'\u041c\u0430\u0448\u0438\u043d\u0430'}</label>
              <select value={expVehicle} onChange={e => setExpVehicle(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background">
                <option value="">{'\u0412\u0441\u0435 \u043c\u0430\u0448\u0438\u043d\u044b'}</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
              </select>
            </div>
          </div>

          {expLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">{'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}</div>
          ) : expReport ? (
            <>
              {/* Grand total cards */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="bg-card rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground">{'\u0412\u0441\u0435\u0433\u043e \u0440\u0430\u0441\u0445\u043e\u0434\u043e\u0432'}</p>
                  <p className="text-xl font-bold font-mono mt-1">{formatCurrency(expReport.grandTotals.total)}</p>
                </div>
                <div className="bg-card rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <Fuel className="w-3.5 h-3.5 text-amber-600" />
                    <p className="text-xs text-muted-foreground">{'\u0422\u043e\u043f\u043b\u0438\u0432\u043e'}</p>
                  </div>
                  <p className="text-lg font-bold font-mono mt-1 text-amber-600">{formatCurrency(expReport.grandTotals.fuel)}</p>
                  <p className="text-xs text-muted-foreground font-mono">{expReport.grandTotals.fuelLiters.toFixed(1)} {'\u043b'}</p>
                </div>
                <div className="bg-card rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-blue-600" />
                    <p className="text-xs text-muted-foreground">{'\u0422\u041e / \u0420\u0435\u043c\u043e\u043d\u0442'}</p>
                  </div>
                  <p className="text-lg font-bold font-mono mt-1 text-blue-600">{formatCurrency(expReport.grandTotals.maintenance)}</p>
                </div>
                <div className="bg-card rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <Settings2 className="w-3.5 h-3.5 text-violet-600" />
                    <p className="text-xs text-muted-foreground">{'\u0420\u0435\u0433\u043b\u0430\u043c\u0435\u043d\u0442 \u0422\u041e'}</p>
                  </div>
                  <p className="text-lg font-bold font-mono mt-1 text-violet-600">{formatCurrency(expReport.grandTotals.service)}</p>
                </div>
                <div className="bg-card rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-emerald-600" />
                    <p className="text-xs text-muted-foreground">{'\u0417\u0430\u043f\u0447\u0430\u0441\u0442\u0438'}</p>
                  </div>
                  <p className="text-lg font-bold font-mono mt-1 text-emerald-600">{formatCurrency(expReport.grandTotals.parts)}</p>
                </div>
              </div>

              {/* Per-vehicle cards */}
              {expReport.vehicles.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">{'\u0420\u0430\u0441\u0445\u043e\u0434\u044b \u043f\u043e \u043c\u0430\u0448\u0438\u043d\u0430\u043c'}</h3>
                  {expReport.vehicles.map(ev => {
                    const expanded = expExpandedVehicle === ev.vehicle.id;
                    return (
                      <div key={ev.vehicle.id} className="bg-card rounded-xl shadow-sm overflow-hidden">
                        {/* Vehicle header row */}
                        <button
                          onClick={() => setExpExpandedVehicle(expanded ? null : ev.vehicle.id)}
                          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition text-left"
                        >
                          <div className="flex items-center gap-3">
                            <Truck className="w-5 h-5 text-muted-foreground" />
                            <div>
                              <span className="font-semibold text-sm">{ev.vehicle.brand} {ev.vehicle.model}</span>
                              <span className="text-xs text-muted-foreground ml-2">{ev.vehicle.plateNumber}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-sm font-bold font-mono">{formatCurrency(ev.totals.total)}</span>
                            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        </button>

                        {expanded && (
                          <div className="border-t">
                            {/* Category breakdown */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-muted/20">
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">{'\u0422\u043e\u043f\u043b\u0438\u0432\u043e'}</p>
                                <p className="text-sm font-bold font-mono text-amber-600">{formatCurrency(ev.totals.fuel)}</p>
                                <p className="text-xs text-muted-foreground">{ev.totals.fuelLiters.toFixed(1)} {'\u043b'}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">{'\u0422\u041e / \u0420\u0435\u043c\u043e\u043d\u0442'}</p>
                                <p className="text-sm font-bold font-mono text-blue-600">{formatCurrency(ev.totals.maintenance)}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">{'\u0420\u0435\u0433\u043b\u0430\u043c\u0435\u043d\u0442 \u0422\u041e'}</p>
                                <p className="text-sm font-bold font-mono text-violet-600">{formatCurrency(ev.totals.service)}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">{'\u0417\u0430\u043f\u0447\u0430\u0441\u0442\u0438'}</p>
                                <p className="text-sm font-bold font-mono text-emerald-600">{formatCurrency(ev.totals.parts)}</p>
                              </div>
                            </div>

                            {/* Monthly table */}
                            {expReport.monthKeys.length > 1 && (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-xs text-muted-foreground border-b bg-muted/30">
                                      <th className="text-left py-2.5 px-3 font-medium">{'\u041c\u0435\u0441\u044f\u0446'}</th>
                                      <th className="text-right py-2.5 px-3 font-medium text-amber-600">{'\u0422\u043e\u043f\u043b\u0438\u0432\u043e'}</th>
                                      <th className="text-right py-2.5 px-3 font-medium text-blue-600">{'\u0422\u041e'}</th>
                                      <th className="text-right py-2.5 px-3 font-medium text-violet-600">{'\u0420\u0435\u0433\u043b.'}</th>
                                      <th className="text-right py-2.5 px-3 font-medium text-emerald-600">{'\u0417\u0430\u043f\u0447.'}</th>
                                      <th className="text-right py-2.5 px-3 font-medium font-bold">{'\u0418\u0442\u043e\u0433\u043e'}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expReport.monthKeys.map(mk => {
                                      const md = ev.months[mk];
                                      if (!md) return (
                                        <tr key={mk} className="border-b border-muted last:border-0 text-muted-foreground/50">
                                          <td className="py-2 px-3 font-medium">{MONTH_NAMES[mk.split('-')[1]] || mk}</td>
                                          <td className="py-2 px-3 text-right font-mono">{'\u2014'}</td>
                                          <td className="py-2 px-3 text-right font-mono">{'\u2014'}</td>
                                          <td className="py-2 px-3 text-right font-mono">{'\u2014'}</td>
                                          <td className="py-2 px-3 text-right font-mono">{'\u2014'}</td>
                                          <td className="py-2 px-3 text-right font-mono">{'\u2014'}</td>
                                        </tr>
                                      );
                                      return (
                                        <tr key={mk} className="border-b border-muted last:border-0 hover:bg-muted/50">
                                          <td className="py-2 px-3 font-medium">{MONTH_NAMES[mk.split('-')[1]] || mk}</td>
                                          <td className="py-2 px-3 text-right font-mono text-amber-600">{md.fuel > 0 ? formatCurrency(md.fuel) : '\u2014'}</td>
                                          <td className="py-2 px-3 text-right font-mono text-blue-600">{md.maintenance > 0 ? formatCurrency(md.maintenance) : '\u2014'}</td>
                                          <td className="py-2 px-3 text-right font-mono text-violet-600">{md.service > 0 ? formatCurrency(md.service) : '\u2014'}</td>
                                          <td className="py-2 px-3 text-right font-mono text-emerald-600">{md.parts > 0 ? formatCurrency(md.parts) : '\u2014'}</td>
                                          <td className="py-2 px-3 text-right font-mono font-bold">{formatCurrency(md.total)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{'\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u043e \u0440\u0430\u0441\u0445\u043e\u0434\u0430\u0445 \u0437\u0430 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0439 \u043f\u0435\u0440\u0438\u043e\u0434'}</p>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ═══════ SUPPLIER MODAL ═══════ */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSupplierModal(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-display font-bold">{editSupplierId ? '\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0430' : '\u041d\u043e\u0432\u044b\u0439 \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a'}</h2>
              <button onClick={() => setShowSupplierModal(false)} className="p-1 hover:bg-muted rounded-md transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{'\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 *'}</label>
                <input type="text" value={supplierForm.name} onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })} placeholder={'\u041d\u0430\u043f\u0440: \u0410\u0432\u0442\u043e\u0417\u0430\u043f\u0447\u0430\u0441\u0442\u0438 LLC'} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{'\u041a\u043e\u043d\u0442\u0430\u043a\u0442\u043d\u043e\u0435 \u043b\u0438\u0446\u043e'}</label>
                <input type="text" value={supplierForm.contactPerson} onChange={e => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{'\u0422\u0435\u043b\u0435\u0444\u043e\u043d'}</label>
                <input type="text" value={supplierForm.phone} onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{'\u0423\u0441\u043b\u043e\u0432\u0438\u044f \u043e\u043f\u043b\u0430\u0442\u044b'}</label>
                <input type="text" value={supplierForm.paymentTerms} onChange={e => setSupplierForm({ ...supplierForm, paymentTerms: e.target.value })} placeholder={'\u041d\u0430\u043f\u0440: \u041e\u0442\u0441\u0440\u043e\u0447\u043a\u0430 14 \u0434\u043d\u0435\u0439'} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t">
              <button onClick={() => setShowSupplierModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition">{'\u041e\u0442\u043c\u0435\u043d\u0430'}</button>
              <button onClick={saveSupplier} disabled={saving || !supplierForm.name} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition font-medium">
                {saving ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...' : '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ PART PURCHASE MODAL ═══════ */}
      {showPartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowPartModal(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-display font-bold">{editPartId ? '\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0437\u0430\u043f\u0438\u0441\u044c' : '\u041d\u043e\u0432\u0430\u044f \u0437\u0430\u043f\u0447\u0430\u0441\u0442\u044c / \u0443\u0441\u043b\u0443\u0433\u0430'}</h2>
              <button onClick={() => setShowPartModal(false)} className="p-1 hover:bg-muted rounded-md transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{'\u041c\u0430\u0448\u0438\u043d\u0430 (\u0422\u0421) *'}</label>
                <select value={partForm.vehicleId} onChange={e => setPartForm({ ...partForm, vehicleId: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="">{'\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043c\u0430\u0448\u0438\u043d\u0443'}</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{'\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a'}</label>
                <select value={partForm.supplierId} onChange={e => setPartForm({ ...partForm, supplierId: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="">{'\u0411\u0435\u0437 \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0430'}</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{'\u0414\u0430\u0442\u0430 *'}</label>
                  <input type="date" value={partForm.date} onChange={e => setPartForm({ ...partForm, date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{'\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435 *'}</label>
                  <input type="text" value={partForm.partName} onChange={e => setPartForm({ ...partForm, partName: e.target.value })} placeholder={'\u041d\u0430\u043f\u0440: \u0424\u0438\u043b\u044c\u0442\u0440 \u043c\u0430\u0441\u043b\u044f\u043d\u044b\u0439'} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{'\u041a\u043e\u043b-\u0432\u043e'}</label>
                  <input type="number" min={0} step="0.01" value={partForm.quantity} onChange={e => setPartForm({ ...partForm, quantity: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{'\u0426\u0435\u043d\u0430, \u058F'}</label>
                  <input type="number" min={0} step="0.01" value={partForm.unitPrice} onChange={e => setPartForm({ ...partForm, unitPrice: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{'\u0421\u0443\u043c\u043c\u0430'}</label>
                  <div className="border rounded-lg px-3 py-2 text-sm bg-muted/50 font-mono">
                    {formatCurrency((Number(partForm.quantity) || 0) * (Number(partForm.unitPrice) || 0))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{'\u041f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435'}</label>
                <textarea value={partForm.notes} onChange={e => setPartForm({ ...partForm, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t">
              <button onClick={() => setShowPartModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition">{'\u041e\u0442\u043c\u0435\u043d\u0430'}</button>
              <button onClick={savePart} disabled={saving || !partForm.vehicleId || !partForm.date || !partForm.partName} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition font-medium">
                {saving ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...' : '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ PAYMENT MODAL ═══════ */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-display font-bold">{'\u0412\u043d\u0435\u0441\u0442\u0438 \u043e\u043f\u043b\u0430\u0442\u0443'}</h2>
              <button onClick={() => setShowPaymentModal(false)} className="p-1 hover:bg-muted rounded-md transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{'\u0421\u0443\u043c\u043c\u0430 \u043e\u043f\u043b\u0430\u0442\u044b, \u058F *'}</label>
                <input type="number" min={0} step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" autoFocus />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{'\u0414\u0430\u0442\u0430 \u043e\u043f\u043b\u0430\u0442\u044b *'}</label>
                <input type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{'\u041f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435'}</label>
                <input type="text" value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t">
              <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition">{'\u041e\u0442\u043c\u0435\u043d\u0430'}</button>
              <button onClick={savePayment} disabled={saving || !paymentForm.amount || !paymentForm.paymentDate} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition font-medium">
                {saving ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...' : '\u041e\u043f\u043b\u0430\u0442\u0438\u0442\u044c'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input type="file" ref={fileInputRef} className="hidden" />
    </div>
  );
}
