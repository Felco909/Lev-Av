'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, ShieldAlert, X, Trash2, Pencil, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';

const DOC_TYPE_MAP: Record<string, string> = {
  osago: 'ОСАГО', kasko: 'КАСКО', techosmotr: 'Техосмотр',
  license: 'Вод. удостоверение', permit: 'Лицензия/разрешение', other: 'Прочее',
};
const ENTITY_TYPE_MAP: Record<string, string> = { vehicle: 'Машина', driver: 'Водитель', carrier: 'Перевозчик' };

interface DocExpiry {
  id: string; entityType: string; entityId: string; docType: string; docName: string;
  expiryDate: string; description: string | null; entityName: string;
}

export default function ExpiryPage() {
  const [items, setItems] = useState<DocExpiry[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ entityType: 'vehicle', entityId: '', docType: 'osago', docName: '', expiryDate: '', description: '' });

  const load = useCallback(async () => {
    try {
      const [dRes, vRes, drRes, cRes] = await Promise.all([
        fetch('/api/document-expiry'), fetch('/api/vehicles'), fetch('/api/drivers'), fetch('/api/carriers'),
      ]);
      const [dData, vData, drData, cData] = await Promise.all([dRes.json(), vRes.json(), drRes.json(), cRes.json()]);
      setItems(Array.isArray(dData) ? dData : []);
      setVehicles(Array.isArray(vData) ? vData : []);
      setDrivers(Array.isArray(drData) ? drData : []);
      setCarriers(Array.isArray(cData) ? cData : []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getEntities = () => {
    if (form.entityType === 'vehicle') return vehicles.map((v: any) => ({ id: v.id, label: `${v.brand} ${v.model} (${v.plateNumber})` }));
    if (form.entityType === 'driver') return drivers.map((d: any) => ({ id: d.id, label: d.fullName }));
    return carriers.map((c: any) => ({ id: c.id, label: c.name }));
  };

  const openNew = () => {
    setEditId(null);
    setForm({ entityType: 'vehicle', entityId: '', docType: 'osago', docName: 'ОСАГО', expiryDate: '', description: '' });
    setShowModal(true);
  };
  const openEdit = (item: DocExpiry) => {
    setEditId(item.id);
    setForm({ entityType: item.entityType, entityId: item.entityId, docType: item.docType, docName: item.docName, expiryDate: new Date(item.expiryDate).toISOString().split('T')[0], description: item.description || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.entityId || !form.docName || !form.expiryDate) return;
    setSaving(true);
    try {
      const url = editId ? `/api/document-expiry/${editId}` : '/api/document-expiry';
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (res.ok) { setShowModal(false); await load(); }
    } catch {} finally { setSaving(false); }
  };
  const handleDelete = async (id: string) => {
    if (!confirm('Удалить?')) return;
    await fetch(`/api/document-expiry/${id}`, { method: 'DELETE' });
    await load();
  };

  const today = new Date();
  const getStatus = (expiryDate: string) => {
    const d = new Date(expiryDate);
    const days = Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { label: `Просрочено ${Math.abs(days)} дн.`, color: 'bg-red-100 text-red-700', sort: 0 };
    if (days <= 30) return { label: `Через ${days} дн.`, color: 'bg-amber-100 text-amber-700', sort: 1 };
    return { label: `Через ${days} дн.`, color: 'bg-emerald-100 text-emerald-700', sort: 2 };
  };

  const expired = items.filter(i => getStatus(i.expiryDate).sort === 0).length;
  const expiring = items.filter(i => getStatus(i.expiryDate).sort === 1).length;

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Сроки документов</h1>
          <p className="text-sm text-muted-foreground">Страховки, техосмотры, лицензии и прочее</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition">
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {/* Warning banner */}
      {(expired > 0 || expiring > 0) && (
        <div className={`rounded-xl p-4 border ${expired > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: expired > 0 ? '#b91c1c' : '#92400e' }}>
            <AlertTriangle className="w-4 h-4" />
            {expired > 0 && <span>{expired} просрочено</span>}
            {expired > 0 && expiring > 0 && <span className="mx-1">•</span>}
            {expiring > 0 && <span className="text-amber-700">{expiring} истекают в течение 30 дней</span>}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Нет отслеживаемых документов</p>
          <p className="text-xs mt-1">Добавьте сроки действия страховок, техосмотров, лицензий</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b bg-muted/30">
                <th className="text-left py-3 px-4 font-medium">Тип</th>
                <th className="text-left py-3 px-4 font-medium">Объект</th>
                <th className="text-left py-3 px-4 font-medium">Документ</th>
                <th className="text-left py-3 px-4 font-medium">Истекает</th>
                <th className="text-left py-3 px-4 font-medium">Статус</th>
                <th className="text-right py-3 px-4 font-medium"></th>
              </tr></thead>
              <tbody>
                {items.sort((a, b) => getStatus(a.expiryDate).sort - getStatus(b.expiryDate).sort || new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()).map(item => {
                  const st = getStatus(item.expiryDate);
                  return (
                    <tr key={item.id} className="border-b border-muted last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-4"><span className="text-xs px-2 py-1 rounded-full bg-muted font-medium">{ENTITY_TYPE_MAP[item.entityType] || item.entityType}</span></td>
                      <td className="py-3 px-4 font-medium">{item.entityName}</td>
                      <td className="py-3 px-4">{item.docName}<br/><span className="text-xs text-muted-foreground">{DOC_TYPE_MAP[item.docType] || item.docType}</span></td>
                      <td className="py-3 px-4">{formatDate(item.expiryDate)}</td>
                      <td className="py-3 px-4"><span className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}>{st.label}</span></td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-muted rounded-md transition"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(item.id)} className="p-1.5 hover:bg-red-50 rounded-md transition"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-display font-bold">{editId ? 'Редактировать' : 'Новый документ'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded-md transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {!editId && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Тип объекта *</label>
                    <select value={form.entityType} onChange={e => setForm({ ...form, entityType: e.target.value, entityId: '' })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                      <option value="vehicle">Машина</option>
                      <option value="driver">Водитель</option>
                      <option value="carrier">Перевозчик</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{ENTITY_TYPE_MAP[form.entityType]} *</label>
                    <select value={form.entityId} onChange={e => setForm({ ...form, entityId: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                      <option value="">Выберите</option>
                      {getEntities().map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Тип документа</label>
                <select value={form.docType} onChange={e => setForm({ ...form, docType: e.target.value, docName: DOC_TYPE_MAP[e.target.value] || form.docName })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  {Object.entries(DOC_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Название *</label>
                <input type="text" value={form.docName} onChange={e => setForm({ ...form, docName: e.target.value })} placeholder="Напр: ОСАГО на MAN TGX" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Дата истечения *</label>
                <input type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
                <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Необязательно" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition">Отмена</button>
              <button onClick={handleSave} disabled={saving || !form.entityId || !form.docName || !form.expiryDate} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition font-medium">
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
