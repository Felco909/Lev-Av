export type TripPayloadValidation = { ok: true } | { ok: false; message: string };

function hasText(value: unknown): boolean {
  return String(value ?? '').trim().length > 0;
}

export function validateTripPayload(body: any, options?: { isCreate?: boolean }): TripPayloadValidation {
  if (!hasText(body?.clientId)) {
    return { ok: false, message: 'Укажите клиента.' };
  }
  if (!hasText(body?.routeFrom) || !hasText(body?.routeTo)) {
    return { ok: false, message: 'Укажите маршрут (откуда и куда).' };
  }
  if (!hasText(body?.tripDate)) {
    return { ok: false, message: 'Укажите дату заявки.' };
  }
  const tripDate = new Date(body.tripDate);
  if (Number.isNaN(tripDate.getTime())) {
    return { ok: false, message: 'Некорректная дата заявки.' };
  }

  const clientRate = Number(body?.clientRate ?? 0);
  if (!Number.isFinite(clientRate) || clientRate <= 0) {
    return { ok: false, message: 'Ставка клиента должна быть больше нуля.' };
  }

  const tripType = String(body?.tripType ?? 'own_transport');
  if (tripType === 'own_transport') {
    if (!hasText(body?.vehicleId)) {
      return { ok: false, message: 'Для собственного транспорта выберите машину.' };
    }
    if (!hasText(body?.driverId)) {
      return { ok: false, message: 'Для собственного транспорта выберите водителя.' };
    }
  }

  if (tripType === 'expedition' && body?.carrierRate != null) {
    const carrierRate = Number(body.carrierRate);
    if (!Number.isFinite(carrierRate) || carrierRate < 0) {
      return { ok: false, message: 'Ставка перевозчика не может быть отрицательной.' };
    }
  }

  if (options?.isCreate && !hasText(body?.tripNumber)) {
    // tripNumber генерируется на сервере — дополнительная проверка не нужна
  }

  return { ok: true };
}
