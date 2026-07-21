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
