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
import { getOfficialTripReport, getFuelLevelAtDate } from '@/lib/wialon/client';

export interface TripFuelCalcResult {
  calculatedKm: number | null;
  calculatedFuelConsumedL: number | null;
  calculatedIdleMinutes: number | null;
  fuelCalcSource: 'wialon_official_report' | null;
  fuelCalcAt: Date;
  wialonFuelLevelBeginL: number | null;
  wialonFuelLevelEndL: number | null;
  wialonEngineHoursSec: number | null;
  wialonAvgFuelConsumptionPer100Km: number | null;
  wialonFillingsCount: number | null;
  wialonFilledL: number | null;
  wialonTheftsCount: number | null;
  wialonTheftedL: number | null;
  /** true — получены свежие данные от Wialon и записаны в БД; false — Wialon недоступен/не
   *  настроен, в БД ничего не менялось, поля result.* ниже — это то, что уже было сохранено
   *  раньше (см. аудит, п.4 — раньше сбой Wialon затирал ранее рассчитанные значения null'ами). */
  success: boolean;
  error: string | null;
}

export async function calculateVehicleTripTotals(vehicleTripId: string): Promise<TripFuelCalcResult> {
  const trip = await prisma.vehicleTrip.findUnique({
    where: { id: vehicleTripId },
    include: { vehicle: true },
  });
  if (!trip) {
    throw new Error(`VehicleTrip ${vehicleTripId} не найден`);
  }

  // Стартуем с уже сохранённых значений (а не null) — если Wialon окажется недоступен,
  // result вернётся ровно с тем, что было в БД, и update ниже просто не будет вызван.
  const result: TripFuelCalcResult = {
    calculatedKm: trip.calculatedKm,
    calculatedFuelConsumedL: trip.calculatedFuelConsumedL,
    calculatedIdleMinutes: trip.calculatedIdleMinutes,
    fuelCalcSource: trip.fuelCalcSource as TripFuelCalcResult['fuelCalcSource'],
    fuelCalcAt: trip.fuelCalcAt ?? new Date(),
    wialonFuelLevelBeginL: trip.wialonFuelLevelBeginL,
    wialonFuelLevelEndL: trip.wialonFuelLevelEndL,
    wialonEngineHoursSec: trip.wialonEngineHoursSec,
    wialonAvgFuelConsumptionPer100Km: trip.wialonAvgFuelConsumptionPer100Km,
    wialonFillingsCount: trip.wialonFillingsCount,
    wialonFilledL: trip.wialonFilledL,
    wialonTheftsCount: trip.wialonTheftsCount,
    wialonTheftedL: trip.wialonTheftedL,
    success: false,
    error: null,
  };

  if (trip.vehicle.wialonUnitId && trip.departureDate && trip.returnDate) {
    try {
      const report = await getOfficialTripReport(Number(trip.vehicle.wialonUnitId), trip.departureDate, trip.returnDate);
      if (report.noData) {
        // Wialon ответил успешно, но без единого сообщения за интервал (юнит был не на связи) —
        // это НЕ "нулевой расход", а "нет данных" (TMS-AUDIT-0021). Раньше это трактовалось как
        // успех и нули затирали ранее корректно рассчитанные calculatedKm/calculatedFuelConsumedL.
        // Обрабатываем как мягкий отказ — result остаётся при значениях, загруженных из БД выше
        // (success уже инициализирован false), update в конце функции не вызовется.
        result.error = 'Wialon не передал данных за этот период (юнит был не на связи) — сохранены ранее рассчитанные значения.';
        console.warn(`[calculateTripFuel] Wialon report has no data for trip ${vehicleTripId} interval — previous values kept.`);
      } else {
        result.calculatedKm = report.mileageAllKm;
        result.calculatedFuelConsumedL = report.fuelConsumedL;
        result.calculatedIdleMinutes = Math.round(report.idleSec / 60);
        result.fuelCalcSource = 'wialon_official_report';
        result.fuelCalcAt = report.calculatedAt;
        result.wialonFuelLevelBeginL = report.fuelLevelBeginL;
        result.wialonFuelLevelEndL = report.fuelLevelEndL;
        result.wialonEngineHoursSec = report.engineHoursSec;
        result.wialonAvgFuelConsumptionPer100Km = report.avgFuelConsumptionPer100Km;
        result.wialonFillingsCount = report.fillingsCount;
        result.wialonFilledL = report.filledL;
        result.wialonTheftsCount = report.theftsCount;
        result.wialonTheftedL = report.theftedL;
        result.success = true;
      }
    } catch (e: any) {
      result.error = e?.message ?? String(e);
      console.error(`[calculateTripFuel] Официальный отчёт Wialon не удался для рейса ${vehicleTripId} — ранее рассчитанные значения сохранены без изменений:`, e);
      // Намеренно без fallback на собственный расчёт — лучше явное "не рассчитано" в карточке,
      // чем цифра, которая не совпадает с Wialon (см. заголовочный комментарий). И намеренно
      // без записи null поверх result — на ошибке result остаётся тем, чем был проинициализирован
      // выше (текущие значения из БД), поэтому update ниже их не затрёт.
    }
  } else if (trip.vehicle.wialonUnitId && trip.departureDate && !trip.returnDate) {
    // Рейс ещё в работе (нет returnDate) — официальный отчёт Wialon по интервалу здесь
    // недоступен (нужна закрытая правая граница), но остаток топлива НА МОМЕНТ ВЫЕЗДА —
    // разовый снимок показания датчика на дату (getFuelLevelAtDate), от возврата не зависит.
    // Раньше при активном рейсе этот блок вообще не вызывался, поэтому "Топливо выезд"
    // оставалось пустым до самого закрытия рейса — здесь показываем то, что уже можно узнать.
    try {
      const fuel = await getFuelLevelAtDate(Number(trip.vehicle.wialonUnitId), trip.departureDate);
      result.wialonFuelLevelBeginL = fuel.fuelLevelL;
      result.success = true;
    } catch (e: any) {
      result.error = e?.message ?? String(e);
      console.error(`[calculateTripFuel] Остаток топлива на выезд (активный рейс ${vehicleTripId}) не удалось получить — предыдущее значение сохранено:`, e);
    }
  } else {
    result.error = 'У машины не указан Wialon ID или не заданы даты рейса';
  }

  // Пишем в БД только при реальном успехе — сбой/недоступность Wialon не должны стирать
  // ранее корректно рассчитанные calculatedKm/calculatedFuelConsumedL/wialon* (см. аудит, п.4).
  if (result.success) {
    await prisma.vehicleTrip.update({
      where: { id: vehicleTripId },
      data: {
        calculatedKm: result.calculatedKm,
        calculatedFuelConsumedL: result.calculatedFuelConsumedL,
        calculatedIdleMinutes: result.calculatedIdleMinutes,
        fuelCalcSource: result.fuelCalcSource,
        fuelCalcAt: result.fuelCalcAt,
        wialonFuelLevelBeginL: result.wialonFuelLevelBeginL,
        wialonFuelLevelEndL: result.wialonFuelLevelEndL,
        wialonEngineHoursSec: result.wialonEngineHoursSec,
        wialonAvgFuelConsumptionPer100Km: result.wialonAvgFuelConsumptionPer100Km,
        wialonFillingsCount: result.wialonFillingsCount,
        wialonFilledL: result.wialonFilledL,
        wialonTheftsCount: result.wialonTheftsCount,
        wialonTheftedL: result.wialonTheftedL,
      },
    });
  }

  return result;
}
