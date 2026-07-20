/**
 * Тест остатка/расхода топлива по конкретным датам (getFuelLevelAtDate, getFuelConsumedBetweenDates)
 * — обход report/exec_report, см. lib/wialon/client.ts.
 * Запуск: npx tsx -r dotenv/config scripts/test-fuel-at-date.ts dotenv_config_path=.env.local
 * Ничего не пишет в БД, TMS не трогает — только запрос к Wialon.
 */
import { getFuelLevelAtDate, getFuelConsumedBetweenDates } from '../lib/wialon/client';

// 055vv20 (unit 27289125) — та же машина, что и в тесте пробега по треку.
const UNIT_ID = 27289125;
const UNIT_LABEL = '055vv20';

async function main() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

  console.log(`[wialon] Остаток топлива ${UNIT_LABEL} в разные моменты:`);
  for (const [label, date] of [['сейчас', now], ['неделю назад', weekAgo], ['месяц назад', monthAgo]] as const) {
    try {
      const r = await getFuelLevelAtDate(UNIT_ID, date);
      console.log(`  ${label} (${date.toISOString()}): ${r.fuelLevelL ?? '—'} л` +
        (r.measuredAt ? `, измерено ${r.measuredAt.toISOString()}` : '') +
        (r.raw?.reason ? ` (${r.raw.reason})` : ''));
    } catch (e) {
      console.error(`  ${label}: ОШИБКА —`, (e as Error).message);
    }
  }

  console.log(`\n[wialon] Расход топлива ${UNIT_LABEL} за последнюю неделю (разница остатков):`);
  try {
    const c = await getFuelConsumedBetweenDates(UNIT_ID, weekAgo, now);
    console.log(`  Начало: ${c.startFuelL ?? '—'} л, конец: ${c.endFuelL ?? '—'} л, расход: ${c.fuelConsumedL ?? '—'} л`);
  } catch (e) {
    console.error('  ОШИБКА:', (e as Error).message);
  }
}

main();
