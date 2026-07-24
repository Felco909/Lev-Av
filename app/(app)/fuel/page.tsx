'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Fuel, X, Trash2, Gauge, TrendingDown, Droplets, AlertTriangle } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface VehicleTripFuelRow {
  id: string;
  tripNumber: string;
  vehicleId: string;
  vehicle: { id: string; plateNumber: string; brand: string; model: string };
  driver: { id: string; fullName: string } | null;
  departureDate: string;
  returnDate: string | null;
  status: string;
  calculatedKm: number | null;
  calculatedFuelConsumedL: number | null;
  wialonFuelLevelBeginL: number | null;
  wialonFuelLevelEndL: number | null;
  wialonAvgFuelConsumptionPer100Km: number | null;
  wialonFillingsCount: number | null;
  wialonFilledL: number | null;
  wialonTheftsCount: number | null;
  wialonTheftedL: number | null;
}

interface FuelRecord {
  id: string; vehicleId: string; vehicleTripId: string | null; date: string; liters: number; cost: number; mileage: number; comment: string | null;
  vehicle: { id: string; plateNumber: string; brand: string; model: string; currentMileage: number | null };
}

export default function FuelPage() {
  const [trips, setTrips] = useState<VehicleTripFuelRow[]>([]);
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterStatus, setFilterStatus] = useState(''); // '' = все, 'active' | 'completed' | 'archived'
  const [form, setForm] = useState({ vehicleId: '', vehicleTripId: '', date: '', liters: '', cost: '', mileage: '', comment: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filterVehicle) p.set('vehicleId', filterVehicle);
      if (filterStatus) p.set('status', filterStatus);
      else p.set('showArchived', '1'); // "Все" — включая архив, как на /vehicle-trips
      const [tRes, fRes, vRes] = await Promise.all([
        fetch(`/api/vehicle-trips?${p}`),
        fetch('/api/fuel-records'),
        fetch('/api/vehicles'),
      ]);
      const [tData, fData, vData] = await Promise.all([tRes.json(), fRes.json(), vRes.json()]);
      setTrips(Array.isArray(tData) ? tData : []);
      setRecords(Array.isArray(fData) ? fData : []);
      setVehicles(Array.isArray(vData) ? vData : []);
    } catch {} finally { setLoading(false); }
  }, [filterVehicle, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm({ vehicleId: '', vehicleTripId: '', date: new Date().toISOString().split('T')[0], liters: '', cost: '', mileage: '', comment: '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.vehicleId || !form.date || !form.liters || !form.mileage) return;
    setSaving(true);
    try {
      const res = await fetch('/api/fuel-records', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, vehicleTripId: form.vehicleTripId || null, liters: Number(form.liters), cost: Number(form.cost) || 0, mileage: Number(form.mileage) }),
      });
      if (res.ok) { setShowModal(false); await load(); }
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить корректировку?')) return;
    await fetch(`/api/fuel-records/${id}`, { method: 'DELETE' });
    await load();
  };

  const filteredTrips = filterVehicle ? trips.filter(t => t.vehicleId === filterVehicle) : trips;
  const filteredRecords = filterVehicle ? records.filter(r => r.vehicleId === filterVehicle) : records;

  const tripsForVehicle = useMemo(
    () => (form.vehicleId ? trips.filter(t => t.vehicleId === form.vehicleId) : []),
    [trips, form.vehicleId]
  );

  const summary = useMemo(() => {
    const withCalc = filteredTrips.filter(t => t.calculatedFuelConsumedL != null);
    const totalFuel = withCalc.reduce((s, t) => s + (t.calculatedFuelConsumedL || 0), 0);
    const totalKm = withCalc.reduce((s, t) => s + (t.calculatedKm || 0), 0);
    return {
      tripsWithCalc: withCalc.length,
      tripsTotal: filteredTrips.length,
      totalFuel,
      avgPer100: totalKm > 0 ? Math.round((totalFuel / totalKm) * 100 * 10) / 10 : null,
    };
  }, [filteredTrips]);

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Учёт топлива</h1>
          <p className="text-sm text-muted-foreground">Расход по данным Wialon (рейсы машин)</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 border text-sm font-medium rounded-lg hover:bg-muted transition">
          <Plus className="w-4 h-4" /> Корректировка / заправка
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Fuel className="w-3.5 h-3.5" />Израсходовано (Wialon)</div>
          <p className="text-xl font-bold font-mono">{Math.round(summary.totalFuel).toLocaleString()} л</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingDown className="w-3.5 h-3.5" />Ср. расход/100км</div>
          <p className="text-xl font-bold font-mono">{summary.avgPer100 != null ? `${summary.avgPer100} л` : '—'}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Gauge className="w-3.5 h-3.5" />Рейсов с расчётом</div>
          <p className="text-xl font-bold font-mono">{summary.tripsWithCalc} из {summary.tripsTotal}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background">
          <option value="">Все машины</option>
          {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background">
          <option value="">Все статусы</option>
          <option value="active">В работе</option>
          <option value="completed">Завершён</option>
          <option value="archived">Архив</option>
        </select>
        <span className="text-xs text-muted-foreground">Рейсов: {filteredTrips.length}</span>
      </div>

      {/* Main table — VehicleTrip / Wialon as source of truth */}
      {filteredTrips.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Fuel className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Нет рейсов машин</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b bg-muted/30">
                <th className="text-left py-3 px-4 font-medium">Машина</th>
                <th className="text-left py-3 px-4 font-medium">Водитель</th>
                <th className="text-left py-3 px-4 font-medium">Рейс</th>
                <th className="text-left py-3 px-4 font-medium">Выезд</th>
                <th className="text-left py-3 px-4 font-medium">Возврат</th>
                <th className="text-right py-3 px-4 font-medium">Топливо выезд</th>
                <th className="text-right py-3 px-4 font-medium">Топливо возврат</th>
                <th className="text-right py-3 px-4 font-medium">Израсходовано</th>
                <th className="text-right py-3 px-4 font-medium">Пробег</th>
                <th className="text-right py-3 px-4 font-medium">Ср./100км</th>
                <th className="text-right py-3 px-4 font-medium">Заправки (Wialon)</th>
                <th className="text-right py-3 px-4 font-medium">Сливы (Wialon)</th>
              </tr></thead>
              <tbody>
                {filteredTrips.map(t => (
                  <tr key={t.id} className="border-b border-muted last:border-0 hover:bg-muted/50">
                    <td className="py-3 px-4 font-medium">{t.vehicle.brand} {t.vehicle.model}<br/><span className="text-xs text-muted-foreground">{t.vehicle.plateNumber}</span></td>
                    <td className="py-3 px-4 text-muted-foreground">{t.driver?.fullName || '—'}</td>
                    <td className="py-3 px-4">
                      №{t.tripNumber}
                      <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                        t.status === 'archived' ? 'bg-slate-100 text-slate-500' : t.status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}>{t.status === 'archived' ? 'Архив' : t.status === 'active' ? 'В работе' : 'Завершён'}</span>
                    </td>
                    <td className="py-3 px-4">{formatDate(t.departureDate)}</td>
                    <td className="py-3 px-4">{formatDate(t.returnDate)}</td>
                    <td className="py-3 px-4 text-right font-mono">{t.wialonFuelLevelBeginL != null ? `${t.wialonFuelLevelBeginL.toFixed(1)} л` : '—'}</td>
                    <td className="py-3 px-4 text-right font-mono">{t.wialonFuelLevelEndL != null ? `${t.wialonFuelLevelEndL.toFixed(1)} л` : '—'}</td>
                    <td className="py-3 px-4 text-right font-mono">{t.calculatedFuelConsumedL != null ? `${t.calculatedFuelConsumedL.toFixed(1)} л` : '—'}</td>
                    <td className="py-3 px-4 text-right">{t.calculatedKm != null ? `${t.calculatedKm.toLocaleString()} км` : '—'}</td>
                    <td className="py-3 px-4 text-right">
                      {t.wialonAvgFuelConsumptionPer100Km != null ? (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          t.wialonAvgFuelConsumptionPer100Km > 40 ? 'bg-red-100 text-red-700' :
                          t.wialonAvgFuelConsumptionPer100Km > 30 ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>{t.wialonAvgFuelConsumptionPer100Km} л</span>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {t.wialonFillingsCount ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700"><Droplets className="w-3 h-3" />{t.wialonFillingsCount} / {t.wialonFilledL?.toFixed(0)} л</span>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {t.wialonTheftsCount ? (
                        <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle className="w-3 h-3" />{t.wialonTheftsCount} / {t.wialonTheftedL?.toFixed(0)} л</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual corrections — secondary, not the source of truth */}
      <div className="bg-card rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <h3 className="text-sm font-semibold">Ручные корректировки / заправки</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Вспомогательные записи, не основной источник данных — используются в отчётах по машинам/водителям</p>
        </div>
        {filteredRecords.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Нет корректировок</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b bg-muted/30">
                <th className="text-left py-2.5 px-4 font-medium">Машина</th>
                <th className="text-left py-2.5 px-4 font-medium">Рейс</th>
                <th className="text-left py-2.5 px-4 font-medium">Дата</th>
                <th className="text-right py-2.5 px-4 font-medium">Литры</th>
                <th className="text-right py-2.5 px-4 font-medium">Стоимость</th>
                <th className="text-right py-2.5 px-4 font-medium">Пробег</th>
                <th className="text-left py-2.5 px-4 font-medium">Комментарий</th>
                <th className="text-right py-2.5 px-4 font-medium"></th>
              </tr></thead>
              <tbody>
                {filteredRecords.map(r => (
                  <tr key={r.id} className="border-b border-muted last:border-0 hover:bg-muted/50">
                    <td className="py-2.5 px-4 font-medium">{r.vehicle.brand} {r.vehicle.model}<br/><span className="text-xs text-muted-foreground">{r.vehicle.plateNumber}</span></td>
                    <td className="py-2.5 px-4 text-xs text-muted-foreground">{r.vehicleTripId ? trips.find(t => t.id === r.vehicleTripId)?.tripNumber ?? '—' : '—'}</td>
                    <td className="py-2.5 px-4">{formatDate(r.date)}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{Number(r.liters).toFixed(1)} л</td>
                    <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(r.cost)}</td>
                    <td className="py-2.5 px-4 text-right">{r.mileage.toLocaleString()} км</td>
                    <td className="py-2.5 px-4 text-muted-foreground max-w-[200px] truncate">{r.comment || '—'}</td>
                    <td className="py-2.5 px-4 text-right">
                      <button onClick={() => handleDelete(r.id)} className="p-1.5 hover:bg-red-50 rounded-md transition"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-display font-bold">Новая корректировка / заправка</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded-md transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Машина *</label>
                <select value={form.vehicleId} onChange={e => {
                  const v = vehicles.find((v: any) => v.id === e.target.value);
                  setForm({ ...form, vehicleId: e.target.value, vehicleTripId: '', mileage: v?.currentMileage ? String(v.currentMileage) : form.mileage });
                }} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="">Выберите машину</option>
                  {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Рейс (необязательно)</label>
                <select value={form.vehicleTripId} onChange={e => setForm({ ...form, vehicleTripId: e.target.value })} disabled={!form.vehicleId} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none disabled:opacity-50">
                  <option value="">Без привязки к рейсу</option>
                  {tripsForVehicle.map(t => <option key={t.id} value={t.id}>№{t.tripNumber} ({formatDate(t.departureDate)})</option>)}
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
                  <label className="text-xs text-muted-foreground mb-1 block">Стоимость, ֏</label>
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
