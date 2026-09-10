'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, UserCheck, Phone, CreditCard, Car, TrendingUp, ShieldAlert,
  Plus, X, Pencil, Trash2, Loader2, FileText, Navigation,
} from 'lucide-react';
import { formatDate, DOCUMENT_TYPE_MAP, documentExpiryStatus } from '@/lib/utils';

const KIND_LABEL: Record<string, string> = { tractor: 'Тягач', trailer: 'Полуприцеп' };
const GEOFENCE_LABEL: Record<string, string> = { at_base: 'на базе', away: 'в пути' };
const DRIVER_DOC_TYPES: Record<string, string> = { waybill: 'Путевой лист', employment_contract: 'Трудовой договор', power_of_attorney: 'Доверенность' };

interface DriverDetail {
  id: string; fullName: string; phone: string | null; licenseNumber: string | null; status: string;
  vehicles: { id: string; plateNumber: string; brand: string; model: string; kind: string }[];
}
interface TripRow {
  id: string; tripNumber: string; vehicleId: string; departureDate: string; returnDate: string | null;
  status: string; geofenceStatus: string | null;
  vehicle: { id: string; plateNumber: string; brand: string; model: string } | null;
}
interface DocRow {
  id: string; entityType: string; entityId: string; docType: string; docName: string;
  expiryDate: string; description: string | null;
}

const emptyDocForm = { docType: 'permit', docName: '', expiryDate: '', description: '' };

export default function DriverDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [driver, setDriver] = useState<DriverDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [genDoc, setGenDoc] = useState<string | null>(null);

  const [showDocModal, setShowDocModal] = useState(false);
  const [editDocId, setEditDocId] = useState<string | null>(null);
  const [docForm, setDocForm] = useState(emptyDocForm);
  const [savingDoc, setSavingDoc] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [dRes, tRes, docRes] = await Promise.all([
      fetch(`/api/drivers/${id}`),
      fetch(`/api/vehicle-trips?driverId=${id}&showArchived=1`),
      fetch('/api/document-expiry'),
    ]);
    if (dRes.ok) setDriver(await dRes.json());
    if (tRes.ok) setTrips(await tRes.json());
    if (docRes.ok) {
      const all = await docRes.json();
      setDocs(Array.isArray(all) ? all.filter((d: any) => d.entityType === 'driver' && d.entityId === id) : []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  const activeTrip = trips.find(t => t.status === 'active') || null;

  const openNewDoc = () => { setEditDocId(null); setDocForm(emptyDocForm); setShowDocModal(true); };
  const openEditDoc = (d: DocRow) => {
    setEditDocId(d.id);
    setDocForm({ docType: d.docType, docName: d.docName, expiryDate: new Date(d.expiryDate).toISOString().split('T')[0], description: d.description || '' });
    setShowDocModal(true);
  };
  const saveDoc = async () => {
    if (!docForm.docName || !docForm.expiryDate) return;
    setSavingDoc(true);
    try {
      const url = editDocId ? `/api/document-expiry/${editDocId}` : '/api/document-expiry';
      const method = editDocId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...docForm, entityType: 'driver', entityId: id }),
      });
      if (res.ok) { setShowDocModal(false); await load(); }
    } finally { setSavingDoc(false); }
  };
  const deleteDoc = async (docId: string) => {
    if (!confirm('Удалить документ?')) return;
    await fetch(`/api/document-expiry/${docId}`, { method: 'DELETE' });
    await load();
  };

  const handleDriverDoc = async (documentType: string) => {
    if (genDoc || !driver) return;
    setGenDoc(documentType);
    try {
      const res = await fetch('/api/documents/driver-doc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: driver.id, documentType }),
      });
      if (!res.ok) { alert('Ошибка генерации'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${DRIVER_DOC_TYPES[documentType]}_${driver.fullName.replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally { setGenDoc(null); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!driver) return <div className="text-center py-16 text-muted-foreground">Водитель не найден</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/drivers" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
          <UserCheck className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{driver.fullName}</h1>
          <p className="text-sm text-muted-foreground">
            {driver.phone || '—'}{driver.licenseNumber ? ` · ВУ: ${driver.licenseNumber}` : ''}
          </p>
        </div>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${driver.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
          {driver.status === 'active' ? 'Активен' : driver.status === 'archived' ? 'В архиве' : 'Неактивен'}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="bg-card rounded-xl border p-4 space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5"><Car className="w-4 h-4" /> Текущая машина</h2>
          {driver.vehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Не назначена</p>
          ) : (
            <div className="space-y-1">
              {driver.vehicles.map(v => (
                <Link key={v.id} href={`/vehicles/${v.id}`} className="flex items-center gap-2 text-sm hover:underline">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${v.kind === 'trailer' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                    {KIND_LABEL[v.kind] || v.kind}
                  </span>
                  {v.brand} {v.model} <span className="font-mono text-muted-foreground">{v.plateNumber}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card rounded-xl border p-4 space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5"><Navigation className="w-4 h-4" /> Текущий рейс</h2>
          {!activeTrip ? (
            <p className="text-sm text-muted-foreground">Нет активного рейса</p>
          ) : (
            <Link href={`/vehicle-trips?vehicleId=${activeTrip.vehicleId}`} className="text-sm hover:underline">
              №{activeTrip.tripNumber} · {activeTrip.vehicle?.plateNumber || '—'} · с {formatDate(activeTrip.departureDate)}
              {activeTrip.geofenceStatus ? ` · ${GEOFENCE_LABEL[activeTrip.geofenceStatus] ?? activeTrip.geofenceStatus}` : ''}
            </Link>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> История рейсов ({trips.length})</h2>
        </div>
        {trips.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Нет рейсов</p>
        ) : (
          <div className="divide-y max-h-96 overflow-y-auto">
            {trips.map(t => (
              <Link key={t.id} href={`/vehicle-trips?vehicleId=${t.vehicleId}`} className="flex items-center justify-between px-4 py-2.5 text-xs hover:bg-muted/20 transition-colors">
                <span className="font-mono font-medium">№{t.tripNumber}</span>
                <span className="text-muted-foreground font-mono">{t.vehicle?.plateNumber || '—'}</span>
                <span>{formatDate(t.departureDate)}{t.returnDate ? ` → ${formatDate(t.returnDate)}` : (t.status === 'active' ? ' → в рейсе' : '')}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> Документы и разрешения ({docs.length})</h2>
          <button onClick={openNewDoc} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition">
            <Plus className="w-3.5 h-3.5" /> Добавить
          </button>
        </div>
        {docs.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            Нет отслеживаемых документов — права, ДОПОГ, TIR-карнет, виза и другие международные разрешения
          </p>
        ) : (
          <div className="divide-y">
            {docs
              .sort((a, b) => documentExpiryStatus(a.expiryDate).sort - documentExpiryStatus(b.expiryDate).sort)
              .map(d => {
                const st = documentExpiryStatus(d.expiryDate);
                return (
                  <div key={d.id} className="flex items-center justify-between px-4 py-2.5 text-xs gap-2">
                    <div>
                      <span className="font-medium">{d.docName}</span>
                      <span className="text-muted-foreground"> · {DOCUMENT_TYPE_MAP[d.docType] || d.docType}</span>
                    </div>
                    <span className="text-muted-foreground">{formatDate(d.expiryDate)}</span>
                    <span className={`px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                    <div className="flex gap-1">
                      <button onClick={() => openEditDoc(d)} className="p-1 hover:bg-muted rounded"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => deleteDoc(d.id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3 text-red-500" /></button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border p-4">
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><FileText className="w-4 h-4" /> Сформировать документ (Word)</h2>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(DRIVER_DOC_TYPES).map(([type, label]) => (
            <button
              key={type} onClick={() => handleDriverDoc(type)} disabled={!!genDoc}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition disabled:opacity-50"
            >
              {genDoc === type ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
              {label}
            </button>
          ))}
        </div>
      </div>

      {showDocModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowDocModal(false)}>
          <div className="bg-card rounded-xl shadow-lg w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editDocId ? 'Редактировать документ' : 'Новый документ'}</h3>
              <button onClick={() => setShowDocModal(false)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Тип</label>
                <select
                  value={docForm.docType}
                  onChange={e => setDocForm({ ...docForm, docType: e.target.value, docName: docForm.docName || DOCUMENT_TYPE_MAP[e.target.value] })}
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background"
                >
                  {Object.entries(DOCUMENT_TYPE_MAP).filter(([k]) => k !== 'osago' && k !== 'kasko' && k !== 'techosmotr').map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">Название/номер *</label><input type="text" value={docForm.docName} onChange={e => setDocForm({ ...docForm, docName: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" placeholder="Например: ДОПОГ №1234" /></div>
              <div><label className="text-xs text-muted-foreground">Действует до *</label><input type="date" value={docForm.expiryDate} onChange={e => setDocForm({ ...docForm, expiryDate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
              <div><label className="text-xs text-muted-foreground">Комментарий</label><input type="text" value={docForm.description} onChange={e => setDocForm({ ...docForm, description: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={saveDoc} disabled={savingDoc || !docForm.docName || !docForm.expiryDate} className="px-5 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60 transition">{savingDoc ? 'Сохранение...' : 'Сохранить'}</button>
              <button onClick={() => setShowDocModal(false)} className="px-5 py-2 border rounded-lg text-sm hover:bg-muted transition">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
