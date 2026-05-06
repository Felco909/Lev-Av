'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, Car, X, User, ChevronDown, History, Search, Filter } from 'lucide-react';

interface Driver { id: string; fullName: string; phone?: string | null; }
interface VehicleItem {
  id: string; plateNumber: string; brand: string; model: string; status: string;
  currentMileage?: number | null; driverId?: string | null;
  driver?: Driver | null;
}
interface HistoryItem {
  id: string; vehicleId: string; oldDriverId?: string | null; oldDriverName?: string | null;
  newDriverId?: string | null; newDriverName?: string | null; changedAt: string;
}

export default function VehiclesPage() {
  const [items, setItems] = useState<VehicleItem[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<VehicleItem | null>(null);
  const [form, setForm] = useState({ plateNumber: '', brand: '', model: '', status: 'active', driverId: '' });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [historyVehicle, setHistoryVehicle] = useState<VehicleItem | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Driver inline change
  const [driverDropdown, setDriverDropdown] = useState<string | null>(null);
  const [driverSearch, setDriverSearch] = useState('');
  const ddRef = useRef<HTMLDivElement>(null);

  const loadDrivers = useCallback(async () => {
    try {
      const res = await fetch('/api/drivers');
      const data = await res.json();
      setDrivers(Array.isArray(data) ? data.filter((d: any) => d?.status === 'active') : []);
    } catch {}
  }, []);

  const load = useCallback(async () => {
    try {
      const url = driverFilter ? `/api/vehicles?driverId=${driverFilter}` : '/api/vehicles';
      const res = await fetch(url);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {} finally { setLoading(false); }
  }, [driverFilter]);

  useEffect(() => { load(); loadDrivers(); }, [load, loadDrivers]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setDriverDropdown(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openModal = (item?: VehicleItem) => {
    if (item) {
      setEditItem(item);
      setForm({ plateNumber: item.plateNumber ?? '', brand: item.brand ?? '', model: item.model ?? '', status: item.status ?? 'active', driverId: item.driverId ?? '' });
    } else {
      setEditItem(null);
      setForm({ plateNumber: '', brand: '', model: '', status: 'active', driverId: '' });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.plateNumber || !form.brand || !form.model) return;
    setSaving(true);
    try {
      const url = editItem ? `/api/vehicles/${editItem.id}` : '/api/vehicles';
      const method = editItem ? 'PUT' : 'POST';
      const payload: any = { ...form };
      if (!payload.driverId) payload.driverId = null;
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setShowModal(false);
      load();
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить машину?')) return;
    try { await fetch(`/api/vehicles/${id}`, { method: 'DELETE' }); load(); } catch {}
  };

  const handleDriverChange = async (vehicleId: string, newDriverId: string | null) => {
    setDriverDropdown(null);
    try {
      await fetch(`/api/vehicles/${vehicleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: newDriverId }),
      });
      load();
    } catch {}
  };

  const openHistory = async (v: VehicleItem) => {
    setHistoryVehicle(v);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/vehicles/${v.id}/driver-history`);
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch { setHistory([]); }
    finally { setHistoryLoading(false); }
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
  };

  const filtered = items.filter(v => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (v.plateNumber?.toLowerCase().includes(s) || v.brand?.toLowerCase().includes(s) || v.model?.toLowerCase().includes(s) || v.driver?.fullName?.toLowerCase().includes(s));
  });

  const filteredDriversForDD = drivers.filter(d =>
    !driverSearch || d.fullName.toLowerCase().includes(driverSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Машины</h1>
          <p className="text-sm text-muted-foreground">Автопарк компании</p>
        </div>
        <button type="button" onClick={() => openModal()} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition">
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text" placeholder="Поиск по номеру, марке, водителю..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={driverFilter} onChange={e => setDriverFilter(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">Все водители</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
            </select>
            {driverFilter && (
              <button onClick={() => setDriverFilter('')} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            )}
          </div>
        </div>
      </div>

      {loading ? <div className="p-8 text-center text-muted-foreground">Загрузка...</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((v) => (
            <div key={v.id} className="bg-card rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center"><Car className="w-5 h-5 text-indigo-600" /></div>
                  <div>
                    <h3 className="font-semibold text-sm">{v.brand} {v.model}</h3>
                    <p className="text-xs font-mono text-muted-foreground">{v.plateNumber}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${v.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {v.status === 'active' ? 'Активна' : 'Неактивна'}
                </span>
              </div>

              {/* Driver section */}
              <div className="relative mb-3" ref={driverDropdown === v.id ? ddRef : undefined}>
                <button
                  onClick={() => { setDriverDropdown(driverDropdown === v.id ? null : v.id); setDriverSearch(''); }}
                  className="w-full flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-muted/50 transition text-left"
                >
                  <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className={`flex-1 truncate ${v.driver ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {v.driver?.fullName || 'Водитель не назначен'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </button>
                {driverDropdown === v.id && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg max-h-56 overflow-hidden">
                    <div className="p-2 border-b">
                      <input
                        type="text" placeholder="Искать водителя..."
                        value={driverSearch} onChange={e => setDriverSearch(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border rounded bg-background outline-none focus:ring-1 focus:ring-primary/30"
                        autoFocus
                      />
                    </div>
                    <div className="overflow-y-auto max-h-40">
                      <button
                        onClick={() => handleDriverChange(v.id, null)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition ${!v.driverId ? 'bg-primary/10 font-medium' : ''}`}
                      >
                        <span className="text-muted-foreground">— Без водителя —</span>
                      </button>
                      {filteredDriversForDD.map(d => (
                        <button
                          key={d.id}
                          onClick={() => handleDriverChange(v.id, d.id)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition ${v.driverId === d.id ? 'bg-primary/10 font-medium' : ''}`}
                        >
                          {d.fullName}
                        </button>
                      ))}
                      {filteredDriversForDD.length === 0 && (
                        <p className="px-3 py-2 text-sm text-muted-foreground">Не найдено</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-1 justify-end">
                <button onClick={() => openHistory(v)} className="p-1.5 hover:bg-muted rounded-md transition" title="История водителей">
                  <History className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button onClick={() => openModal(v)} className="p-1.5 hover:bg-muted rounded-md transition" title="Редактировать">
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button onClick={() => handleDelete(v.id)} className="p-1.5 hover:bg-red-50 rounded-md transition" title="Удалить">
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="col-span-full text-center text-muted-foreground py-8">Машины не найдены</p>}
        </div>
      )}

      {/* Edit/Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-xl shadow-lg w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editItem ? 'Редактировать' : 'Новая машина'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="text-xs text-muted-foreground">Гос. номер *</label><input type="text" value={form.plateNumber} onChange={(e) => setForm({...form, plateNumber: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground">Марка *</label><input type="text" value={form.brand} onChange={(e) => setForm({...form, brand: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" /></div>
                <div><label className="text-xs text-muted-foreground">Модель *</label><input type="text" value={form.model} onChange={(e) => setForm({...form, model: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" /></div>
              </div>
              <div><label className="text-xs text-muted-foreground">Водитель</label>
                <select value={form.driverId} onChange={(e) => setForm({...form, driverId: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="">— Без водителя —</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">Статус</label>
                <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="active">Активна</option><option value="inactive">Неактивна</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving || !form.plateNumber || !form.brand || !form.model} className="px-5 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60 transition">{saving ? 'Сохранение...' : 'Сохранить'}</button>
              <button onClick={() => setShowModal(false)} className="px-5 py-2 border rounded-lg text-sm hover:bg-muted transition">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Driver History Modal */}
      {historyVehicle && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setHistoryVehicle(null)}>
          <div className="bg-card rounded-xl shadow-lg w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">История водителей</h3>
                <p className="text-sm text-muted-foreground">{historyVehicle.brand} {historyVehicle.model} — {historyVehicle.plateNumber}</p>
              </div>
              <button onClick={() => setHistoryVehicle(null)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>

            {/* Current driver */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Текущий водитель</p>
              <p className="font-medium text-sm">{historyVehicle.driver?.fullName || 'Не назначен'}</p>
            </div>

            {historyLoading ? (
              <p className="text-center text-muted-foreground py-4">Загрузка...</p>
            ) : history.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">История изменений пуста</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {history.map(h => (
                  <div key={h.id} className="flex items-start gap-3 p-3 border rounded-lg text-sm">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <History className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-muted-foreground line-through">{h.oldDriverName || 'Без водителя'}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">{h.newDriverName || 'Без водителя'}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(h.changedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
