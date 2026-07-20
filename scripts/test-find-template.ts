/**
 * Тестовый поиск шаблона отчёта Wialon по имени — проверка findReportTemplate().
 * Запуск: npx tsx -r dotenv/config scripts/test-find-template.ts dotenv_config_path=.env.local
 * Ничего не пишет в БД, TMS не трогает — только запрос к Wialon и кэш-файл в config/.
 */
import { findReportTemplate, WialonApiError, REPORT_TEMPLATE_CACHE_PATH } from '../lib/wialon/client';

const TEMPLATE_NAME = 'LevAV Пробег и топливо';

async function main() {
  console.log(`[wialon] Ищу шаблон отчёта "${TEMPLATE_NAME}"...`);
  try {
    const ref = await findReportTemplate(TEMPLATE_NAME);
    console.log('[wialon] Найден:');
    console.log(`  resourceId = ${ref.resourceId}`);
    console.log(`  templateId = ${ref.templateId}`);
    console.log(`  name       = ${ref.name}`);
    console.log(`[wialon] Кэш-файл: ${REPORT_TEMPLATE_CACHE_PATH}`);
  } catch (e) {
    if (e instanceof WialonApiError) {
      console.error(`[wialon] Ошибка Wialon API: ${e.message}`);
    } else {
      console.error(`[wialon] Не удалось найти шаблон: ${(e as Error).message}`);
    }
    process.exitCode = 1;
  }
}

main();
