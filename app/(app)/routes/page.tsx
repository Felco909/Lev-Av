'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, MapPin, X, Save, Search } from 'lucide-react';
import { VEHICLE_TYPE_MAP } from '@/lib/vehicle-types';

const CURRENCIES = ['AMD', 'USD', 'EUR', 'RUB', 'GEL'] as const;
const CSYM: Record<string, string> = { AMD: '\u058F', USD: '$', EUR: '\u20AC', RUB: '\u20BD', GEL: '\u20BE' };

interface RouteTemplate {
  id: string;
  routeFrom: string;
  routeTo: string;
  distance: number | null;
  defaultRate: number | null;
  currency: string;
  vehicleType: string | null;
  notes: string | null;
}

export default function RoutesPage() {
  const [routes, setRoutes] = useState<RouteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RouteTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [form, setForm] = useState({ routeFrom: '', routeTo: '', distance: '', defaultRate: '', currency: 'AMD', vehicleType: '', notes: '' });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/route-templates');
      const data = await res.json();
      setRoutes(Array.isArray(data) ? data : []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ routeFrom: '', routeTo: '', distance: '', defaultRate: '', currency: 'AMD', vehicleType: '', notes: '' });
    setShowModal(true);
  };

  const openEdit = (r: RouteTemplate) => {
    setEditing(r);
    setForm({
      routeFrom: r.routeFrom,
      routeTo: r.routeTo,
      distance: r.distance != null ? String(r.distance) : '',
      defaultRate: r.defaultRate != null ? String(r.defaultRate) : '',
      currency: r.currency || 'AMD',
      vehicleType: r.vehicleType || '',
      notes: r.notes || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.routeFrom.trim() || !form.routeTo.trim()) return;
    setSaving(true);
    try {
      const body = {
        routeFrom: form.routeFrom.trim(),
        routeTo: form.routeTo.trim(),
        distance: form.distance ? Number(form.distance) : null,
        defaultRate: form.defaultRate ? Number(form.defaultRate) : null,
        currency: form.currency || 'AMD',
        vehicleType: form.vehicleType || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await fetch(`/api/route-templates/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch('/api/route-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      setShowModal(false);
      await load();
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить маршрут?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/route-templates/${id}`, { method: 'DELETE' });
      await load();
    } catch {} finally { setDeleting(null); }
  };

  const filtered = routes.filter(r =>
    !search || r.routeFrom.toLowerCase().includes(search.toLowerCase()) || r.routeTo.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Шаблоны маршрутов</h1>
          <p className="text-sm text-muted-foreground">Часто используемые маршруты для быстрого создания заявок</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition">
          <Plus className="w-4 h-4" /> Новый маршрут
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" placeholder="Поиск по городам..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-80 pl-9 pr-3 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <MapPin className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">{search ? 'Маршруты не найдены' : 'Нет шаблонов маршрутов'}</p>
          <p className="text-xs text-muted-foreground mt-1">Добавьте часто используемые маршруты для быстрого создания заявок</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(r => (
            <div key={r.id} className="bg-card rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{r.routeFrom} → {r.routeTo}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-md transition"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="p-1.5 hover:bg-red-50 rounded-md transition disabled:opacity-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {r.distance != null && <p>📏 Расстояние: <span className="font-medium text-foreground">{r.distance} км</span></p>}
                {r.defaultRate != null && <p>{"\uD83D\uDCB0"} {"\u0421\u0442\u0430\u0432\u043A\u0430"}: <span className="font-medium text-foreground">{Number(r.defaultRate).toLocaleString('ru-RU')} {CSYM[r.currency] || '\u058F'}</span></p>}
                {r.vehicleType && <p>🚛 Тип ТС: <span className="font-medium text-foreground">{VEHICLE_TYPE_MAP[r.vehicleType] || r.vehicleType}</span></p>}
                {r.notes && <p className="text-muted-foreground/70 italic mt-2">{r.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-display font-bold">{editing ? 'Редактирование маршрута' : 'Новый маршрут'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded-md transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Откуда *</label>
                <input type="text" value={form.routeFrom} onChange={e => setForm({...form, routeFrom: e.target.value})} placeholder="Москва"
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Куда *</label>
                <input type="text" value={form.routeTo} onChange={e => setForm({...form, routeTo: e.target.value})} placeholder="Санкт-Петербург"
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{"\u0420\u0430\u0441\u0441\u0442\u043E\u044F\u043D\u0438\u0435 (\u043A\u043C)"}</label>
                  <input type="number" min={0} value={form.distance} onChange={e => setForm({...form, distance: e.target.value})} placeholder="700"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{"\u0421\u0442\u0430\u0432\u043A\u0430"}, {CSYM[form.currency] || '\u058F'}</label>
                  <input type="number" min={0} value={form.defaultRate} onChange={e => setForm({...form, defaultRate: e.target.value})} placeholder="50000"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{"\u0412\u0430\u043B\u044E\u0442\u0430"}</label>
                  <select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c} {CSYM[c]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Тип транспорта</label>
                <select value={form.vehicleType} onChange={e => setForm({...form, vehicleType: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="">Не указан</option>
                  {Object.entries(VEHICLE_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Примечание</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} placeholder="Особенности маршрута..."
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition">Отмена</button>
              <button onClick={handleSave} disabled={saving || !form.routeFrom.trim() || !form.routeTo.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition">
                <Save className="w-4 h-4" /> {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
