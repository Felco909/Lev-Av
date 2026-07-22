'use client';
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getVehicleActivityStatus, type VehicleActivityStatus } from '@/lib/wialon/status';

export interface FleetMapVehicle {
  vehicleId: string; plateNumber: string; brand: string; model: string;
  driverName: string | null; lat: number | null; lon: number | null;
  speedKmh: number | null; headingDeg: number | null; lastMessageAt: string | null;
  mileageKm: number | null; fuelLevelL: number | null; activeTripNumber: string | null;
}

const ACTIVITY_COLOR: Record<VehicleActivityStatus, string> = {
  moving: '#10b981', // emerald-500
  stopped: '#3b82f6', // blue-500
  no_signal: '#94a3b8', // slate-400
};

const ACTIVITY_LABEL: Record<VehicleActivityStatus, string> = {
  moving: 'Движется',
  stopped: 'Стоит',
  no_signal: 'Нет связи',
};

const DEFAULT_CENTER: [number, number] = [40.1792, 44.4991]; // Ереван

/**
 * Иконка машины — вид сверху (кабина + кузов), а не боковой силуэт: боковой грузовик при
 * повороте на произвольный курс выглядит "сломанным", вид сверху поворачивается естественно
 * на 360°. Векторный SVG внутри L.divIcon — масштабируется без потери качества на любом зуме.
 */
function buildTruckIcon(status: VehicleActivityStatus, headingDeg: number | null): L.DivIcon {
  const color = ACTIVITY_COLOR[status];
  const rotation = headingDeg ?? 0;
  const pulse = status === 'moving' ? '<span class="fleet-marker__pulse"></span>' : '';
  const opacity = status === 'no_signal' ? '0.6' : '1';
  const html = `
    <div class="fleet-marker" style="opacity:${opacity};color:${color}">
      ${pulse}
      <div class="fleet-marker__badge" style="background:${color};transform:rotate(${rotation}deg)">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <rect x="8" y="10.5" width="8" height="10.5" rx="1.4" fill="#fff" />
          <rect x="6.3" y="2" width="11.4" height="9.2" rx="2.3" fill="#fff" />
          <rect x="8.5" y="3.6" width="7" height="3.6" rx="1" fill="${color}" fill-opacity="0.55" />
        </svg>
      </div>
    </div>`;
  return L.divIcon({
    html,
    className: 'fleet-marker-wrapper',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

/**
 * Один раз при первой загрузке данных вписываем карту по всем машинам сразу (как в Wialon) —
 * дальше не трогаем зум/панораму, чтобы не сбивать пользователя при периодическом обновлении.
 */
function FitFleetBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || points.length === 0) return;
    fitted.current = true;
    if (points.length === 1) {
      map.setView(points[0], 11);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 12 });
    }
  }, [map, points]);
  return null;
}

export default function FleetMap({ vehicles, onSelect }: { vehicles: FleetMapVehicle[]; onSelect: (id: string) => void }) {
  const withCoords = vehicles.filter((v) => v.lat != null && v.lon != null);
  const center: [number, number] = withCoords.length > 0 ? [withCoords[0].lat!, withCoords[0].lon!] : DEFAULT_CENTER;
  const points = useMemo<Array<[number, number]>>(() => withCoords.map((v) => [v.lat!, v.lon!]), [withCoords]);

  // Иконки зависят только от status+heading — пересоздавать на каждый рендер незачем.
  const icons = useMemo(() => {
    const map = new Map<string, L.DivIcon>();
    for (const v of withCoords) {
      const status = getVehicleActivityStatus(v.speedKmh, v.lastMessageAt);
      map.set(v.vehicleId, buildTruckIcon(status, v.headingDeg));
    }
    return map;
  }, [withCoords]);

  return (
    <>
      <style>{`
        .fleet-marker-wrapper { background: transparent !important; border: none !important; }
        .fleet-marker {
          position: relative; width: 34px; height: 34px;
          display: flex; align-items: center; justify-content: center;
        }
        .fleet-marker__badge {
          width: 30px; height: 30px; border-radius: 50%;
          border: 2.5px solid #fff;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.4);
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.5s ease;
        }
        .fleet-marker__pulse {
          position: absolute; inset: 4px; border-radius: 50%;
          background: currentColor; opacity: 0.35;
          animation: fleet-pulse 1.8s ease-out infinite;
        }
        @keyframes fleet-pulse {
          0% { transform: scale(0.6); opacity: 0.45; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        .fleet-popup .leaflet-popup-content-wrapper { border-radius: 12px; padding: 0; overflow: hidden; }
        .fleet-popup .leaflet-popup-content { margin: 0; width: 240px !important; }
        .fleet-popup .leaflet-popup-tip { background: #fff; }
      `}</style>
      <MapContainer center={center} zoom={7} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <FitFleetBounds points={points} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {withCoords.map((v) => {
          const status = getVehicleActivityStatus(v.speedKmh, v.lastMessageAt);
          const icon = icons.get(v.vehicleId);
          if (!icon) return null;
          return (
            <Marker
              key={v.vehicleId}
              position={[v.lat!, v.lon!]}
              icon={icon}
              eventHandlers={{ click: () => onSelect(v.vehicleId) }}
            >
              <Popup className="fleet-popup">
                <div className="text-xs">
                  <div className="flex items-center justify-between px-3 py-2 text-white" style={{ background: ACTIVITY_COLOR[status] }}>
                    <span className="font-semibold text-sm">{v.plateNumber}</span>
                    <span className="text-[10px] uppercase tracking-wide opacity-90">{ACTIVITY_LABEL[status]}</span>
                  </div>
                  <div className="px-3 py-2.5 space-y-1.5 bg-white">
                    <p className="text-muted-foreground">{v.brand} {v.model}</p>
                    <div className="pt-1.5 border-t space-y-1">
                      <p>{'Водитель: '}<span className="font-medium">{v.driverName ?? '—'}</span></p>
                      {v.activeTripNumber && <p>{'Рейс: '}<span className="font-medium">{v.activeTripNumber}</span></p>}
                      <p>{'Скорость: '}<span className="font-mono">{v.speedKmh ?? '—'} км/ч</span></p>
                      <p>{'Топливо: '}<span className="font-mono">{v.fuelLevelL != null ? `${v.fuelLevelL} л` : '—'}</span></p>
                      <p>{'Последнее сообщение: '}<span className="font-mono">{v.lastMessageAt ? new Date(v.lastMessageAt).toLocaleString('ru-RU') : '—'}</span></p>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </>
  );
}
