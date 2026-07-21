/**
 * Расстояние между GPS-точками и проверка "в радиусе зоны" — используется для собственных
 * зон TMS (CompanyZone), не для Wialon-геозон (от них отказались — нет прав на запись в
 * Wialon, и по требованию не завязываться на геозоны Wialon вообще). Круг — единственная
 * форма зоны, которая нужна (широта/долгота/радиус), расширять на полигоны пока незачем.
 */
function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Расстояние между двумя GPS-точками по формуле гаверсинуса, метры. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinRadius(lat: number, lon: number, zoneLat: number, zoneLon: number, radiusMeters: number): boolean {
  if (radiusMeters <= 0) return false;
  return haversineMeters(lat, lon, zoneLat, zoneLon) <= radiusMeters;
}
