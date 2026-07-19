/**
 * Сопоставляет Vehicle.plateNumber с именем объекта в Wialon (unit.nm) и заполняет
 * Vehicle.wialonUnitId. Без этого lib/wialon/syncMileage.ts ничего не обновляет —
 * см. Шаг 5. Безопасно перезапускать: машины с уже заполненным wialonUnitId пропускаются.
 * Запуск: npx tsx --require dotenv/config scripts/wialon-match-vehicles.ts
 */
import { prisma } from '../lib/prisma';
import { login, getUnits } from '../lib/wialon/client';

function normalizePlate(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, '');
}

async function main() {
  console.log('[wialon-match] Логин и получение списка техники Wialon...');
  const { sid } = await login();
  const units = await getUnits(sid);
  const unitByPlate = new Map(units.map((u) => [normalizePlate(u.name), u]));

  const vehicles = await prisma.vehicle.findMany({
    select: { id: true, plateNumber: true, wialonUnitId: true },
  });

  let matched = 0;
  let alreadySet = 0;
  const notFound: string[] = [];

  for (const v of vehicles) {
    if (v.wialonUnitId) {
      alreadySet++;
      continue;
    }
    const unit = unitByPlate.get(normalizePlate(v.plateNumber));
    if (!unit) {
      notFound.push(v.plateNumber);
      continue;
    }
    await prisma.vehicle.update({ where: { id: v.id }, data: { wialonUnitId: String(unit.id) } });
    matched++;
    console.log(`  ${v.plateNumber} -> Wialon unit id=${unit.id} (${unit.name})`);
  }

  console.log(
    `[wialon-match] Итого: сопоставлено ${matched}, уже было заполнено ${alreadySet}, не найдено в Wialon ${notFound.length}`
  );
  if (notFound.length > 0) {
    console.warn('[wialon-match] Не найдены в Wialon (проверьте написание гос.номера в обеих системах):', notFound.join(', '));
  }
}

main()
  .catch((e) => {
    console.error('[wialon-match] Ошибка:', e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
