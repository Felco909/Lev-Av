/**
 * Ежедневная синхронизация пробега машин с Wialon — для Windows Task Scheduler
 * (по аналогии с scripts/pg-backup-daily.ps1 + Install-LevAv-DailyBackupTask.ps1).
 * Запуск: npx tsx --require dotenv/config scripts/wialon-sync-mileage.ts
 * Ничего не делает, если ни у одной машины не заполнен Vehicle.wialonUnitId.
 */
import { syncVehicleMileageFromWialon } from '../lib/wialon/syncMileage';
import { WialonApiError } from '../lib/wialon/client';

async function main() {
  console.log(`[wialon-sync] ${new Date().toISOString()} — старт синхронизации пробега`);
  try {
    const result = await syncVehicleMileageFromWialon();

    if (result.totalVehiclesWithWialonId === 0) {
      console.log('[wialon-sync] Ни у одной машины не заполнен wialonUnitId — синхронизировать нечего.');
      return;
    }

    console.log(
      `[wialon-sync] Машин с wialonUnitId: ${result.totalVehiclesWithWialonId}, обновлено: ${result.updated}, без изменений: ${result.unchanged}`
    );
    if (result.notFoundInWialon.length > 0) {
      console.warn('[wialon-sync] Не найдены в Wialon (проверьте wialonUnitId):');
      for (const v of result.notFoundInWialon) {
        console.warn(`  - ${v.plateNumber} (vehicleId=${v.vehicleId}, wialonUnitId=${v.wialonUnitId})`);
      }
    }
    if (result.errors.length > 0) {
      console.error('[wialon-sync] Ошибки по отдельным машинам:');
      for (const e of result.errors) {
        console.error(`  - ${e.plateNumber} (vehicleId=${e.vehicleId}): ${e.message}`);
      }
      process.exitCode = 1;
    }
  } catch (e) {
    if (e instanceof WialonApiError) {
      console.error(`[wialon-sync] Ошибка Wialon API: ${e.message}`);
    } else {
      console.error(`[wialon-sync] Не удалось выполнить синхронизацию: ${(e as Error).message}`);
    }
    process.exitCode = 1;
  }
}

main();
