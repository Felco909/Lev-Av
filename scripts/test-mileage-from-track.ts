/**
 * Тест пробега по сырому GPS-треку (getMileageFromTrack) — обход report/exec_report,
 * который на этом аккаунте стабильно возвращал пустой результат (см. lib/wialon/client.ts).
 * Запуск: npx tsx -r dotenv/config scripts/test-mileage-from-track.ts dotenv_config_path=.env.local
 * Ничего не пишет в БД, TMS не трогает — только запрос к Wialon.
 */
import { getMileageFromTrack } from '../lib/wialon/client';

// 055vv20 (unit 27289125) — уже подтверждено вживую, что шлёт реальные GPS-сообщения.
const UNIT_ID = 27289125;
const UNIT_LABEL = '055vv20';

async function main() {
  const to = new Date();
  const from3d = new Date(to.getTime() - 3 * 24 * 3600 * 1000);
  const from30d = new Date(to.getTime() - 30 * 24 * 3600 * 1000);

  for (const [label, from] of [['последние 3 дня', from3d], ['последние 30 дней', from30d]] as const) {
    console.log(`\n[wialon] ${UNIT_LABEL} — ${label} (${from.toISOString()} — ${to.toISOString()})`);
    try {
      const result = await getMileageFromTrack(UNIT_ID, from, to);
      console.log(`  Пробег: ${result.mileageKm} км`);
      console.log(`  Сообщений с GPS-позицией использовано: ${result.messagesUsed}`);
      if (result.raw?.noData) console.log(`  (нет данных, причина: ${result.raw.reason})`);
    } catch (e) {
      console.error('  Ошибка:', (e as Error).message);
      process.exitCode = 1;
    }
  }
}

main();
