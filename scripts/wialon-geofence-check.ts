/**
 * Периодическая проверка геозон (Этап 7) — для Windows Task Scheduler, каждые 5 минут.
 * Запуск: npx tsx -r dotenv/config scripts/wialon-geofence-check.ts dotenv_config_path=.env.local
 * (WIALON_TOKEN лежит в .env.local — см. scripts/wialon-sync-mileage.ts)
 * Ничего не делает, если ни одна геозона не размечена ролью (WialonZoneRole пуст).
 */
import { runGeofenceCheck } from '../lib/wialon/geofenceCheck';
import { WialonApiError } from '../lib/wialon/client';

async function main() {
  console.log(`[geofence-check] ${new Date().toISOString()} — старт проверки геозон`);
  try {
    const result = await runGeofenceCheck();
    console.log(`[geofence-check] Проверено рейсов: ${result.checkedTrips}, переходов статуса: ${result.transitions.length}`);
    for (const t of result.transitions) {
      console.log(`  ${t.tripNumber}: ${t.from ?? '—'} -> ${t.to}${t.zoneName ? ` (${t.zoneName})` : ''}`);
    }
    if (result.errors.length > 0) {
      console.error('[geofence-check] Ошибки:', result.errors.join('; '));
      process.exitCode = 1;
    }
  } catch (e) {
    if (e instanceof WialonApiError) {
      console.error(`[geofence-check] Ошибка Wialon API: ${e.message}`);
    } else {
      console.error(`[geofence-check] Не удалось выполнить проверку: ${(e as Error).message}`);
    }
    process.exitCode = 1;
  }
}

main();
