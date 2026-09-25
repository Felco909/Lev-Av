/**
 * Периодическая проверка присутствия машин на базе компании — для Windows Task Scheduler,
 * каждые 5 минут. Замена scripts/wialon-geofence-check.ts (Wialon-геозоны, Этап 7 пересмотрен).
 * Тем же запуском обновляется трекинг простоя машин (lib/wialon/dwellCheck.ts).
 * Запуск: npx tsx -r dotenv/config scripts/company-base-check.ts dotenv_config_path=.env.local
 */
import { runCompanyBaseCheck } from '../lib/company-base/baseCheck';
import { runDwellCheck } from '../lib/wialon/dwellCheck';

async function main() {
  console.log(`[company-base-check] ${new Date().toISOString()} — старт проверки базы компании`);
  try {
    const result = await runCompanyBaseCheck();
    console.log(`[company-base-check] Проверено машин: ${result.checkedVehicles}, изменений присутствия: ${result.vehiclePresenceChanges.length}, переходов рейса: ${result.tripTransitions.length}`);
    for (const c of result.vehiclePresenceChanges) {
      console.log(`  ${c.plateNumber}: ${c.from} -> ${c.to}`);
    }
    for (const t of result.tripTransitions) {
      console.log(`  ${t.tripNumber}: ${t.type}`);
    }
    if (result.errors.length > 0) {
      console.error('[company-base-check] Ошибки:', result.errors.join('; '));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(`[company-base-check] Не удалось выполнить проверку: ${(e as Error).message}`);
    process.exitCode = 1;
  }

  // Трекинг простоя (dwell) — отдельный шаг после проверки базы: пишет только
  // Vehicle.lastMovingAt/lastGpsMessageAt, его сбой не влияет на проверку базы выше.
  try {
    const dwell = await runDwellCheck();
    console.log(`[company-base-check] Простой: проверено машин ${dwell.checkedVehicles}, обновлено ${dwell.updatedVehicles}`);
    if (dwell.errors.length > 0) {
      console.error('[company-base-check] Ошибки трекинга простоя:', dwell.errors.join('; '));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(`[company-base-check] Не удалось выполнить трекинг простоя: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

main();
