/**
 * Итоги рейса машины (пробег + расход топлива + простой) — общая логика для автоматического
 * пересчёта при сохранении активного рейса и для ручной кнопки "Пересчитать по Wialon".
 *
 * "Привести итоги рейса в TMS к полному совпадению с Wialon" — единственный источник теперь
 * getOfficialTripReport (lib/wialon/client.ts), который воспроизводит ТОЧНУЮ последовательность
 * запросов веб-интерфейса Wialon (exec_report -> get_report_status -> apply_report_result),
 * подтверждённую HAR-файлом реального сеанса и дважды сверенную вживую с реальными цифрами
 * отчёта (пробег, расход топлива, заправки/сливы, уровни — совпадение до долей). Прежняя
 * собственная логика (расчёт пробега по сырому GPS-треку, расход топлива как разница остатков
 * без учёта дозаправок) убрана целиком — она и была причиной расхождений с Wialon, никакого
 * fallback на неё больше нет: если официальный отчёт недоступен — показываем "не рассчитано",
 * а не приблизительную собственную цифру.
 */
import { prisma } from '@/lib/prisma';
import { getOfficialTripReport } from '@/lib/wialon/client';

export interface TripFuelCalcResult {
  calculatedKm: number | null;
  calculatedFuelConsumedL: number | null;
  calculatedIdleMinutes: number | null;
  fuelCalcSource: 'wialon_official_report' | null;
  fuelCalcAt: Date;
}

export async function calculateVehicleTripTotals(vehicleTripId: string): Promise<TripFuelCalcResult> {
  const trip = await prisma.vehicleTrip.findUnique({
    where: { id: vehicleTripId },
    include: { vehicle: true },
  });
  if (!trip) {
    throw new Error(`VehicleTrip ${vehicleTripId} не найден`);
  }

  const result: TripFuelCalcResult = {
    calculatedKm: null,
    calculatedFuelConsumedL: null,
    calculatedIdleMinutes: null,
    fuelCalcSource: null,
    fuelCalcAt: new Date(),
  };

  if (trip.vehicle.wialonUnitId && trip.departureDate && trip.returnDate) {
    try {
      const report = await getOfficialTripReport(Number(trip.vehicle.wialonUnitId), trip.departureDate, trip.returnDate);
      result.calculatedKm = report.mileageAllKm;
      result.calculatedFuelConsumedL = report.fuelConsumedL;
      result.calculatedIdleMinutes = Math.round(report.idleSec / 60);
      result.fuelCalcSource = 'wialon_official_report';
      result.fuelCalcAt = report.calculatedAt;
    } catch (e) {
      console.error('[calculateTripFuel] Официальный отчёт Wialon не удался:', e);
      // Намеренно без fallback на собственный расчёт — лучше явное "не рассчитано" в карточке,
      // чем цифра, которая не совпадает с Wialon (см. заголовочный комментарий).
    }
  }

  await prisma.vehicleTrip.update({
    where: { id: vehicleTripId },
    data: {
      calculatedKm: result.calculatedKm,
      calculatedFuelConsumedL: result.calculatedFuelConsumedL,
      calculatedIdleMinutes: result.calculatedIdleMinutes,
      fuelCalcSource: result.fuelCalcSource,
      fuelCalcAt: result.fuelCalcAt,
    },
  });

  return result;
}
