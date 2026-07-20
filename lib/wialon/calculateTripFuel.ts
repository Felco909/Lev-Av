/**
 * Расчёт итогов рейса машины (пробег + расход топлива) — общая логика для
 * автоматического пересчёта при сохранении рейса и для ручной кнопки
 * "Пересчитать по Wialon" (можно вызывать сколько угодно раз, без ограничений
 * по времени — трекер может досылать буферизованные данные с задержкой,
 * например после транзита через зоны без покрытия).
 */
import { prisma } from '@/lib/prisma';
import { getUnitReport, getMileageFromTrack, getFuelConsumedBetweenDates } from '@/lib/wialon/client';

export interface TripFuelCalcResult {
  calculatedKm: number | null;
  calculatedFuelConsumedL: number | null;
  fuelCalcSource: 'wialon_report' | 'wialon_track' | 'odometer_diff' | null;
  fuelCalcAt: Date;
}

/**
 * Пытается получить расход топлива через сохранённый в Wialon шаблон отчёта
 * (report/exec_report) — учитывает дозаправки. Требует WIALON_FUEL_REPORT_RESOURCE_ID
 * и WIALON_FUEL_REPORT_TEMPLATE_ID в .env; если не заданы — не делает запрос вовсе.
 * На момент реализации такого шаблона в аккаунте нет — это задел на будущее.
 */
async function tryWialonFuelReport(
  wialonUnitId: string,
  from: Date,
  to: Date
): Promise<number | null> {
  const resourceId = process.env.WIALON_FUEL_REPORT_RESOURCE_ID;
  const templateId = process.env.WIALON_FUEL_REPORT_TEMPLATE_ID;
  if (!resourceId || !templateId) return null;

  try {
    const { login } = await import('@/lib/wialon/client');
    const { sid } = await login();
    const report: any = await getUnitReport(sid, Number(wialonUnitId), from, to, {
      resourceId: Number(resourceId),
      templateId: Number(templateId),
    });
    // Формат ответа зависит от конкретного шаблона — здесь заведомо нет проверенного
    // сопоставления полей (шаблон ещё не создан в аккаунте). Если появится реальный
    // отчёт, нужно будет здесь распарсить его табличные строки под нужную колонку.
    const consumed = report?.stats?.[0]?.fuel_consumed ?? report?.totals?.fuelConsumed ?? null;
    return typeof consumed === 'number' ? consumed : null;
  } catch (e) {
    console.error('[calculateTripFuel] Wialon fuel report failed, falling back:', e);
    return null;
  }
}

export async function calculateVehicleTripTotals(vehicleTripId: string): Promise<TripFuelCalcResult> {
  const trip = await prisma.vehicleTrip.findUnique({
    where: { id: vehicleTripId },
    include: { vehicle: true },
  });
  if (!trip) {
    throw new Error(`VehicleTrip ${vehicleTripId} не найден`);
  }

  const now = new Date();
  const result: TripFuelCalcResult = {
    calculatedKm: null,
    calculatedFuelConsumedL: null,
    fuelCalcSource: null,
    fuelCalcAt: now,
  };

  // Пробег — приоритет реальному GPS-треку (getMileageFromTrack, сумма гаверсинус-расстояний
  // между точками маршрута за интервал выезд-возврат) — не накапливает погрешность вручную
  // введённых/автозаполненных показаний одометра. Fallback — разница startMileage/endMileage,
  // если у машины нет wialonUnitId или по треку вообще не нашлось GPS-сообщений за рейс.
  if (trip.vehicle.wialonUnitId && trip.departureDate && trip.returnDate) {
    try {
      const track = await getMileageFromTrack(Number(trip.vehicle.wialonUnitId), trip.departureDate, trip.returnDate);
      if (track.messagesUsed > 0) {
        result.calculatedKm = track.mileageKm;
      }
    } catch (e) {
      console.error('[calculateTripFuel] getMileageFromTrack failed, falling back to odometer fields:', e);
    }
  }
  if (result.calculatedKm == null && trip.startMileage != null && trip.endMileage != null) {
    result.calculatedKm = trip.endMileage - trip.startMileage;
  }

  if (trip.vehicle.wialonUnitId && trip.departureDate && trip.returnDate) {
    const reportConsumed = await tryWialonFuelReport(trip.vehicle.wialonUnitId, trip.departureDate, trip.returnDate);
    if (reportConsumed != null) {
      result.calculatedFuelConsumedL = reportConsumed;
      result.fuelCalcSource = 'wialon_report';
    }
  }

  // Следующий по надёжности источник — реальные показания топливного датчика на даты
  // выезда/возврата (getFuelConsumedBetweenDates), НЕ значения, введённые в форму рейса.
  // Как и form-fallback ниже, не учитывает дозаправки в пути — см. lib/wialon/client.ts.
  if (result.fuelCalcSource === null && trip.vehicle.wialonUnitId && trip.departureDate && trip.returnDate) {
    try {
      const consumption = await getFuelConsumedBetweenDates(
        Number(trip.vehicle.wialonUnitId),
        trip.departureDate,
        trip.returnDate
      );
      if (consumption.fuelConsumedL != null && consumption.fuelConsumedL >= 0) {
        result.calculatedFuelConsumedL = consumption.fuelConsumedL;
        result.fuelCalcSource = 'wialon_track';
      }
    } catch (e) {
      console.error('[calculateTripFuel] getFuelConsumedBetweenDates failed, falling back:', e);
    }
  }

  if (result.fuelCalcSource === null && trip.startFuel != null && trip.endFuel != null) {
    const diff = Number(trip.startFuel) - Number(trip.endFuel);
    // Отрицательное значение обычно означает дозаправку в пути без учёта report'ом —
    // публиковать вводящее в заблуждение число не будем, оставляем null.
    if (diff >= 0) {
      result.calculatedFuelConsumedL = Math.round(diff * 10) / 10;
      result.fuelCalcSource = 'odometer_diff';
    }
  }

  await prisma.vehicleTrip.update({
    where: { id: vehicleTripId },
    data: {
      calculatedKm: result.calculatedKm,
      calculatedFuelConsumedL: result.calculatedFuelConsumedL,
      fuelCalcSource: result.fuelCalcSource,
      fuelCalcAt: result.fuelCalcAt,
    },
  });

  return result;
}
