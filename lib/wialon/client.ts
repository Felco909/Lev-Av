/**
 * Простой клиент Wialon Remote API (JSON-RPC-подобный, POST на ajax.html).
 * Формат подтверждён по официальной документации Wialon SDK и исходникам
 * python-wialon/php-wialon: POST, тело application/x-www-form-urlencoded
 * с полями svc / params (JSON-строка) / sid. Ответ — JSON, ошибки — {"error": <code>}.
 *
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
 * Кэш сессии в памяти процесса — Wialon-сессии живут ~5 минут простоя, обновляем
 * заведомо раньше (4 минуты), чтобы не ловить "invalid session" в середине запроса.
 * Только для новых high-level методов ниже (getCurrentSnapshot и т.п.) — существующие
 * методы (getUnits, getUnitsWithMileage...) как принимали sid явным параметром, так и принимают.
 */
let cachedSession: { sid: string; obtainedAt: number } | null = null;
const SESSION_TTL_MS = 4 * 60 * 1000;

async function getCachedSid(): Promise<string> {
  if (cachedSession && Date.now() - cachedSession.obtainedAt < SESSION_TTL_MS) {
    return cachedSession.sid;
  }
  const { sid } = await login();
  cachedSession = { sid, obtainedAt: Date.now() };
  return sid;
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

export interface WialonUnitMileage {
  id: number;
  name: string;
  /** Показание счётчика пробега (cnm) в км — null, если Wialon его не отдал */
  mileageKm: number | null;
}

/** flags: 1 (общие свойства: id/nm) | 8192 (0x2000, "Counters": cnm/cneh/cnkb) */
const UNITS_WITH_COUNTERS_FLAGS = 1 | 8192;

/**
 * Пробег по всем машинам аккаунта одним запросом (core/search_items, flags включает
 * "Counters" — cnm). Используется демоном синхронизации (lib/wialon/syncMileage.ts),
 * чтобы не дёргать API отдельным запросом на каждую машину.
 */
export async function getUnitsWithMileage(sid: string): Promise<WialonUnitMileage[]> {
  const data = await callWialon<{ items?: Array<{ id: number; nm: string; cnm?: number }> }>(
    'core/search_items',
    {
      spec: {
        itemsType: 'avl_unit',
        propName: 'sys_name',
        propValueMask: '*',
        sortType: 'sys_name',
      },
      force: 1,
      flags: UNITS_WITH_COUNTERS_FLAGS,
      from: 0,
      to: 0,
    },
    sid
  );

  return (data.items ?? []).map((it) => ({
    id: it.id,
    name: it.nm,
    mileageKm: typeof it.cnm === 'number' ? it.cnm : null,
  }));
}

/** Пробег одной конкретной машины по её Wialon unit id. */
export async function getUnitMileage(sid: string, unitId: number): Promise<WialonUnitMileage> {
  const data = await callWialon<{ items?: Array<{ id: number; nm: string; cnm?: number }> }>(
    'core/search_items',
    {
      spec: {
        itemsType: 'avl_unit',
        propName: 'sys_id',
        propValueMask: String(unitId),
        sortType: 'sys_id',
      },
      force: 1,
      flags: UNITS_WITH_COUNTERS_FLAGS,
      from: 0,
      to: 0,
    },
    sid
  );

  const item = (data.items ?? [])[0];
  if (!item) {
    throw new Error(`Wialon: машина с unit id=${unitId} не найдена (нет доступа у токена или id неверный)`);
  }
  return { id: item.id, name: item.nm, mileageKm: typeof item.cnm === 'number' ? item.cnm : null };
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

// ───────────────────────── Текущий снимок пробега/топлива ─────────────────────────
// Сырые сообщения Wialon содержат протокол-специфичные параметры (io_270 и т.п.), не
// "odometer"/"fuel" — расшифровываются через настроенные в Wialon датчики с кусочно-линейной
// калибровочной таблицей. Живой пример для этого парка: датчик "1-ին բաք" (1й бак),
// параметр io_270, tbl из точек {x, a, b}, значение = a*raw + b для брекета, куда попал raw.

interface WialonSensorTableEntry {
  x: number;
  a: number;
  b: number;
}

export interface WialonFuelSensor {
  id: number;
  name: string;
  /** Имя параметра в "p" объекте сообщения (например "io_270") */
  param: string;
  table: WialonSensorTableEntry[];
}

const FUEL_SENSOR_NAME_RE = /бак|tank|fuel|թ?բաք/i;

/** Датчики топлива машины (по эвристике имени) — с калибровочной таблицей. */
export async function getFuelSensors(sid: string, unitId: number): Promise<WialonFuelSensor[]> {
  const data = await callWialon<{
    items?: Array<{ id: number; sens?: Record<string, { id: number; n: string; p: string; tbl?: WialonSensorTableEntry[] }> }>;
  }>(
    'core/search_items',
    {
      spec: { itemsType: 'avl_unit', propName: 'sys_id', propValueMask: String(unitId), sortType: 'sys_id' },
      force: 1,
      flags: 1 | 4096, // 1 = общие свойства, 4096 (0x1000) = датчики
      from: 0,
      to: 0,
    },
    sid
  );

  const item = (data.items ?? [])[0];
  const sensors = item?.sens ? Object.values(item.sens) : [];
  return sensors
    .filter((s) => FUEL_SENSOR_NAME_RE.test(s.n) && Array.isArray(s.tbl) && s.tbl.length > 0)
    .map((s) => ({ id: s.id, name: s.n, param: s.p, table: s.tbl! }));
}

/** Применяет калибровочную таблицу датчика к сырому значению параметра. */
export function resolveSensorValue(sensor: WialonFuelSensor, rawValue: number): number {
  const sorted = [...sensor.table].sort((a, b) => a.x - b.x);
  let bracket = sorted[0];
  for (const entry of sorted) {
    if (entry.x <= rawValue) bracket = entry;
    else break;
  }
  return bracket.a * rawValue + bracket.b;
}

interface WialonMessage {
  t: number;
  p?: Record<string, number | string>;
}

/** Сырые сообщения машины за последние N часов (для "текущего" снимка, не историю). */
async function loadRecentMessages(sid: string, unitId: number, hoursBack: number): Promise<WialonMessage[]> {
  const now = Math.floor(Date.now() / 1000);
  const timeFrom = now - hoursBack * 3600;
  const data = await callWialon<{ messages?: WialonMessage[] }>(
    'messages/load_interval',
    {
      itemId: unitId,
      timeFrom,
      timeTo: now,
      flags: 0,
      flagsMask: 0xff00, // все "данные" сообщения (не события/тревоги)
      loadCount: 5000, // с запасом на окно в несколько часов при частоте ~1 сообщение/мин
    },
    sid
  );
  return (data.messages ?? []).slice().sort((a, b) => a.t - b.t);
}

export interface WialonVehicleSnapshot {
  mileageKm: number | null;
  fuelLevelL: number | null;
  /** Время последнего сообщения, из которого взято топливо (для пробега — время запроса) */
  measuredAt: Date | null;
}

/**
 * "Текущий" снимок пробега + остатка топлива машины — НЕ историческая точка на прошлую
 * дату (см. CLAUDE.md/план: решено не реализовывать произвольный исторический разбор
 * сырых сообщений — риск разойтись с тем, что показывает сам Wialon). Пробег — через
 * уже проверенный счётчик (core/search_items + Counters). Топливо — последнее сообщение
 * с показанием датчика за последние часы, прогнанное через калибровочную таблицу.
 */
export async function getCurrentSnapshot(unitId: number): Promise<WialonVehicleSnapshot> {
  const sid = await getCachedSid();

  const mileage = await getUnitMileage(sid, unitId).catch(() => null);

  let fuelLevelL: number | null = null;
  let measuredAt: Date | null = null;
  try {
    const sensors = await getFuelSensors(sid, unitId);
    if (sensors.length > 0) {
      const messages = await loadRecentMessages(sid, unitId, 6);
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const values: number[] = [];
        for (const sensor of sensors) {
          const raw = msg.p?.[sensor.param];
          if (typeof raw === 'number') values.push(resolveSensorValue(sensor, raw));
        }
        if (values.length > 0) {
          fuelLevelL = Math.round(values.reduce((s, v) => s + v, 0) * 10) / 10;
          measuredAt = new Date(msg.t * 1000);
          break;
        }
      }
    }
  } catch {
    // Топливо — best effort; отсутствие датчиков/сообщений не должно ронять весь снимок.
  }

  return {
    mileageKm: mileage?.mileageKm ?? null,
    fuelLevelL,
    measuredAt: measuredAt ?? (mileage ? new Date() : null),
  };
}
