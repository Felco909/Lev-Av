/**
 * Проверка "точка внутри геозоны" — собственная реализация (не Wialon Notifications, см. план
 * Этапа 7). Поддерживает круг (радиус в метрах вокруг точки) и полигон (ray casting).
 * Тип "линия" (t=1) для попадания не имеет смысла — игнорируется (возвращает false).
 */
import type { WialonZone, WialonZonePoint } from '@/lib/wialon/client';

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Расстояние между двумя GPS-точками по формуле гаверсинуса, метры. */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isPointInCircle(lat: number, lon: number, center: WialonZonePoint): boolean {
  if (typeof center.r !== 'number' || center.r <= 0) return false;
  return haversineMeters(lat, lon, center.y, center.x) <= center.r;
}

/** Ray casting — стандартный алгоритм "чётное/нечётное число пересечений луча с рёбрами". */
function isPointInPolygon(lat: number, lon: number, points: WialonZonePoint[]): boolean {
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isPointInZone(lat: number, lon: number, zone: WialonZone): boolean {
  if (zone.type === 3) {
    // Круг — центр обычно первая (единственная) точка с радиусом r.
    return zone.points.length > 0 && isPointInCircle(lat, lon, zone.points[0]);
  }
  if (zone.type === 2) {
    return isPointInPolygon(lat, lon, zone.points);
  }
  return false; // линия (t=1) — не поддерживаем "попадание"
}
