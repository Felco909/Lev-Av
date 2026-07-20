/**
 * Тест: попытка создать шаблон отчёта в Wialon через API (report/update_report), в обход
 * веб-интерфейса — на случай, если у аккаунта нет прав на кнопку "Создать" в вебе.
 * Запуск: npx tsx -r dotenv/config scripts/test-create-template.ts dotenv_config_path=.env.local
 * Ничего не пишет в БД, TMS не трогает. Если Wialon вернёт code 7 (Access denied) —
 * это ОЖИДАЕМЫЙ результат при отсутствии прав, не баг, чинить код в ответ на него не нужно.
 */
import { login, findReportTemplate, createReportTemplate, WialonApiError, REPORT_TEMPLATE_CACHE_PATH } from '../lib/wialon/client';

const TEMPLATE_NAME = 'LevAV Пробег и топливо';
const RESOURCE_NAME_HINT = 'levav';

async function callWialon(svc: string, params: any, sid: string) {
  const url = process.env.WIALON_API_URL!;
  const body = new URLSearchParams();
  body.set('svc', svc);
  body.set('params', JSON.stringify(params));
  body.set('sid', sid);
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  return res.json();
}

async function findResourceIdByName(sid: string, nameHint: string): Promise<{ id: number; name: string } | null> {
  const data = await callWialon(
    'core/search_items',
    {
      spec: { itemsType: 'avl_resource', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
      force: 1,
      flags: 1,
      flagsMask: 0,
      from: 0,
      to: 0,
    },
    sid
  );
  const items: Array<{ id: number; nm: string }> = data?.items ?? [];
  console.log(`[wialon] Ресурсов в аккаунте: ${items.length} (${items.map((i) => i.nm).join(', ')})`);
  const match = items.find((i) => i.nm.toLowerCase().includes(nameHint));
  return match ? { id: match.id, name: match.nm } : null;
}

async function main() {
  console.log('[wialon] Логин...');
  const { sid } = await login();

  console.log(`[wialon] Ищу ресурс аккаунта, содержащий "${RESOURCE_NAME_HINT}" в имени...`);
  const resource = await findResourceIdByName(sid, RESOURCE_NAME_HINT);
  if (!resource) {
    console.error(`[wialon] Ресурс с именем, содержащим "${RESOURCE_NAME_HINT}", не найден — прерываю.`);
    process.exitCode = 1;
    return;
  }
  console.log(`[wialon] Ресурс найден: id=${resource.id}, name="${resource.name}"`);

  console.log(`[wialon] Пытаюсь создать шаблон "${TEMPLATE_NAME}" через report/update_report...`);
  try {
    const created = await createReportTemplate(resource.id, TEMPLATE_NAME);
    console.log('[wialon] УСПЕХ — шаблон создан:');
    console.log(`  id   = ${created.id}`);
    console.log(`  name = ${created.name}`);
    console.log('  raw  =', JSON.stringify(created.raw));
  } catch (e) {
    if (e instanceof WialonApiError) {
      console.error(`[wialon] Wialon API вернул ошибку: code=${e.code}, svc=${e.svc}`);
      console.error(`[wialon] Текст: ${e.message}`);
      if (e.code === 7) {
        console.error('[wialon] Code 7 = Access denied — подтверждение, что дело в правах токена/пользователя на ресурс, а не в синтаксисе запроса.');
      }
    } else {
      console.error('[wialon] Неожиданная ошибка (не WialonApiError):', e);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`\n[wialon] Проверяю findReportTemplate("${TEMPLATE_NAME}")...`);
  try {
    const ref = await findReportTemplate(TEMPLATE_NAME, true); // forceRefresh — не брать старый (пустой) кэш
    console.log('[wialon] findReportTemplate нашёл шаблон:');
    console.log(`  resourceId = ${ref.resourceId}`);
    console.log(`  templateId = ${ref.templateId}`);
    console.log(`[wialon] Кэш-файл обновлён: ${REPORT_TEMPLATE_CACHE_PATH}`);
  } catch (e) {
    console.error('[wialon] findReportTemplate не нашёл только что созданный шаблон:', (e as Error).message);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('[wialon] Необработанная ошибка:', e);
  process.exitCode = 1;
});
