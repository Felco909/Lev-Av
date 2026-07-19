/**
 * Тестовое подключение к Wialon Remote API — логин + список техники.
 * Запуск: npx tsx --require dotenv/config -r dotenv/config scripts/test-wialon.ts
 * (или через package.json script, см. README/CLAUDE.md).
 * Ничего не пишет в БД, TMS не трогает — только проверка связи с Wialon.
 */
import { login, getUnits, WialonApiError } from '../lib/wialon/client';

async function main() {
  console.log('[wialon] Логин через token_login...');
  let sid: string;
  try {
    const result = await login();
    sid = result.sid;
    console.log(`[wialon] OK, сессия создана. sid=${sid}`);
    if (result.raw?.au) console.log(`[wialon] Авторизован как: ${result.raw.au}`);
  } catch (e) {
    if (e instanceof WialonApiError) {
      console.error(`[wialon] Ошибка авторизации: ${e.message}`);
    } else {
      console.error(`[wialon] Не удалось авторизоваться: ${(e as Error).message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('[wialon] Запрашиваю список техники (core/search_items)...');
  try {
    const units = await getUnits(sid);
    if (units.length === 0) {
      console.log('[wialon] Список пуст — в аккаунте нет объектов avl_unit (или нет доступа к ним у этого токена).');
      return;
    }
    console.log(`[wialon] Найдено объектов: ${units.length}`);
    console.table(units.map((u) => ({ id: u.id, 'имя / гос.номер': u.name })));
  } catch (e) {
    if (e instanceof WialonApiError) {
      console.error(`[wialon] Ошибка получения списка техники: ${e.message}`);
    } else {
      console.error(`[wialon] Не удалось получить список техники: ${(e as Error).message}`);
    }
    process.exitCode = 1;
  }
}

main();
