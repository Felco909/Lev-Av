'use client';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getVehicleActivityStatus } from '@/lib/wialon/status';

export interface FleetMapVehicle {
  vehicleId: string; plateNumber: string; brand: string; model: string;
  driverName: string | null; lat: number | null; lon: number | null;
  speedKmh: number | null; lastMessageAt: string | null;
  mileageKm: number | null; fuelLevelL: number | null; activeTripNumber: string | null;
}

const ACTIVITY_COLOR: Record<string, string> = {
  moving: '#10b981', // emerald-500
  stopped: '#3b82f6', // blue-500
  no_signal: '#94a3b8', // slate-400
};

const DEFAULT_CENTER: [number, number] = [40.1792, 44.4991]; // Ереван

export default function FleetMap({ vehicles, onSelect }: { vehicles: FleetMapVehicle[]; onSelect: (id: string) => void }) {
  const withCoords = vehicles.filter((v) => v.lat != null && v.lon != null);
  const center: [number, number] = withCoords.length > 0 ? [withCoords[0].lat!, withCoords[0].lon!] : DEFAULT_CENTER;

  return (
    <MapContainer center={center} zoom={7} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {withCoords.map((v) => {
        const activity = getVehicleActivityStatus(v.speedKmh, v.lastMessageAt);
        return (
          <CircleMarker
            key={v.vehicleId}
            center={[v.lat!, v.lon!]}
            radius={9}
            pathOptions={{ color: '#fff', weight: 2, fillColor: ACTIVITY_COLOR[activity], fillOpacity: 1 }}
            eventHandlers={{ click: () => onSelect(v.vehicleId) }}
          >
            <Popup>
              <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                <b>{v.plateNumber}</b> {v.brand} {v.model}<br />
                {v.driverName && <>Водитель: {v.driverName}<br /></>}
                {v.activeTripNumber && <>Рейс: {v.activeTripNumber}<br /></>}
                Скорость: {v.speedKmh ?? '—'} км/ч<br />
                Пробег: {v.mileageKm != null ? v.mileageKm.toLocaleString('ru-RU') : '—'} км<br />
                Топливо: {v.fuelLevelL ?? '—'} л
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
