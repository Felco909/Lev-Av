type VehicleLike = { brand?: string | null; plateNumber?: string | null; model?: string | null } | null | undefined;

type TripTransportSource = {
  docTransportText?: string | null;
  vehicle?: VehicleLike;
};

export type DocTransportOverrides = {
  transportText?: string | null;
  vehicleInfo?: string | null;
  trailerInfo?: string | null;
};

function trimOrEmpty(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

/** Текст по умолчанию из привязанной к заявке машины. */
export function buildDefaultDocTransportText(trip: TripTransportSource): string {
  const vehicle = trip.vehicle;
  if (!vehicle) return '';
  const brand = trimOrEmpty(vehicle.brand);
  const plate = trimOrEmpty(vehicle.plateNumber);
  if (brand && plate) return `${brand} гос.номер ${plate}`;
  return brand || plate;
}

/** Объединяет тягач и полуприцеп в одну строку для PDF. */
export function combineDocTransportParts(
  tractor?: string | null,
  trailer?: string | null,
): string {
  const left = trimOrEmpty(tractor);
  const right = trimOrEmpty(trailer);
  if (left && right) return `${left} / ${right}`;
  return left || right;
}

/** Итоговая строка «Транспорт» для счёта/акта. */
export function resolveDocTransportForPdf(
  overrides: DocTransportOverrides | undefined | null,
  trip: TripTransportSource,
): string {
  const direct = trimOrEmpty(overrides?.transportText);
  if (direct) return direct;

  const legacy = combineDocTransportParts(overrides?.vehicleInfo, overrides?.trailerInfo);
  if (legacy) return legacy;

  const saved = trimOrEmpty(trip.docTransportText);
  if (saved) return saved;

  return buildDefaultDocTransportText(trip);
}
