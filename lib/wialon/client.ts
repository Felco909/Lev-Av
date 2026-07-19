/**
 * Простой клиент Wialon Remote API (JSON-RPC-подобный, POST на ajax.html).
 * Формат подтверждён по официальной документации Wialon SDK и исходникам
 * python-wialon/php-wialon: POST, тело application/x-www-form-urlencoded
 * с полями svc / params (JSON-строка) / sid. Ответ — JSON, ошибки — {"error": <code>}.
 *
 * Это ТОЛЬКО тестовое подключение (шаг 1) — Prisma/TMS не затрагиваются.
 */

const WIALON_ERROR_MESSAGES: Record<number, string> = {
  1: 'Недействительная или истёкшая сессия (invalid session)',
  2: 'Неизвестный метод API (invalid service)',
  3: 'Некорректный результат (invalid result)',
  4: 'Некорректные входные параметры (invalid input)',
  5: 'Ошибка при выполнении запроса',
  6: 'Неизвестная ошибка Wialon',
  7: 'Доступ запрещён (access denied)',
  8: 'Неверный токен/логин или пароль (invalid token or credentials)',
  9: 'Сервер авторизации недоступен, попробуйте позже',
  1001: 'Нет сообщений за выбранный период',
  1002: 'Объект с таким уникальным свойством уже существует',
  1003: 'Разрешён только один такой запрос в единицу времени (rate limit)',
};

export class WialonApiError extends Error {
  code: number;
  svc: string;

  constructor(code: number, svc: string) {
    const known = WIALON_ERROR_MESSAGES[code];
    super(`Wialon API вернул ошибку ${code} (${svc}): ${known ?? 'неизвестный код ошибки'}`);
    this.name = 'WialonApiError';
    this.code = code;
    this.svc = svc;
  }
}

function getWialonApiUrl(): string {
  const url = process.env.WIALON_API_URL;
  if (!url) {
    throw new Error('WIALON_API_URL не задан в .env/.env.local');
  }
  return url;
}

/**
 * Токен из личного кабинета Wialon иногда копируется вместе с хвостом URL
 * (`...&user_name=...&svc_error=0`), если брать его из адресной строки, а не
 * из специального поля "Token". Сам токен — фиксированная hex-строка (~72
 * символа по документации Wialon), поэтому берём только часть до первого `&`.
 */
function sanitizeToken(rawToken: string): string {
  return rawToken.split('&')[0].trim();
}

async function callWialon<T = any>(svc: string, params: Record<string, unknown>, sid?: string): Promise<T> {
  const apiUrl = getWialonApiUrl();
  const body = new URLSearchParams();
  body.set('svc', svc);
  body.set('params', JSON.stringify(params));
  if (sid) body.set('sid', sid);

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (e: any) {
    throw new Error(`Не удалось связаться с Wialon API (${apiUrl}, svc=${svc}): ${e?.message ?? e}`);
  }

  if (!res.ok) {
    throw new Error(`Wialon API вернул HTTP ${res.status} ${res.statusText} (svc=${svc})`);
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Wialon API вернул не-JSON ответ (svc=${svc})`);
  }

  if (data && typeof data === 'object' && 'error' in data && Number(data.error) > 0) {
    throw new WialonApiError(Number(data.error), svc);
  }

  return data as T;
}

export interface WialonLoginResult {
  sid: string;
  /** Полный ответ token_login (host, au — имя пользователя, tm, user и т.д.) */
  raw: Record<string, unknown>;
}

/**
 * Авторизация через token_login. Возвращает sid (session id, поле "eid" в ответе Wialon).
 * Если токен не передан явно — берётся из WIALON_TOKEN.
 */
export async function login(token?: string): Promise<WialonLoginResult> {
  const rawToken = token ?? process.env.WIALON_TOKEN;
  if (!rawToken) {
    throw new Error('WIALON_TOKEN не задан в .env/.env.local и не передан в login()');
  }
  const cleanToken = sanitizeToken(rawToken);

  const data = await callWialon<Record<string, unknown>>('token/login', { token: cleanToken });
  const sid = data?.eid;
  if (!sid || typeof sid !== 'string') {
    throw new Error(
      'Wialon token_login выполнился без ошибки, но сессия не создана (нет поля "eid" в ответе) — проверьте токен вручную.'
    );
  }
  return { sid, raw: data };
}

export interface WialonUnit {
  id: number;
  /** Имя объекта в Wialon — по договорённости в парке обычно гос.номер машины */
  name: string;
}

/**
 * Список техники аккаунта (core/search_items, itemsType=avl_unit).
 * flags=1 — базовые свойства (id, имя), без телеметрии/позиции.
 */
export async function getUnits(sid: string): Promise<WialonUnit[]> {
  const data = await callWialon<{ items?: Array<{ id: number; nm: string }> }>(
    'core/search_items',
    {
      spec: {
        itemsType: 'avl_unit',
        propName: 'sys_name',
        propValueMask: '*',
        sortType: 'sys_name',
      },
      force: 1,
      flags: 1,
      from: 0,
      to: 0,
    },
    sid
  );

  return (data.items ?? []).map((it) => ({ id: it.id, name: it.nm }));
}

export interface WialonUnitReportOptions {
  /** ID ресурса Wialon, в котором сохранён шаблон отчёта (Reports -> Templates) */
  resourceId: number;
  /** ID сохранённого шаблона отчёта в этом ресурсе */
  templateId: number;
}

/**
 * Отчёт по технике (пробег/расход топлива) за период — report/exec_report.
 *
 * ВАЖНО: это заготовка под шаг 2 (полная интеграция). report/exec_report
 * обязательно требует reportResourceId + reportTemplateId существующего,
 * заранее сохранённого в Wialon шаблона отчёта — в задании на тестовое
 * подключение это не проверялось (scripts/test-wialon.ts вызывает только
 * login()/getUnits()). Перед реальным использованием: зайти в Wialon Reports,
 * создать/подобрать шаблон с нужными таблицами (пробег, расход топлива),
 * узнать resourceId/templateId и передать их сюда.
 */
export async function getUnitReport(
  sid: string,
  unitId: number,
  from: Date | number,
  to: Date | number,
  options: WialonUnitReportOptions
): Promise<any> {
  const toUnixTs = (d: Date | number) => (d instanceof Date ? Math.floor(d.getTime() / 1000) : d);

  return callWialon(
    'report/exec_report',
    {
      reportResourceId: options.resourceId,
      reportTemplateId: options.templateId,
      reportObjectId: unitId,
      reportObjectSecId: 0,
      interval: {
        from: toUnixTs(from),
        to: toUnixTs(to),
        flags: 0,
      },
    },
    sid
  );
}
