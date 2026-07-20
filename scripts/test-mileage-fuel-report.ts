/**
 * Тест inline-отчёта по пробегу и топливу (без сохранённого шаблона в Wialon) —
 * getMileageAndFuelReport().
 * Запуск: npx tsx -r dotenv/config scripts/test-mileage-fuel-report.ts dotenv_config_path=.env.local
 * Ничего не пишет в БД, TMS не трогает — только запрос к Wialon.
 */
import { getMileageAndFuelReport } from '../lib/wialon/client';

// 37EH031 (unit 26673716) — та же машина, что использовалась в предыдущих живых тестах.
const UNIT_ID = 26673716;
const UNIT_LABEL = '37EH031';

async function main() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  console.log(`[wialon] Запрашиваю отчёт по машине ${UNIT_LABEL} (unit ${UNIT_ID}) за сегодня...`);
  console.log(`[wialon] Интервал: ${todayStart.toISOString()} — ${now.toISOString()}`);

  try {
    const report = await getMileageAndFuelReport(UNIT_ID, todayStart, now);
    console.log('\n[wialon] Результат:');
    console.log(`  Пробег:  ${report.mileageKm} км`);
    console.log(`  Топливо (заправки за период): ${report.fuelConsumedL} л`);
    if (report.raw?.noData) {
      console.log(`  (нет данных за период, причина: ${report.raw.reason})`);
    }
    console.log('\n[wialon] raw (для отладки):');
    console.log(JSON.stringify(report.raw, null, 2).slice(0, 3000));
  } catch (e) {
    console.error('[wialon] Ошибка:', (e as Error).message);
    process.exitCode = 1;
  }
}

main();
