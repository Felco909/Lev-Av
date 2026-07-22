/**
 * Простой клиент Wialon Remote API (JSON-RPC-подобный, POST на ajax.html).
 * Формат подтверждён по официальной документации Wialon SDK и исходникам
 * python-wialon/php-wialon: POST, тело application/x-www-form-urlencoded
 * с полями svc / params (JSON-строка) / sid. Ответ — JSON, ошибки — {"error": <code>}.
 *
 */

import fs from 'fs';
import path from 'path';
import { getStoredWialonToken } from './token-store';

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
export function sanitizeToken(rawToken: string): string {
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
  // Токен из БД (настраивается в разделе «Телематика») имеет приоритет над .env — но если
  // в БД ничего не сохранено (или чтение упало), login() сам падает обратно на WIALON_TOKEN.
  const dbToken = await getStoredWialonToken().catch(() => null);
  const { sid } = await login(dbToken ?? undefined);
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
  /** GPS-позиция сообщения (y=широта, x=долгота, s=скорость км/ч, sc=число спутников) */
  pos?: { y: number; x: number; s?: number; sc?: number };
}

const MESSAGES_PAGE_SIZE = 5000;
/** Предохранитель от бесконечного цикла пагинации — 50 страниц по 5000 = 250k сообщений,
 *  с запасом покрывает многонедельный рейс при частоте сообщений ~1/40 сек. */
const MESSAGES_MAX_PAGES = 50;

/**
 * Сырые сообщения машины за произвольный интервал, с пагинацией (messages/load_interval
 * отдаёт максимум loadCount сообщений за раз — для интервалов длиннее нескольких часов
 * нужно догружать порциями, иначе для долгих рейсов пробег будет молча занижен).
 */
async function loadMessagesInterval(sid: string, unitId: number, timeFrom: number, timeTo: number): Promise<WialonMessage[]> {
  const all: WialonMessage[] = [];
  let from = timeFrom;
  for (let page = 0; page < MESSAGES_MAX_PAGES; page++) {
    const data = await callWialon<{ messages?: WialonMessage[] }>(
      'messages/load_interval',
      {
        itemId: unitId,
        timeFrom: from,
        timeTo,
        flags: 0,
        flagsMask: 0xff00, // все "данные" сообщения (не события/тревоги)
        loadCount: MESSAGES_PAGE_SIZE,
      },
      sid
    );
    const batch = (data.messages ?? []).slice().sort((a, b) => a.t - b.t);
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < MESSAGES_PAGE_SIZE) break; // меньше полной страницы — интервал исчерпан
    from = batch[batch.length - 1].t + 1; // следующая страница — после последней полученной секунды
  }
  return all;
}

/** Сырые сообщения машины за последние N часов (для "текущего" снимка, не историю). */
async function loadRecentMessages(sid: string, unitId: number, hoursBack: number): Promise<WialonMessage[]> {
  const now = Math.floor(Date.now() / 1000);
  return loadMessagesInterval(sid, unitId, now - hoursBack * 3600, now);
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

// ───────────────────────── Поиск шаблона отчёта по имени ─────────────────────────
/**
 * Находит id единственного ресурса аккаунта (avl_resource) — официальному отчёту требует
 * reportResourceId, а хардкодить его не хочется (см. WIALON_REPORT_RESOURCE_ID как явный
 * override на случай, если в аккаунте когда-нибудь появится больше одного ресурса).
 */
async function resolveDefaultResourceId(sid: string): Promise<number> {
  const envId = process.env.WIALON_REPORT_RESOURCE_ID;
  if (envId) return Number(envId);

  const data = await callWialon<{ items?: Array<{ id: number; nm: string }> }>(
    'core/search_items',
    {
      spec: { itemsType: 'avl_resource', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
      force: 1,
      flags: 1,
      from: 0,
      to: 0,
    },
    sid
  );

  const items = data.items ?? [];
  if (items.length === 0) {
    throw new Error('Wialon: не найдено ни одного ресурса (avl_resource) в аккаунте — некуда привязать inline-отчёт.');
  }
  if (items.length > 1) {
    throw new Error(
      `Wialon: в аккаунте несколько ресурсов (${items.map((i) => `${i.nm}#${i.id}`).join(', ')}) — ` +
        'задайте WIALON_REPORT_RESOURCE_ID в .env явно, чтобы не гадать, какой использовать.'
    );
  }
  return items[0].id;
}

/**
 * Официальный отчёт Wialon "Расход топлива" — воспроизводит ТОЧНУЮ последовательность запросов
 * веб-интерфейса Wialon (подтверждено HAR-файлом реального сеанса пользователя в вебе, см. чат):
 *   1) report/exec_report — reportTemplateId (реальный СОХРАНЁННЫЙ шаблон на ресурсе аккаунта,
 *      не инлайн-тело — inline-тело (reportTemplateId:0) стабильно давало msgsRendered:0, потому
 *      что веб-интерфейс использует не его, а обычный сохранённый шаблон), remoteExec:1 (реально
 *      асинхронно, вопреки более ранней попытке с remoteExec:0), interval.flags:16777216 (0x1000000 —
 *      именно это значение стоит у веб-интерфейса, семантика в публичной документации не описана,
 *      используется как есть).
 *   2) report/get_report_status — опрос до status:"4" (готово).
 *   3) report/apply_report_result — только ЗДЕСЬ приходит заполненный reportResult с таблицами
 *      (report/get_result_rows, использовавшийся раньше, для этого аккаунта не подходит).
 *   4) report/cleanup_result — освобождение сессии отчёта (как и в остальных функциях этого файла).
 *
 * Таблица "unit_generic" (группировка по дням, но totalRaw — сразу готовый итог за весь период) —
 * колонки ищем по header_type (устойчиво к порядку), не по индексу.
 */
const WIALON_FUEL_REPORT_INTERVAL_FLAGS = 16777216;

export interface WialonOfficialTripReport {
  mileageAllKm: number; // "Пробег по всем сообщениям" — та же цифра, что в шапке отчёта Wialon
  mileageTripsKm: number; // "Пробег в поездках" (детектор рейсов, обычно меньше mileageAllKm)
  fuelConsumedL: number; // "Потрачено по ДУТ" — с учётом заправок/сливов за период
  avgFuelConsumptionPer100Km: number; // "Ср. расход по ДУТ"
  fuelLevelBeginL: number; // "Нач. уровень"
  fuelLevelEndL: number; // "Кон. уровень"
  engineHoursSec: number; // "Моточасы"
  idleSec: number; // "Стоянки" (duration_stay) — используется как "Простой" в карточке рейса
  fillingsCount: number;
  filledL: number;
  theftsCount: number;
  theftedL: number;
  calculatedAt: Date;
  raw: any;
}

function rawValueByHeaderType(table: { header_type: string[]; totalRaw: Array<{ v: number; vt: number }> }, type: string): number {
  const idx = table.header_type.indexOf(type);
  return idx === -1 ? 0 : (table.totalRaw[idx]?.v ?? 0);
}

/**
 * "Пробег по всем сообщениям" в верхнеуровневой сводке reportResult.stats — ТОЧНО то число,
 * что видит пользователь в шапке отчёта Wialon (подтверждено дважды вживую на реальных данных,
 * см. чат) — НЕ совпадает с тем же header_type "mileage_all" в таблице unit_generic (там
 * группировка по дням теряет ~2% на стыках суток). Для остальных полей (топливо/заправки/
 * уровни/моточасы) таблица unit_generic и stats совпадают — берём их оттуда, как раньше.
 * stats — только текстовые пары [label, "8064 km"], поэтому парсим ведущее число регуляркой.
 */
function parseStatNumber(stats: Array<[string, string]> | undefined, labelSubstring: string): number | null {
  const row = stats?.find(([label]) => label.includes(labelSubstring));
  if (!row) return null;
  const match = row[1].replace(',', '.').match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

/**
 * Выполняет официальный отчёт Wialon за интервал и возвращает итоги ровно в том виде, в котором
 * их показывает веб-интерфейс Wialon — без собственного расчёта по сырым GPS-сообщениям.
 * WIALON_FUEL_REPORT_TEMPLATE_ID (.env) — id сохранённого шаблона отчёта на ресурсе аккаунта;
 * найти автоматически (core/search_items) не удалось — эта же учётка не даёt увидеть список
 * шаблонов через API (видимо, ограничение прав именно на просмотр списка, не на выполнение по id),
 * хотя сам шаблон реально существует и выполняется. Обязательный параметр — без него отчёт
 * выполнить нельзя (заводить каждый раз новый id вручную через веб-кабинет).
 */
export async function getOfficialTripReport(unitId: number, dateFrom: Date, dateTo: Date): Promise<WialonOfficialTripReport> {
  const templateIdEnv = process.env.WIALON_FUEL_REPORT_TEMPLATE_ID;
  if (!templateIdEnv) {
    throw new Error(
      'Wialon: не задан WIALON_FUEL_REPORT_TEMPLATE_ID в .env — id сохранённого шаблона отчёта "Расход топлива" ' +
        '(взять из веб-кабинета Wialon: Отчёты → нужный шаблон → его id, либо перехватить из HAR при построении отчёта в вебе).'
    );
  }
  const templateId = Number(templateIdEnv);

  const sid = await getCachedSid();
  const resourceId = await resolveDefaultResourceId(sid);
  const from = Math.floor(dateFrom.getTime() / 1000);
  const to = Math.floor(dateTo.getTime() / 1000);

  // 1) Запуск отчёта — асинхронно (remoteExec:1), как в веб-интерфейсе.
  await callWialon<any>(
    'report/exec_report',
    {
      reportResourceId: resourceId,
      reportTemplateId: templateId,
      reportTemplate: null,
      reportObjectId: unitId,
      reportObjectSecId: 0,
      interval: { flags: WIALON_FUEL_REPORT_INTERVAL_FLAGS, from, to },
      remoteExec: 1,
    },
    sid
  );

  // 2) Опрос статуса до готовности ("4"). Реальный отчёт на 19 дней/66k сообщений занял в вебе
  // 4 опроса — с запасом даём до 40 опросов по 750мс (30 сек), дольше считаем зависшим отчётом.
  const MAX_STATUS_POLLS = 40;
  const STATUS_POLL_INTERVAL_MS = 750;
  let ready = false;
  for (let i = 0; i < MAX_STATUS_POLLS; i++) {
    const statusResult = await callWialon<{ status?: string }>('report/get_report_status', {}, sid);
    if (statusResult?.status === '4') {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_INTERVAL_MS));
  }
  if (!ready) {
    await callWialon('report/cleanup_result', {}, sid).catch(() => {});
    throw new Error(`Wialon: отчёт не завершился за ${(MAX_STATUS_POLLS * STATUS_POLL_INTERVAL_MS) / 1000} сек (report/get_report_status)`);
  }

  // 3) Только apply_report_result отдаёт заполненный reportResult с таблицами на этом аккаунте.
  let applyResult: {
    reportResult?: {
      stats?: Array<[string, string]>;
      tables?: Array<{ name: string; header_type: string[]; totalRaw: Array<{ v: number; vt: number }> }>;
    };
  };
  try {
    applyResult = await callWialon<any>('report/apply_report_result', {}, sid);
  } finally {
    await callWialon('report/cleanup_result', {}, sid).catch(() => {});
  }

  const table = applyResult.reportResult?.tables?.find((t) => t.name === 'unit_generic');
  const now = new Date();
  if (!table) {
    return {
      mileageAllKm: 0, mileageTripsKm: 0, fuelConsumedL: 0, avgFuelConsumptionPer100Km: 0,
      fuelLevelBeginL: 0, fuelLevelEndL: 0, engineHoursSec: 0, idleSec: 0,
      fillingsCount: 0, filledL: 0, theftsCount: 0, theftedL: 0,
      calculatedAt: now, raw: { noData: true, applyResult },
    };
  }

  const mileageAllFromStats = parseStatNumber(applyResult.reportResult?.stats, 'Пробег по всем сообщениям');

  return {
    mileageAllKm: mileageAllFromStats ?? Math.round((rawValueByHeaderType(table, 'mileage_all') / 1000) * 10) / 10,
    mileageTripsKm: Math.round((rawValueByHeaderType(table, 'mileage') / 1000) * 10) / 10,
    fuelConsumedL: Math.round(rawValueByHeaderType(table, 'fuel_consumption_fls') * 10) / 10,
    avgFuelConsumptionPer100Km: Math.round(rawValueByHeaderType(table, 'avg_fuel_consumption_fls') * 10) / 10,
    fuelLevelBeginL: Math.round(rawValueByHeaderType(table, 'fuel_level_begin') * 10) / 10,
    fuelLevelEndL: Math.round(rawValueByHeaderType(table, 'fuel_level_end') * 10) / 10,
    engineHoursSec: Math.round(rawValueByHeaderType(table, 'eh')),
    idleSec: Math.round(rawValueByHeaderType(table, 'duration_stay')),
    fillingsCount: Math.round(rawValueByHeaderType(table, 'fillings_count')),
    filledL: Math.round(rawValueByHeaderType(table, 'filled') * 10) / 10,
    theftsCount: Math.round(rawValueByHeaderType(table, 'thefts_count')),
    theftedL: Math.round(rawValueByHeaderType(table, 'thefted') * 10) / 10,
    calculatedAt: now,
    raw: { table },
  };
}

// ───────────────────────── Пробег по сырому GPS-треку (для точечного автозаполнения формы) ─────────────────────────
// getMileageAndFuelReport выше (report/exec_report, таблицы unit_trips/unit_stats) стабильно
// возвращал msgsRendered: 0 на этом аккаунте при структурно валидном запросе — проверено вживую
// 5 разными вариантами (разные машины, разные типы таблиц), схему reportTemplate публичная
// документация Wialon SDK не раскрывает. Вместо дальнейшего угадывания — считаем пробег сами,
// суммируя расстояния между соседними GPS-точками трека (messages/load_interval, уже проверенный
// метод — используется в getCurrentSnapshot для топлива). Менее точно, чем штатный счётчик
// Wialon (там дополнительная фильтрация/коррекция), но полностью в наших руках и без
// недокументированного API.

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Расстояние между двумя GPS-точками по формуле гаверсинуса, км. */
function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // средний радиус Земли, км
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Минимальный скачок между соседними точками, который считаем реальным движением, км.
 * Меньшие скачки — GPS-шум на стоянке (координата "дрожит" на несколько метров даже
 * когда машина стоит) — иначе за долгую стоянку набежит заметный ложный пробег.
 */
const MIN_TRACK_HOP_KM = 0.02; // 20 метров

interface TrackSummary {
  mileageKm: number;
  idleMinutes: number;
}

/**
 * Суммирует пройденное расстояние и время стоянок по треку, отбрасывая GPS-шум ниже
 * MIN_TRACK_HOP_KM. Простой — сумма промежутков времени между соседними точками, где скачок
 * координат оказался ниже порога (т.е. машина не двигалась) — приближение: длинные пробелы
 * без связи (не "стоянка", а "нет сигнала") тоже засчитываются как простой, отдельно не
 * различаем (см. аналогичную оговорку у getMileageFromTrack про GPS-шум и покрытие).
 */
function computeTrackSummary(messages: WialonMessage[]): TrackSummary {
  let totalKm = 0;
  let idleSeconds = 0;
  let prev: { lat: number; lon: number; t: number } | null = null;

  for (const msg of messages) {
    const pos = msg.pos;
    if (!pos || typeof pos.y !== 'number' || typeof pos.x !== 'number') continue;
    if (pos.y === 0 && pos.x === 0) continue; // нет GPS-фикса на момент сообщения

    if (prev) {
      const hopKm = haversineDistanceKm(prev.lat, prev.lon, pos.y, pos.x);
      if (hopKm >= MIN_TRACK_HOP_KM) {
        totalKm += hopKm;
      } else {
        idleSeconds += Math.max(0, msg.t - prev.t);
      }
    }
    prev = { lat: pos.y, lon: pos.x, t: msg.t };
  }

  return { mileageKm: Math.round(totalKm * 10) / 10, idleMinutes: Math.round(idleSeconds / 60) };
}

export interface WialonTrackMileageResult {
  mileageKm: number;
  /** Время стоянок за интервал, минуты — см. оговорку в computeTrackSummary про пробелы связи. */
  idleMinutes: number;
  /** Сколько сообщений с GPS-позицией реально использовано в расчёте (для отладки/доверия к числу) */
  messagesUsed: number;
  raw: any;
}

/**
 * Пробег машины за интервал, посчитанный напрямую по GPS-треку (см. пояснение выше) —
 * не зависит от report/exec_report и Trip Detector, только messages/load_interval.
 *
 * Если за интервал нет ни одного сообщения с GPS-позицией (машина не выходила на связь) —
 * возвращает { mileageKm: 0, messagesUsed: 0 }, это НЕ ошибка, а ожидаемый исход.
 */
export async function getMileageFromTrack(
  unitId: number,
  dateFrom: Date,
  dateTo: Date
): Promise<WialonTrackMileageResult> {
  let sid: string;
  try {
    sid = await getCachedSid();
  } catch (e) {
    throw new Error(`Wialon: не удалось авторизоваться перед расчётом пробега по треку: ${(e as Error).message}`);
  }

  const timeFrom = Math.floor(dateFrom.getTime() / 1000);
  const timeTo = Math.floor(dateTo.getTime() / 1000);

  let messages: WialonMessage[];
  try {
    messages = await loadMessagesInterval(sid, unitId, timeFrom, timeTo);
  } catch (e) {
    if (e instanceof WialonApiError) {
      if (e.code === 1001) {
        // "Нет сообщений за выбранный период" — ожидаемо, не ошибка.
        return { mileageKm: 0, idleMinutes: 0, messagesUsed: 0, raw: { noData: true, reason: 'no_messages_in_interval' } };
      }
      throw new Error(`Wialon: ошибка загрузки сообщений (messages/load_interval): ${e.message}`);
    }
    throw e;
  }

  const messagesWithPos = messages.filter((m) => m.pos && typeof m.pos.y === 'number' && typeof m.pos.x === 'number');
  const { mileageKm, idleMinutes } = computeTrackSummary(messagesWithPos);

  return {
    mileageKm,
    idleMinutes,
    messagesUsed: messagesWithPos.length,
    raw: { timeFrom, timeTo, totalMessages: messages.length, messagesWithPos: messagesWithPos.length },
  };
}

// ───────────────────────── Топливо на конкретную дату (обход report/exec_report) ─────────────────────────
// Симметрично getMileageFromTrack выше: getCurrentSnapshot умеет доставать только "текущий"
// остаток топлива (последнее сообщение за 6ч), независимо от того, на какую дату его просят —
// см. обсуждение раньше про isApproximate. Ниже — честный поиск ближайшего по времени сырого
// сообщения с показанием датчика ВОКРУГ произвольной даты, тем же проверенным
// messages/load_interval + калибровочной таблицей (getFuelSensors/resolveSensorValue),
// без зависимости от report/exec_report.

/** Окна поиска вокруг целевой даты, часы — расширяются по шагам, пока не найдётся сообщение
 *  с показанием датчика (машина могла быть вне сети связи какое-то время). */
const FUEL_LOOKUP_WINDOWS_HOURS = [3, 24, 168]; // ±3ч, ±1 день, ±7 дней

export interface WialonFuelAtDateResult {
  fuelLevelL: number | null;
  /** Время сообщения, из которого реально взято показание (может отличаться от запрошенной даты) */
  measuredAt: Date | null;
  /** Координаты из того же сообщения, что и показание топлива — доп. запрос не нужен.
   *  null, если у машины вообще нет топливных датчиков (сообщение для координат не искалось —
   *  см. ограничение в описании функции) или сообщение без GPS-фикса. */
  lat: number | null;
  lon: number | null;
  raw: any;
}

/**
 * Остаток топлива машины на конкретный момент времени — ищет БЛИЖАЙШЕЕ по времени сырое
 * сообщение с показанием топливного датчика вокруг `date` (не обязательно "текущее"), прогоняет
 * через калибровочную таблицу датчика. Если сообщений с датчиком нет ни в одном из окон поиска —
 * возвращает { fuelLevelL: null }, это НЕ ошибка (машина могла быть вне сети связи).
 */
export async function getFuelLevelAtDate(unitId: number, date: Date): Promise<WialonFuelAtDateResult> {
  let sid: string;
  try {
    sid = await getCachedSid();
  } catch (e) {
    throw new Error(`Wialon: не удалось авторизоваться перед получением остатка топлива: ${(e as Error).message}`);
  }

  let sensors: WialonFuelSensor[];
  try {
    sensors = await getFuelSensors(sid, unitId);
  } catch (e) {
    throw new Error(`Wialon: не удалось получить датчики топлива машины: ${(e as Error).message}`);
  }
  if (sensors.length === 0) {
    return { fuelLevelL: null, measuredAt: null, lat: null, lon: null, raw: { reason: 'no_fuel_sensors' } };
  }

  const targetTs = Math.floor(date.getTime() / 1000);

  for (const windowHours of FUEL_LOOKUP_WINDOWS_HOURS) {
    let messages: WialonMessage[];
    try {
      messages = await loadMessagesInterval(sid, unitId, targetTs - windowHours * 3600, targetTs + windowHours * 3600);
    } catch (e) {
      if (e instanceof WialonApiError && e.code === 1001) continue; // нет сообщений в этом окне — пробуем шире
      throw new Error(`Wialon: ошибка загрузки сообщений (messages/load_interval): ${(e as Error).message}`);
    }

    let best: { measuredAt: Date; fuelLevelL: number; diffSec: number; lat: number | null; lon: number | null } | null = null;
    for (const msg of messages) {
      const values: number[] = [];
      for (const sensor of sensors) {
        const raw = msg.p?.[sensor.param];
        if (typeof raw === 'number') values.push(resolveSensorValue(sensor, raw));
      }
      if (values.length === 0) continue;
      const diffSec = Math.abs(msg.t - targetTs);
      if (!best || diffSec < best.diffSec) {
        best = {
          measuredAt: new Date(msg.t * 1000),
          fuelLevelL: Math.round(values.reduce((s, v) => s + v, 0) * 10) / 10,
          diffSec,
          lat: typeof msg.pos?.y === 'number' ? msg.pos.y : null,
          lon: typeof msg.pos?.x === 'number' ? msg.pos.x : null,
        };
      }
    }

    if (best) {
      return {
        fuelLevelL: best.fuelLevelL,
        measuredAt: best.measuredAt,
        lat: best.lat,
        lon: best.lon,
        raw: { windowHours, diffSeconds: best.diffSec },
      };
    }
  }

  return {
    fuelLevelL: null,
    measuredAt: null,
    lat: null,
    lon: null,
    raw: { reason: 'no_data_in_any_window', maxWindowHours: FUEL_LOOKUP_WINDOWS_HOURS[FUEL_LOOKUP_WINDOWS_HOURS.length - 1] },
  };
}

// ───────────────────────── Абсолютный пробег (одометр) на дату ─────────────────────────
// Счётчик Wialon (cnm, getUnitMileage) хранит только ТЕКУЩЕЕ показание — историческое на
// дату получаем расчётом: текущий счётчик минус дистанция, пройденная от даты до сейчас
// (getMileageFromTrack). Дороже прямого запроса — гонит через ВЕСЬ GPS-трек от даты до
// текущего момента, поэтому вызывающая сторона должна сама ограничивать глубину даты
// в прошлое разумным окном (см. RECENT_WINDOW_MS в app/api/wialon/vehicle-snapshot/route.ts).

export interface WialonOdometerAtDateResult {
  mileageKm: number | null;
  raw: any;
}

/**
 * Абсолютное показание одометра машины на дату = текущий счётчик Wialon минус пробег,
 * пройденный от даты до сейчас (по GPS-треку). Если получившееся число отрицательное
 * (типично — пробелы в GPS-покрытии занижают "пройденное с даты", отсюда завышение
 * исторического значения) — не выдаём заведомо некорректное число, возвращаем null.
 */
export async function getOdometerAtDate(unitId: number, date: Date): Promise<WialonOdometerAtDateResult> {
  let sid: string;
  try {
    sid = await getCachedSid();
  } catch (e) {
    throw new Error(`Wialon: не удалось авторизоваться перед расчётом пробега на дату: ${(e as Error).message}`);
  }

  const [currentMileage, driven] = await Promise.all([
    getUnitMileage(sid, unitId).catch(() => null),
    getMileageFromTrack(unitId, date, new Date()),
  ]);

  if (currentMileage?.mileageKm == null) {
    return { mileageKm: null, raw: { reason: 'no_current_counter' } };
  }

  const historicalKm = Math.round((currentMileage.mileageKm - driven.mileageKm) * 10) / 10;
  if (historicalKm < 0) {
    return {
      mileageKm: null,
      raw: { reason: 'negative_result', currentKm: currentMileage.mileageKm, drivenKm: driven.mileageKm },
    };
  }

  return {
    mileageKm: historicalKm,
    raw: { currentKm: currentMileage.mileageKm, drivenKm: driven.mileageKm, messagesUsed: driven.messagesUsed },
  };
}

// ───────────────────────── Снимок всего парка одним запросом ─────────────────────────
// Для страницы «Телематика» (и позже — карты онлайн-мониторинга) нужен статус СРАЗУ по всем
// машинам. Вместо getCurrentSnapshot() на каждую машину (N запросов) — один core/search_items
// по всем avl_unit сразу с флагами lmsg+pos+sensors+counters, топливо резолвим из уже
// пришедших sens/lmsg.p в том же ответе (без отдельного messages/load_interval на юнит).

export interface WialonFleetSnapshotItem {
  unitId: number;
  name: string;
  mileageKm: number | null;
  fuelLevelL: number | null;
  lat: number | null;
  lon: number | null;
  speedKmh: number | null;
  /** Время последнего сообщения от трекера — по нему определяем "нет связи" в UI. */
  lastMessageAt: Date | null;
}

/** flags: 1 (общие) | 0x400 (последнее сообщение + позиция) | 0x1000 (датчики) | 0x2000 (счётчики) */
const FLEET_SNAPSHOT_FLAGS = 1 | 0x400 | 0x1000 | 0x2000;

export async function getFleetSnapshot(): Promise<WialonFleetSnapshotItem[]> {
  const sid = await getCachedSid();
  const data = await callWialon<{ items?: any[] }>(
    'core/search_items',
    {
      spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
      force: 1,
      flags: FLEET_SNAPSHOT_FLAGS,
      from: 0,
      to: 0,
    },
    sid
  );

  const items = data.items ?? [];
  return items.map((it): WialonFleetSnapshotItem => {
    const sensors: WialonFuelSensor[] = it.sens
      ? Object.values(it.sens as Record<string, any>)
          .filter((s: any) => FUEL_SENSOR_NAME_RE.test(s.n) && Array.isArray(s.tbl) && s.tbl.length > 0)
          .map((s: any) => ({ id: s.id, name: s.n, param: s.p, table: s.tbl }))
      : [];

    let fuelLevelL: number | null = null;
    const rawParams: Record<string, unknown> | undefined = it.lmsg?.p;
    if (sensors.length > 0 && rawParams) {
      const values: number[] = [];
      for (const sensor of sensors) {
        const raw = rawParams[sensor.param];
        if (typeof raw === 'number') values.push(resolveSensorValue(sensor, raw));
      }
      if (values.length > 0) fuelLevelL = Math.round(values.reduce((s, v) => s + v, 0) * 10) / 10;
    }

    return {
      unitId: it.id,
      name: it.nm,
      mileageKm: typeof it.cnm === 'number' ? it.cnm : null,
      fuelLevelL,
      lat: typeof it.pos?.y === 'number' ? it.pos.y : null,
      lon: typeof it.pos?.x === 'number' ? it.pos.x : null,
      speedKmh: typeof it.pos?.s === 'number' ? it.pos.s : null,
      lastMessageAt: typeof it.lmsg?.t === 'number' ? new Date(it.lmsg.t * 1000) : null,
    };
  });
}

// Геозоны Wialon (Этап 7) больше не используются — от них отказались: у токена этого
// аккаунта нет прав на запись (resource/update_zone → error 7, access denied), плюс
// прямое требование не завязывать TMS на геозоны Wialon вообще. Присутствие "на базе"
// теперь определяется собственными зонами TMS (модель CompanyZone) через простую проверку
// расстояния по живым GPS из getFleetSnapshot() — см. lib/company-base/baseCheck.ts,
// lib/geo/distance.ts.
