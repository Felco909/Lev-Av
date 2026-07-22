'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Car, Gauge, Fuel, MapPin, Wrench, TrendingUp, Loader2, ArrowLeft, WifiOff, User } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatCurrency, formatDate } from '@/lib/utils';

interface VehicleDetail {
  id: string; plateNumber: string; brand: string; model: string; status: string;
  currentMileage: number | null; currentMileageUpdatedAt: string | null; wialonUnitId: string | null;
  driver: { id: string; fullName: string; phone: string | null } | null;
  createdAt: string;
}
interface LiveSnapshot {
  available: boolean; mileageKm: number | null; fuelLevelL: number | null;
  lat: number | null; lon: number | null; speedKmh: number | null; lastMessageAt: string | null;
  reason?: string;
}
interface TripRow {
  id: string; tripNumber: string; departureDate: string; returnDate: string | null;
  status: string; startMileage: number | null; endMileage: number | null;
  driver: { fullName: string } | null;
}
interface ServiceRecordRow {
  id: string; date: string; mileage: number; cost: number;
  regulation: { name: string } | null; comment: string | null;
}
interface Economics { tripsCount: number; totalRevenue: number; totalExpenses: number; profit: number }

const STALE_MS = 30 * 60 * 1000;

export default function VehicleDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [serviceRecords, setServiceRecords] = useState<ServiceRecordRow[]>([]);
  const [economics, setEconomics] = useState<Economics | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [vRes, tRes, sRes, eRes] = await Promise.all([
      fetch(`/api/vehicles/${id}`),
      fetch(`/api/vehicle-trips?vehicleId=${id}&showArchived=1`),
      fetch(`/api/service-records?vehicleId=${id}`),
      fetch(`/api/vehicles/${id}/economics`),
    ]);
    if (vRes.ok) setVehicle(await vRes.json());
    if (tRes.ok) setTrips(await tRes.json());
    if (sRes.ok) setServiceRecords(await sRes.json());
    if (eRes.ok) setEconomics(await eRes.json());
    setLoading(false);
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  const loadLive = useCallback(async () => {
    if (!vehicle?.wialonUnitId) return;
    setLiveLoading(true);
    const res = await fetch(`/api/wialon/vehicle-live?wialonUnitId=${encodeURIComponent(vehicle.wialonUnitId)}`);
    const data = await res.json().catch(() => null);
    setLive(data);
    setLiveLoading(false);
  }, [vehicle?.wialonUnitId]);

  useEffect(() => { if (vehicle?.wialonUnitId) loadLive(); }, [vehicle?.wialonUnitId, loadLive]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!vehicle) {
    return <div className="text-center py-16 text-muted-foreground">Машина не найдена</div>;
  }

  const stale = !live?.lastMessageAt || Date.now() - new Date(live.lastMessageAt).getTime() > STALE_MS;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/vehicles" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0">
          <Car className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{vehicle.brand} {vehicle.model}</h1>
          <p className="text-sm text-muted-foreground font-mono">{vehicle.plateNumber}</p>
        </div>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${vehicle.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
          {vehicle.status === 'active' ? 'Активна' : 'Неактивна'}
        </span>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">Основное</TabsTrigger>
          <TabsTrigger value="telematics">Телематика</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3">
              <p className="text-[10px] text-emerald-600">Доход (все рейсы)</p>
              <p className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-400">{economics ? formatCurrency(economics.totalRevenue) : '—'}</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
              <p className="text-[10px] text-red-600">Расходы (все рейсы)</p>
              <p className="text-base font-bold font-mono text-red-600">{economics ? formatCurrency(economics.totalExpenses) : '—'}</p>
            </div>
            <div className={`rounded-lg p-3 ${economics && economics.profit >= 0 ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
              <p className={`text-[10px] ${economics && economics.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>Прибыль автомобиля</p>
              <p className={`text-base font-bold font-mono ${economics && economics.profit >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600'}`}>{economics ? formatCurrency(economics.profit) : '—'}</p>
            </div>
          </div>

          <div className="bg-card rounded-xl border p-4 space-y-2 mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-1.5"><User className="w-4 h-4" /> Водитель</h2>
            <p className="text-sm text-muted-foreground">
              {vehicle.driver ? `${vehicle.driver.fullName}${vehicle.driver.phone ? ' · ' + vehicle.driver.phone : ''}` : 'Не назначен'}
            </p>
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
                  <Link key={t.id} href={`/vehicle-trips`} className="flex items-center justify-between px-4 py-2.5 text-xs hover:bg-muted/20 transition-colors">
                    <span className="font-mono font-medium">{t.tripNumber}</span>
                    <span className="text-muted-foreground">{t.driver?.fullName || '—'}</span>
                    <span>{formatDate(t.departureDate)}{t.returnDate ? ` → ${formatDate(t.returnDate)}` : ''}</span>
                    <span className="font-mono">{t.startMileage != null && t.endMileage != null ? `${(t.endMileage - t.startMileage).toLocaleString('ru-RU')} км` : '—'}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="telematics">
          <div className="space-y-4">
            <div className="bg-card rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Текущее состояние</h2>
                {vehicle.wialonUnitId && (
                  <button onClick={loadLive} disabled={liveLoading} className="text-xs px-2 py-1 border rounded-lg hover:bg-muted transition disabled:opacity-50">
                    {liveLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Обновить'}
                  </button>
                )}
              </div>
              {!vehicle.wialonUnitId ? (
                <p className="text-xs text-muted-foreground">Машина не связана с Wialon — см. раздел «Телематика» в меню для синхронизации.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-muted/40 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Gauge className="w-3 h-3" /> Пробег</p>
                    <p className="font-medium font-mono">{(live?.mileageKm ?? vehicle.currentMileage) != null ? `${(live?.mileageKm ?? vehicle.currentMileage)!.toLocaleString('ru-RU')} км` : '—'}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Fuel className="w-3 h-3" /> Топливо</p>
                    <p className="font-medium font-mono">{live?.fuelLevelL != null ? `${live.fuelLevelL} л` : '—'}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">Местоположение</p>
                    <p className="font-medium font-mono">{live?.lat != null && live?.lon != null ? `${live.lat.toFixed(4)}, ${live.lon.toFixed(4)}` : '—'}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">Связь</p>
                    <p className={`font-medium flex items-center gap-1 ${stale ? 'text-slate-500' : 'text-emerald-600'}`}>
                      {stale && <WifiOff className="w-3 h-3" />}
                      {live?.lastMessageAt ? new Date(live.lastMessageAt).toLocaleString('ru-RU') : '—'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-card rounded-xl border overflow-hidden">
              <div className="p-4 border-b">
                <h2 className="text-sm font-semibold flex items-center gap-1.5"><MapPin className="w-4 h-4" /> История движения (по рейсам)</h2>
              </div>
              {trips.filter(t => t.departureDate).length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">Нет данных</p>
              ) : (
                <div className="divide-y max-h-72 overflow-y-auto">
                  {trips.slice(0, 20).map(t => (
                    <div key={t.id} className="flex items-center justify-between px-4 py-2 text-xs">
                      <span className="font-mono">{t.tripNumber}</span>
                      <span>{formatDate(t.departureDate)} → {t.returnDate ? formatDate(t.returnDate) : (t.status === 'active' ? 'в рейсе' : '—')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-card rounded-xl border overflow-hidden">
              <div className="p-4 border-b">
                <h2 className="text-sm font-semibold flex items-center gap-1.5"><Wrench className="w-4 h-4" /> История ТО ({serviceRecords.length})</h2>
              </div>
              {serviceRecords.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">Нет записей</p>
              ) : (
                <div className="divide-y max-h-72 overflow-y-auto">
                  {serviceRecords.map(r => (
                    <div key={r.id} className="flex items-center justify-between px-4 py-2 text-xs">
                      <span className="font-medium">{r.regulation?.name || '—'}</span>
                      <span>{formatDate(r.date)}</span>
                      <span className="font-mono">{r.mileage.toLocaleString('ru-RU')} км</span>
                      <span className="font-mono text-red-600">{formatCurrency(r.cost)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
