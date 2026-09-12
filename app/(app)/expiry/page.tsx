'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, ShieldAlert, X, Trash2, Pencil, AlertTriangle, ChevronLeft, ChevronRight, Truck, Users, Building2 } from 'lucide-react';
import { formatDate, DOCUMENT_TYPE_MAP, documentExpiryStatus } from '@/lib/utils';

const DOC_TYPE_MAP = DOCUMENT_TYPE_MAP;
const VEHICLE_KIND_MAP: Record<string, string> = { tractor: 'Тягач', trailer: 'Полуприцеп' };

type EntityType = 'vehicle' | 'driver' | 'carrier';
type VehicleKindFilter = 'all' | 'tractor' | 'trailer';

const ENTITY_TABS: { type: EntityType; label: string; icon: any }[] = [
  { type: 'vehicle', label: 'Транспорт', icon: Truck },
  { type: 'driver', label: 'Водители', icon: Users },
  { type: 'carrier', label: 'Перевозчики', icon: Building2 },
];

const STORAGE_KEY = 'expiry-page-selection';

interface DocExpiry {
  id: string; entityType: string; entityId: string; docType: string; docName: string;
  expiryDate: string; description: string | null; entityName: string; entityKind: string | null;
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

  const [entityType, setEntityType] = useState<EntityType>('vehicle');
  const [vehicleKindFilter, setVehicleKindFilter] = useState<VehicleKindFilter>('all');
  const [selectedId, setSelectedId] = useState<string>('');

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

  // Restore last selection (entity type + id) after reload.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.entityType) setEntityType(saved.entityType);
        if (saved?.vehicleKindFilter) setVehicleKindFilter(saved.vehicleKindFilter);
        if (saved?.selectedId) setSelectedId(saved.selectedId);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ entityType, vehicleKindFilter, selectedId })); } catch {}
  }, [entityType, vehicleKindFilter, selectedId]);

  const entityLabel = (t: EntityType) => t === 'vehicle' ? 'машину/прицеп' : t === 'driver' ? 'водителя' : 'перевозчика';

  const vehicleOptions = useMemo(() => {
    return vehicles
      .filter((v: any) => vehicleKindFilter === 'all' || v.kind === vehicleKindFilter)
      .map((v: any) => ({ id: v.id, plate: v.plateNumber, title: `${v.plateNumber} — ${v.brand} ${v.model}`, kind: v.kind }));
  }, [vehicles, vehicleKindFilter]);

  const options = useMemo(() => {
    if (entityType === 'vehicle') return vehicleOptions;
    if (entityType === 'driver') return drivers.map((d: any) => ({ id: d.id, title: d.fullName }));
    return carriers.map((c: any) => ({ id: c.id, title: c.name }));
  }, [entityType, vehicleOptions, drivers, carriers]);

  // If current selection no longer belongs to the visible options (entity type / kind filter
  // changed, or the saved id was deleted), fall back to the first available option rather than
  // silently showing stale/empty data.
  useEffect(() => {
    if (loading) return;
    if (selectedId && options.some(o => o.id === selectedId)) return;
    setSelectedId(options[0]?.id || '');
  }, [entityType, vehicleKindFilter, options, loading, selectedId]);

  const selectedOption = options.find(o => o.id === selectedId) || null;
  const selectedIndex = options.findIndex(o => o.id === selectedId);

  const goRelative = (delta: number) => {
    if (options.length === 0) return;
    const next = (selectedIndex + delta + options.length) % options.length;
    setSelectedId(options[next].id);
  };

  const scopedItems = useMemo(
    () => items.filter(i => i.entityType === entityType && i.entityId === selectedId),
    [items, entityType, selectedId],
  );

  const getEntitiesForModal = () => {
    if (form.entityType === 'vehicle') return vehicles.map((v: any) => ({ id: v.id, label: `${v.plateNumber} — ${v.brand} ${v.model} (${VEHICLE_KIND_MAP[v.kind] || 'Тягач'})` }));
    if (form.entityType === 'driver') return drivers.map((d: any) => ({ id: d.id, label: d.fullName }));
    return carriers.map((c: any) => ({ id: c.id, label: c.name }));
  };

  const openNew = () => {
    if (!selectedId) return;
    setEditId(null);
    setForm({ entityType, entityId: selectedId, docType: 'osago', docName: 'ОСАГО', expiryDate: '', description: '' });
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

  const getStatus = documentExpiryStatus;

  const expired = items.filter(i => getStatus(i.expiryDate).sort === 0).length;
  const expiring = items.filter(i => getStatus(i.expiryDate).sort === 1).length;

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Сроки документов</h1>
        <p className="text-sm text-muted-foreground">Страховки, техосмотры, лицензии и прочее — по одному объекту за раз</p>
      </div>

      {/* Warning banner — overall, across all objects */}
      {(expired > 0 || expiring > 0) && (
        <div className={`rounded-xl p-4 border ${expired > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: expired > 0 ? '#b91c1c' : '#92400e' }}>
            <AlertTriangle className="w-4 h-4" />
            {expired > 0 && <span>{expired} просрочено (всего по всем объектам)</span>}
            {expired > 0 && expiring > 0 && <span className="mx-1">•</span>}
            {expiring > 0 && <span className="text-amber-700">{expiring} истекают в течение 30 дней</span>}
          </div>
        </div>
      )}

      {/* Entity type tabs */}
      <div className="flex gap-2 border-b">
        {ENTITY_TABS.map(tab => {
          const Icon = tab.icon;
          const active = entityType === tab.type;
          return (
            <button
              key={tab.type}
              onClick={() => { setEntityType(tab.type); setSelectedId(''); }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Selection panel */}
      <div className="bg-card rounded-xl shadow-sm p-4 space-y-3">
        {entityType === 'vehicle' && (
          <div className="flex flex-wrap gap-2">
            {(['all', 'tractor', 'trailer'] as VehicleKindFilter[]).map(k => (
              <button
                key={k}
                onClick={() => { setVehicleKindFilter(k); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${vehicleKindFilter === k ? 'bg-primary text-white border-primary' : 'bg-background border-muted hover:bg-muted/50'}`}
              >
                {k === 'all' ? 'Все' : k === 'tractor' ? 'Тягачи' : 'Полуприцепы'}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-sm text-muted-foreground whitespace-nowrap">
            {entityType === 'vehicle' ? 'Транспортное средство:' : entityType === 'driver' ? 'Водитель:' : 'Перевозчик:'}
          </label>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              onClick={() => goRelative(-1)}
              disabled={options.length < 2}
              className="p-2 rounded-lg border hover:bg-muted transition disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              title="Предыдущий"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              {options.length === 0 && <option value="">Нет объектов</option>}
              {options.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
            <button
              onClick={() => goRelative(1)}
              disabled={options.length < 2}
              className="p-2 rounded-lg border hover:bg-muted transition disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              title="Следующий"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Selected object's documents */}
      {!selectedOption ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Выберите {entityLabel(entityType)} выше</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b bg-muted/30">
            <div>
              <h2 className="text-sm font-display font-bold">{selectedOption.title}</h2>
              <p className="text-xs text-muted-foreground">{scopedItems.length} {scopedItems.length === 1 ? 'документ' : 'документов'}</p>
            </div>
            <button onClick={openNew} className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 transition">
              <Plus className="w-3.5 h-3.5" /> Добавить документ
            </button>
          </div>

          {scopedItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Нет отслеживаемых документов для этого объекта</p>
              <p className="text-xs mt-1">Добавьте сроки действия страховок, техосмотров, лицензий</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-muted-foreground border-b bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium">Документ</th>
                  <th className="text-left py-3 px-4 font-medium">Действует до</th>
                  <th className="text-left py-3 px-4 font-medium">Статус</th>
                  <th className="text-right py-3 px-4 font-medium"></th>
                </tr></thead>
                <tbody>
                  {scopedItems.sort((a, b) => getStatus(a.expiryDate).sort - getStatus(b.expiryDate).sort || new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()).map(item => {
                    const st = getStatus(item.expiryDate);
                    return (
                      <tr key={item.id} className="border-b border-muted last:border-0 hover:bg-muted/50">
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
          )}
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
              {!editId && selectedOption && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  Объект: <span className="font-medium text-foreground">{selectedOption.title}</span>
                </div>
              )}
              {editId && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Объект *</label>
                  <select value={form.entityId} onChange={e => setForm({ ...form, entityId: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                    {getEntitiesForModal().map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </div>
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
