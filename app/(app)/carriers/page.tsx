'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Building2, Phone, Mail, X } from 'lucide-react';

export default function CarriersPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: '', contactPerson: '', phone: '', email: '', inn: '', address: '', bankDetails: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/carriers');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openModal = (item?: any) => {
    if (item) {
      setEditItem(item);
      setForm({ name: item?.name ?? '', contactPerson: item?.contactPerson ?? '', phone: item?.phone ?? '', email: item?.email ?? '', inn: item?.inn ?? '', address: item?.address ?? '', bankDetails: item?.bankDetails ?? '' });
    } else {
      setEditItem(null);
      setForm({ name: '', contactPerson: '', phone: '', email: '', inn: '', address: '', bankDetails: '' });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const url = editItem ? `/api/carriers/${editItem.id}` : '/api/carriers';
      const method = editItem ? 'PUT' : 'POST';
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setShowModal(false);
      load();
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить перевозчика?')) return;
    try { await fetch(`/api/carriers/${id}`, { method: 'DELETE' }); load(); } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Перевозчики</h1>
          <p className="text-sm text-muted-foreground">Привлечённые перевозчики для экспедиции</p>
        </div>
        <button type="button" onClick={() => openModal()} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition">
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {loading ? <div className="p-8 text-center text-muted-foreground">Загрузка...</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(items ?? []).map((c: any) => (
            <div key={c?.id} className="bg-card rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-purple-600" /></div>
                  <div>
                    <h3 className="font-semibold text-sm">{c?.name ?? '—'}</h3>
                    {c?.contactPerson && <p className="text-xs text-muted-foreground">{c.contactPerson}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openModal(c)} className="p-1.5 hover:bg-muted rounded-md transition"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => handleDelete(c?.id)} className="p-1.5 hover:bg-red-50 rounded-md transition"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {c?.phone && <div className="flex items-center gap-2"><Phone className="w-3 h-3" />{c.phone}</div>}
                {c?.email && <div className="flex items-center gap-2"><Mail className="w-3 h-3" />{c.email}</div>}
                {c?.inn && <div className="flex items-center gap-2">ИНН: {c.inn}</div>}
                {c?.address && <div className="flex items-center gap-2">📍 {c.address}</div>}
                {c?.bankDetails && <div className="text-[10px] mt-1 p-1.5 bg-muted/50 rounded whitespace-pre-line">{c.bankDetails}</div>}
              </div>
            </div>
          ))}
          {(items?.length ?? 0) === 0 && <p className="col-span-full text-center text-muted-foreground py-8">Перевозчики не найдены</p>}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-xl shadow-lg w-full max-w-md p-6 space-y-4" onClick={(e) => e?.stopPropagation?.()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editItem ? 'Редактировать' : 'Новый перевозчик'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="text-xs text-muted-foreground">Название *</label><input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground">Контактное лицо</label><input type="text" value={form.contactPerson} onChange={(e) => setForm({...form, contactPerson: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
                <div><label className="text-xs text-muted-foreground">Телефон</label><input type="text" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground">Email</label><input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
                <div><label className="text-xs text-muted-foreground">ИНН</label><input type="text" value={form.inn} onChange={(e) => setForm({...form, inn: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
              </div>
              <div><label className="text-xs text-muted-foreground">Адрес</label><input type="text" value={form.address} onChange={(e) => setForm({...form, address: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
              <div><label className="text-xs text-muted-foreground">Банковские реквизиты</label><textarea value={form.bankDetails} onChange={(e) => setForm({...form, bankDetails: e.target.value})} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background resize-none font-mono" placeholder="Банк, р/с, БИК..." /></div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving || !form.name} className="px-5 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60 transition">{saving ? 'Сохранение...' : 'Сохранить'}</button>
              <button onClick={() => setShowModal(false)} className="px-5 py-2 border rounded-lg text-sm hover:bg-muted transition">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
