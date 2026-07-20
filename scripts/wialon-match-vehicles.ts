/**
 * Сопоставляет Vehicle.plateNumber с именем объекта в Wialon (unit.nm) и заполняет
 * Vehicle.wialonUnitId. Без этого lib/wialon/syncMileage.ts ничего не обновляет.
 * Безопасно перезапускать: машины с уже заполненным wialonUnitId пропускаются.
 * Логика — в lib/wialon/matchVehicles.ts (используется также из /api/wialon/sync-vehicles).
 * Запуск: npx tsx -r dotenv/config scripts/wialon-match-vehicles.ts dotenv_config_path=.env.local
 */
import { prisma } from '../lib/prisma';
import { matchVehiclesWithWialon } from '../lib/wialon/matchVehicles';

async function main() {
  console.log('[wialon-match] Логин и получение списка техники Wialon...');
  const result = await matchVehiclesWithWialon();

  for (const m of result.matched) {
    console.log(`  ${m.plateNumber} -> Wialon unit id=${m.wialonUnitId} (${m.wialonName})`);
  }

  console.log(
    `[wialon-match] Итого: сопоставлено ${result.matched.length}, уже было заполнено ${result.alreadyLinked.length}, не найдено в Wialon ${result.notFoundInWialon.length}`
  );
  if (result.notFoundInWialon.length > 0) {
    console.warn(
      '[wialon-match] Не найдены в Wialon (проверьте написание гос.номера в обеих системах):',
      result.notFoundInWialon.map((v) => v.plateNumber).join(', ')
    );
  }
}

main()
  .catch((e) => {
    console.error('[wialon-match] Ошибка:', e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
