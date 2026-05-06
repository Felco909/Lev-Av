'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, Fuel, X, Trash2, Gauge, TrendingDown, DollarSign, Calendar } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface FuelRecord {
  id: string; vehicleId: string; date: string; liters: number; cost: number; mileage: number; comment: string | null;
  vehicle: { id: string; plateNumber: string; brand: string; model: string; currentMileage: number | null };
}

export default function FuelPage() {
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterVehicle, setFilterVehicle] = useState('');
  const [form, setForm] = useState({ vehicleId: '', date: '', liters: '', cost: '', mileage: '', comment: '' });

  const load = useCallback(async () => {
    try {
      const [fRes, vRes] = await Promise.all([fetch('/api/fuel-records'), fetch('/api/vehicles')]);
      const [fData, vData] = await Promise.all([fRes.json(), vRes.json()]);
      setRecords(Array.isArray(fData) ? fData : []);
      setVehicles(Array.isArray(vData) ? vData : []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm({ vehicleId: '', date: new Date().toISOString().split('T')[0], liters: '', cost: '', mileage: '', comment: '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.vehicleId || !form.date || !form.liters || !form.mileage) return;
    setSaving(true);
    try {
      const res = await fetch('/api/fuel-records', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, liters: Number(form.liters), cost: Number(form.cost) || 0, mileage: Number(form.mileage) }),
      });
      if (res.ok) { setShowModal(false); await load(); }
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить запись?')) return;
    await fetch(`/api/fuel-records/${id}`, { method: 'DELETE' });
    await load();
  };

  const filtered = filterVehicle ? records.filter(r => r.vehicleId === filterVehicle) : records;
  const totalLiters = filtered.reduce((s, r) => s + Number(r.liters || 0), 0);
  const totalCost = filtered.reduce((s, r) => s + Number(r.cost || 0), 0);

  // Calculate consumption per vehicle
  const consumptionByVehicle = (() => {
    const groups: Record<string, FuelRecord[]> = {};
    records.forEach(r => { if (!groups[r.vehicleId]) groups[r.vehicleId] = []; groups[r.vehicleId].push(r); });
    const result: { vehicleId: string; name: string; plate: string; avgConsumption: number | null; totalLiters: number; totalCost: number }[] = [];
    Object.entries(groups).forEach(([vId, recs]) => {
      const sorted = [...recs].sort((a, b) => a.mileage - b.mileage);
      let consumption: number | null = null;
      if (sorted.length >= 2) {
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const dist = last.mileage - first.mileage;
        const liters = sorted.slice(1).reduce((s, r) => s + Number(r.liters), 0);
        if (dist > 0) consumption = Math.round((liters / dist) * 1000) / 10;
      }
      const v = recs[0].vehicle;
      result.push({
        vehicleId: vId,
        name: `${v.brand} ${v.model}`,
        plate: v.plateNumber,
        avgConsumption: consumption,
        totalLiters: recs.reduce((s, r) => s + Number(r.liters), 0),
        totalCost: recs.reduce((s, r) => s + Number(r.cost), 0),
      });
    });
    result.sort((a, b) => b.totalCost - a.totalCost);
    return result;
  })();

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Учёт топлива</h1>
          <p className="text-sm text-muted-foreground">Заправки и расход по машинам</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition">
          <Plus className="w-4 h-4" /> Заправка
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Fuel className="w-3.5 h-3.5" />Всего литров</div>
          <p className="text-xl font-bold font-mono">{Math.round(totalLiters).toLocaleString()} л</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="w-3.5 h-3.5" />Общие затраты</div>
          <p className="text-xl font-bold font-mono">{formatCurrency(totalCost)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingDown className="w-3.5 h-3.5" />Ср. цена/литр</div>
          <p className="text-xl font-bold font-mono">{totalLiters > 0 ? `${(totalCost / totalLiters).toFixed(2)} \u058F` : '\u2014'}</p>
        </div>
      </div>

      {/* Per-vehicle consumption */}
      {consumptionByVehicle.length > 0 && (
        <div className="bg-card rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <h3 className="text-sm font-semibold">Расход по машинам</h3>
          </div>
          <div className="divide-y">
            {consumptionByVehicle.map(vc => (
              <div key={vc.vehicleId} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="flex-1">
                  <span className="font-medium">{vc.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{vc.plate}</span>
                </div>
                <div className="text-right space-x-4">
                  {vc.avgConsumption !== null ? (
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      vc.avgConsumption > 40 ? 'bg-red-100 text-red-700' :
                      vc.avgConsumption > 30 ? 'bg-amber-100 text-amber-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>{vc.avgConsumption} л/100км</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Недост. данных</span>
                  )}
                  <span className="text-xs text-muted-foreground">{Math.round(vc.totalLiters)} л</span>
                  <span className="text-xs font-mono">{formatCurrency(vc.totalCost)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Records table */}
      <div className="flex items-center gap-3">
        <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background">
          <option value="">Все машины</option>
          {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
        </select>
        <span className="text-xs text-muted-foreground">Записей: {filtered.length}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Fuel className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Нет записей о заправках</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b bg-muted/30">
                <th className="text-left py-3 px-4 font-medium">Машина</th>
                <th className="text-left py-3 px-4 font-medium">Дата</th>
                <th className="text-right py-3 px-4 font-medium">Литры</th>
                <th className="text-right py-3 px-4 font-medium">Стоимость</th>
                <th className="text-right py-3 px-4 font-medium">Пробег</th>
                <th className="text-left py-3 px-4 font-medium">Комментарий</th>
                <th className="text-right py-3 px-4 font-medium"></th>
              </tr></thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-muted last:border-0 hover:bg-muted/50">
                    <td className="py-3 px-4 font-medium">{r.vehicle.brand} {r.vehicle.model}<br/><span className="text-xs text-muted-foreground">{r.vehicle.plateNumber}</span></td>
                    <td className="py-3 px-4">{formatDate(r.date)}</td>
                    <td className="py-3 px-4 text-right font-mono">{Number(r.liters).toFixed(1)} л</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(r.cost)}</td>
                    <td className="py-3 px-4 text-right">{r.mileage.toLocaleString()} км</td>
                    <td className="py-3 px-4 text-muted-foreground max-w-[200px] truncate">{r.comment || '—'}</td>
                    <td className="py-3 px-4 text-right">
                      <button onClick={() => handleDelete(r.id)} className="p-1.5 hover:bg-red-50 rounded-md transition"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                    </td>
                  </tr>
                ))}
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
              <h2 className="text-base font-display font-bold">Новая заправка</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded-md transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Машина *</label>
                <select value={form.vehicleId} onChange={e => {
                  const v = vehicles.find((v: any) => v.id === e.target.value);
                  setForm({ ...form, vehicleId: e.target.value, mileage: v?.currentMileage ? String(v.currentMileage) : form.mileage });
                }} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="">Выберите машину</option>
                  {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Дата *</label>
                  <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Пробег, км *</label>
                  <input type="number" min={0} value={form.mileage} onChange={e => setForm({ ...form, mileage: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Литры *</label>
                  <input type="number" min={0} step="0.1" value={form.liters} onChange={e => setForm({ ...form, liters: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Стоимость, \u058F</label>
                  <input type="number" min={0} value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Комментарий</label>
                <input type="text" value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} placeholder="Необязательно" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition">Отмена</button>
              <button onClick={handleSave} disabled={saving || !form.vehicleId || !form.date || !form.liters || !form.mileage} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition font-medium">
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
