import { prisma } from '@/lib/prisma';
import { calculateVehicleTripTotals } from '@/lib/wialon/calculateTripFuel';

/**
 * Автоматический расчёт итогов рейса при сохранении с обеими датами заполненными.
 * Обёрнуто в try/catch намеренно — сбой Wialon не должен блокировать сохранение
 * самого рейса (ручной ввод продолжает работать как раньше). Дальше данные можно
 * пересчитать вручную кнопкой "Пересчитать по Wialon".
 *
 * Вынесено из app/api/vehicle-trips/route.ts, чтобы тот же код переиспользовал
 * фоновый сервис lib/company-base/baseCheck.ts при автозакрытии рейса по GPS-возврату
 * на базу — не дублировать эту логику в двух местах.
 */
export async function maybeCalculateTotals(tripId: string, departureDate: Date | null, returnDate: Date | null) {
  if (!departureDate || !returnDate) return;
  try {
    await calculateVehicleTripTotals(tripId);
  } catch (e) {
    console.error('[vehicle-trips] авторасчёт итогов рейса не удался:', e);
  }
}

/**
 * Обновляет Vehicle.currentMileage из пробега рейса на возврате — тот же паттерн "выше
 * текущего — обновляем", что уже используется в app/api/fuel-records/route.ts и
 * app/api/service-records/route.ts. Нужен, чтобы модуль ТО (calculateMaintenanceStatus)
 * видел актуальный пробег сразу при закрытии рейса, а не только на следующей ежедневной
 * синхронизации с Wialon (06:00, lib/wialon/syncMileage.ts).
 */
export async function maybeSyncVehicleMileage(vehicleId: string, endMileage: number | null) {
  if (endMileage == null) return;
  try {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { currentMileage: true } });
    if (!vehicle?.currentMileage || endMileage > vehicle.currentMileage) {
      await prisma.vehicle.update({ where: { id: vehicleId }, data: { currentMileage: endMileage } });
    }
  } catch (e) {
    console.error('[vehicle-trips] обновление пробега машины (ТО) не удалось:', e);
  }
}

const MIN_ODOMETER_KM = 0;
const MAX_ODOMETER_KM = 3_000_000; // с запасом выше любого реального пробега грузовика за весь срок службы
const ODOMETER_DRIFT_TOLERANCE_KM = 100_000; // насколько введённое значение может отличаться от Vehicle.currentMileage, не считаясь опечаткой

/**
 * Sanity-проверка одометра при ручном вводе (POST/PUT /api/vehicle-trips) — раньше её не было
 * вообще, из-за чего опечатка (лишняя цифра) спокойно уходила в БД и молча портила "Пробег"
 * в карточке рейса. Проверяем: диапазон 0..MAX_ODOMETER_KM, конец >= начала, и отклонение от
 * известного Vehicle.currentMileage не более ODOMETER_DRIFT_TOLERANCE_KM (машина могла давно
 * не синхронизироваться — берём щедрый запас, а не точное совпадение).
 */
export async function validateOdometerValues(
  vehicleId: string,
  startMileage: number | null,
  endMileage: number | null
): Promise<string | null> {
  const fields: Array<[string, number | null]> = [
    ['Пробег на начало', startMileage],
    ['Пробег на конец', endMileage],
  ];
  for (const [label, v] of fields) {
    if (v == null) continue;
    if (!Number.isFinite(v) || v < MIN_ODOMETER_KM || v > MAX_ODOMETER_KM) {
      return `${label}: ${v} км — нереалистичное значение одометра`;
    }
  }
  if (startMileage != null && endMileage != null && endMileage < startMileage) {
    return `Пробег на конец (${endMileage} км) меньше пробега на начало (${startMileage} км)`;
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { currentMileage: true } });
  if (vehicle?.currentMileage) {
    for (const [label, v] of fields) {
      if (v != null && Math.abs(v - vehicle.currentMileage) > ODOMETER_DRIFT_TOLERANCE_KM) {
        return `${label}: ${v} км сильно отличается от известного пробега машины (${vehicle.currentMileage} км) — проверьте значение`;
      }
    }
  }
  return null;
}

function fmtDateRu(d: Date): string {
  return d.toLocaleDateString('ru-RU');
}

/**
 * Проверка на пересечение периодов рейсов ОДНОЙ машины при создании/редактировании рейса —
 * без неё два рейса одной машины могут получить перекрывающиеся [departureDate, returnDate],
 * и заявки, попадающие в пересечение, задваиваются в расчёте дохода (см. разбор по 521DF61 —
 * там ошибка уже была в данных, эта проверка не пускает её повториться при вводе новых рейсов).
 * Рейс без returnDate считается открытым до бесконечности ТОЛЬКО если он реально активен
 * (status='active'). Архивный/завершённый рейс без returnDate (старые записи до внедрения
 * обязательного закрытия) НЕ проверяем на пересечение вообще — у него нет надёжной верхней
 * границы, и если считать его "открытым навсегда", он будет блокировать создание/закрытие
 * вообще любых последующих рейсов этой машины. Тот же принцип, что и в resolveMatchRangeEnd
 * (lib/vehicle-trips/revenue.ts) для расчёта дохода — там такой рейс тоже не считается
 * открытым до сегодня, а ограничивается датой выезда следующего рейса.
 */
export async function validateNoOverlappingVehicleTripDates(
  vehicleId: string,
  departureDate: Date,
  returnDate: Date | null,
  excludeId?: string,
  status?: string
): Promise<string | null> {
  const FAR_FUTURE = new Date(8640000000000000);
  let newEnd: Date;
  if (returnDate) {
    newEnd = returnDate;
  } else if (status === undefined || status === 'active') {
    // status не передан (POST — новый рейс всегда 'active' без returnDate или 'completed' с
    // returnDate, см. вызывающий код) либо реально активен — считаем открытым до сегодня/будущего.
    newEnd = FAR_FUTURE;
  } else {
    // Тот же самый рейс, что и "other" ниже: архивный/завершённый без returnDate — нет
    // надёжной границы, пропускаем проверку целиком для этого сохранения.
    return null;
  }

  const others = await prisma.vehicleTrip.findMany({
    where: { vehicleId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, tripNumber: true, status: true, departureDate: true, returnDate: true },
  });

  for (const other of others) {
    let otherEnd: Date;
    if (other.returnDate) {
      otherEnd = other.returnDate;
    } else if (other.status === 'active') {
      otherEnd = FAR_FUTURE;
    } else {
      continue; // архивный/завершённый рейс без returnDate — не проверяем, см. комментарий выше
    }
    const overlaps = other.departureDate.getTime() <= newEnd.getTime() && otherEnd.getTime() >= departureDate.getTime();
    if (overlaps) {
      const otherRange = `${fmtDateRu(other.departureDate)} → ${other.returnDate ? fmtDateRu(other.returnDate) : 'ещё в пути'}`;
      return `Даты пересекаются с рейсом №${other.tripNumber} (${otherRange}) той же машины — исправьте даты выезда/возврата`;
    }
  }
  return null;
}

/**
 * Номер рейса вводится вручную (см. `tripNumber` в POST/PUT /api/vehicle-trips) и обычно
 * означает "рейс №N этой машины", а не глобальный номер — уникальность в рамках vehicleId
 * не проверялась, из-за чего у одной машины могло появиться два разных рейса с одним и тем
 * же номером (найдено на 796DE61 — архивный и активный рейс оба "№2").
 */
export async function validateUniqueTripNumberForVehicle(
  vehicleId: string,
  tripNumber: string,
  excludeId?: string
): Promise<string | null> {
  const trimmed = tripNumber.trim();
  if (!trimmed) return null;
  const dup = await prisma.vehicleTrip.findFirst({
    where: { vehicleId, tripNumber: trimmed, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, status: true, departureDate: true },
  });
  if (dup) {
    return `У этой машины уже есть рейс №${trimmed} (${fmtDateRu(dup.departureDate)}, статус: ${dup.status}) — выберите другой номер`;
  }
  return null;
}

interface VehicleTripExpenseFields {
  salaryAmd: unknown;
  perDiemAmd: unknown;
  perDiem2Amd: unknown;
  perDiem3Amd: unknown;
  perDiem4Amd: unknown;
  otherExpensesAmd: unknown;
  fuelCostAmd: unknown;
  fleetExpenses: Array<{ amountAmd: unknown }>;
}

/**
 * Прямые расходы рейса (зарплата + суточные×4 + прочее + топливо) + FleetExpense —
 * та же формула, что уже была продублирована в GET /api/vehicle-trips/[id],
 * /api/vehicles/[id]/economics и /api/vehicle-analytics (см. CLAUDE.md — эти места
 * не путать с формулой прибыли по заявке в lib/finance/formulas.ts, это другой модуль).
 * Вынесено сюда, чтобы закрытие рейса (POST .../close) считало точно так же, не заново.
 */
export function computeVehicleTripExpensesAmd(vt: VehicleTripExpenseFields): number {
  const directSalaryAmd = Number(vt.salaryAmd) || 0;
  const directPerDiemAmd = (Number(vt.perDiemAmd) || 0) + (Number(vt.perDiem2Amd) || 0) + (Number(vt.perDiem3Amd) || 0) + (Number(vt.perDiem4Amd) || 0);
  const directOtherAmd = Number(vt.otherExpensesAmd) || 0;
  const directFuelAmd = Number(vt.fuelCostAmd) || 0;
  const fleetExpTotal = vt.fleetExpenses.reduce((s, e) => s + (Number(e.amountAmd) || 0), 0);
  return directSalaryAmd + directPerDiemAmd + directOtherAmd + directFuelAmd + fleetExpTotal;
}
