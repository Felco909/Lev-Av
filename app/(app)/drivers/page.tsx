'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, UserCheck, Phone, X, CreditCard, FileText, Loader2 } from 'lucide-react';

export default function DriversPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ fullName: '', phone: '', licenseNumber: '', status: 'active' });
  const [saving, setSaving] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null);

  const handleDriverDoc = useCallback(async (driverId: string, documentType: string, driverName: string) => {
    if (generatingDoc) return;
    const key = `${driverId}_${documentType}`;
    setGeneratingDoc(key);
    try {
      const res = await fetch('/api/documents/driver-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId, documentType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Ошибка' }));
        alert(err.error || 'Ошибка генерации');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const names: Record<string, string> = { waybill: 'Путевой_лист', employment_contract: 'Трудовой_договор', power_of_attorney: 'Доверенность' };
      a.download = `${names[documentType] || 'Документ'}_${driverName.replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Ошибка генерации документа');
    } finally {
      setGeneratingDoc(null);
    }
  }, [generatingDoc]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/drivers');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openModal = (item?: any) => {
    if (item) {
      setEditItem(item);
      setForm({ fullName: item?.fullName ?? '', phone: item?.phone ?? '', licenseNumber: item?.licenseNumber ?? '', status: item?.status ?? 'active' });
    } else {
      setEditItem(null);
      setForm({ fullName: '', phone: '', licenseNumber: '', status: 'active' });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.fullName) return;
    setSaving(true);
    try {
      const url = editItem ? `/api/drivers/${editItem.id}` : '/api/drivers';
      const method = editItem ? 'PUT' : 'POST';
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setShowModal(false);
      load();
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить водителя?')) return;
    try { await fetch(`/api/drivers/${id}`, { method: 'DELETE' }); load(); } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Водители</h1>
          <p className="text-sm text-muted-foreground">Список водителей компании</p>
        </div>
        <button type="button" onClick={() => openModal()} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition">
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {loading ? <div className="p-8 text-center text-muted-foreground">Загрузка...</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(items ?? []).map((d: any) => (
            <div key={d?.id} className="bg-card rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center"><UserCheck className="w-5 h-5 text-green-600" /></div>
                  <div>
                    <h3 className="font-semibold text-sm">{d?.fullName ?? '—'}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${d?.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{d?.status === 'active' ? 'Активен' : 'Неактивен'}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openModal(d)} className="p-1.5 hover:bg-muted rounded-md transition"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => handleDelete(d?.id)} className="p-1.5 hover:bg-red-50 rounded-md transition"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {d?.phone && <div className="flex items-center gap-2"><Phone className="w-3 h-3" />{d.phone}</div>}
                {d?.licenseNumber && <div className="flex items-center gap-2"><CreditCard className="w-3 h-3" />ВУ: {d.licenseNumber}</div>}
              </div>
              <div className="mt-3 pt-3 border-t border-muted">
                <p className="text-[10px] text-muted-foreground uppercase font-medium mb-1.5">Документы (Word)</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { type: 'waybill', label: 'Путевой лист', color: 'text-blue-600 bg-blue-50 hover:bg-blue-100' },
                    { type: 'employment_contract', label: 'Трудовой договор', color: 'text-green-600 bg-green-50 hover:bg-green-100' },
                    { type: 'power_of_attorney', label: 'Доверенность', color: 'text-purple-600 bg-purple-50 hover:bg-purple-100' },
                  ].map(doc => {
                    const isGen = generatingDoc === `${d?.id}_${doc.type}`;
                    return (
                      <button
                        key={doc.type}
                        onClick={() => handleDriverDoc(d?.id, doc.type, d?.fullName || '')}
                        disabled={!!generatingDoc}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition disabled:opacity-50 ${doc.color}`}
                      >
                        {isGen ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <FileText className="w-2.5 h-2.5" />}
                        {doc.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
          {(items?.length ?? 0) === 0 && <p className="col-span-full text-center text-muted-foreground py-8">Водители не найдены</p>}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-xl shadow-lg w-full max-w-md p-6 space-y-4" onClick={(e) => e?.stopPropagation?.()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editItem ? 'Редактировать' : 'Новый водитель'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="text-xs text-muted-foreground">ФИО *</label><input type="text" value={form.fullName} onChange={(e) => setForm({...form, fullName: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground">Телефон</label><input type="text" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
                <div><label className="text-xs text-muted-foreground">№ ВУ</label><input type="text" value={form.licenseNumber} onChange={(e) => setForm({...form, licenseNumber: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
              </div>
              <div><label className="text-xs text-muted-foreground">Статус</label>
                <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background">
                  <option value="active">Активен</option><option value="inactive">Неактивен</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving || !form.fullName} className="px-5 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60 transition">{saving ? 'Сохранение...' : 'Сохранить'}</button>
              <button onClick={() => setShowModal(false)} className="px-5 py-2 border rounded-lg text-sm hover:bg-muted transition">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
