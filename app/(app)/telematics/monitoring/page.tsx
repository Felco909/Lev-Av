'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Loader2, RefreshCw, WifiOff, Gauge, Fuel, User, TrendingUp } from 'lucide-react';
import { getVehicleActivityStatus, type VehicleActivityStatus } from '@/lib/wialon/status';
import type { FleetMapVehicle } from './_components/fleet-map';

const FleetMap = dynamic(() => import('./_components/fleet-map'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Загрузка карты...</div>,
});

const ACTIVITY_LABEL: Record<VehicleActivityStatus, string> = {
  moving: 'Движется',
  stopped: 'Стоит',
  no_signal: 'Нет связи',
};
const ACTIVITY_DOT: Record<VehicleActivityStatus, string> = {
  moving: 'bg-emerald-500',
  stopped: 'bg-blue-500',
  no_signal: 'bg-slate-400',
};

const REFRESH_MS = 30 * 1000;

export default function MonitoringPage() {
  const [vehicles, setVehicles] = useState<FleetMapVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch('/api/wialon/fleet-snapshot');
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      setVehicles(data.vehicles ?? []);
    } else {
      setError(data?.error ?? 'Не удалось загрузить данные Wialon');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Живой мониторинг — периодическое обновление (не постоянный WebSocket-поток, но этого
    // достаточно для карты статусов; единичная кнопка "Обновить сейчас" на рейсе — Этап 2 —
    // остаётся отдельным механизмом, не дублирует этот).
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const selected = vehicles.find((v) => v.vehicleId === selectedId) || null;

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Онлайн-мониторинг</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Живое положение и статус всех машин парка</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg hover:bg-muted transition disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Обновить
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex-1 flex gap-4 min-h-0">
        <div className="flex-1 rounded-xl border overflow-hidden">
          {loading && vehicles.length === 0 ? (
            <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <FleetMap vehicles={vehicles} onSelect={setSelectedId} />
          )}
        </div>

        <div className="w-80 shrink-0 flex flex-col gap-2 overflow-y-auto">
          <div className="bg-card rounded-xl border p-3 space-y-1.5 shrink-0">
            {(['moving', 'stopped', 'no_signal'] as VehicleActivityStatus[]).map((s) => (
              <div key={s} className="flex items-center gap-2 text-xs">
                <span className={`w-2.5 h-2.5 rounded-full ${ACTIVITY_DOT[s]}`} />
                <span className="text-muted-foreground">{ACTIVITY_LABEL[s]}</span>
                <span className="ml-auto font-mono">{vehicles.filter((v) => getVehicleActivityStatus(v.speedKmh, v.lastMessageAt) === s).length}</span>
              </div>
            ))}
          </div>

          {selected ? (
            <div className="bg-card rounded-xl border p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{selected.plateNumber}</p>
                <span className={`w-2.5 h-2.5 rounded-full ${ACTIVITY_DOT[getVehicleActivityStatus(selected.speedKmh, selected.lastMessageAt)]}`} />
              </div>
              <p className="text-xs text-muted-foreground">{selected.brand} {selected.model}</p>
              <div className="text-xs space-y-1.5 pt-2 border-t">
                <p className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-muted-foreground" /> {selected.driverName ?? 'Не назначен'}</p>
                {selected.activeTripNumber && (
                  <p className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-muted-foreground" /> Рейс {selected.activeTripNumber}</p>
                )}
                <p className="flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5 text-muted-foreground" /> {selected.mileageKm != null ? `${selected.mileageKm.toLocaleString('ru-RU')} км` : '—'} {selected.speedKmh != null ? `· ${selected.speedKmh} км/ч` : ''}</p>
                <p className="flex items-center gap-1.5"><Fuel className="w-3.5 h-3.5 text-muted-foreground" /> {selected.fuelLevelL != null ? `${selected.fuelLevelL} л` : '—'}</p>
                {getVehicleActivityStatus(selected.speedKmh, selected.lastMessageAt) === 'no_signal' && (
                  <p className="flex items-center gap-1.5 text-slate-500"><WifiOff className="w-3.5 h-3.5" /> {selected.lastMessageAt ? new Date(selected.lastMessageAt).toLocaleString('ru-RU') : 'Нет данных'}</p>
                )}
              </div>
              <Link href={`/vehicles/${selected.vehicleId}`} className="block text-center text-xs text-primary hover:underline pt-2 border-t">Карточка машины →</Link>
            </div>
          ) : (
            <div className="bg-card rounded-xl border p-4 text-xs text-muted-foreground text-center">
              Кликните машину на карте, чтобы увидеть детали
            </div>
          )}

          <div className="bg-card rounded-xl border overflow-hidden">
            <div className="divide-y max-h-64 overflow-y-auto">
              {vehicles.map((v) => (
                <button
                  key={v.vehicleId}
                  onClick={() => setSelectedId(v.vehicleId)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/30 transition flex items-center gap-2 ${selectedId === v.vehicleId ? 'bg-muted/40' : ''}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${ACTIVITY_DOT[getVehicleActivityStatus(v.speedKmh, v.lastMessageAt)]}`} />
                  <span className="font-medium">{v.plateNumber}</span>
                  <span className="text-muted-foreground truncate">{v.driverName ?? ''}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
