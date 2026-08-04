export type RoleGuardResult =
  | { ok: true; role: string }
  | { ok: false; status: 401 | 403; error: string };

export const CRITICAL_PAYMENTS_ROLES = ['admin', 'owner', 'director', 'accountant'] as const;
/** Кто может создавать новые учётные записи (закрытие публичной саморегистрации). */
export const USER_MANAGEMENT_ROLES = ['admin', 'owner'] as const;
export const KNOWN_USER_ROLES = ['admin', 'owner', 'director', 'accountant', 'dispatcher'] as const;
/**
 * Роли, которым разрешено менять денормализованные поля оплат прямо на заявке
 * (clientPaidAmount*, carrierPaidAmount*, *PaymentStatus), минуя журнал проводок.
 * Ставки, курсы, расходы, статус маршрута — обычная работа; для них эта проверка не используется.
 */
export const CRITICAL_FINANCE_FIELDS_ROLES = ['admin', 'owner', 'director', 'accountant'] as const;
export const TRIP_DENORMALIZED_PAYMENT_ROLES = CRITICAL_FINANCE_FIELDS_ROLES;
/**
 * Создание/удаление оплаты через журнал (POST/DELETE /api/payments) — отдельно от
 * TRIP_DENORMALIZED_PAYMENT_ROLES выше. Диспетчер работает с заявками и клиентами
 * весь день и по решению владельца бизнеса (2026-08-04) допущен вносить оплаты через
 * журнал; прямая правка денормализованных сумм оплаты (clientPaidAmount и т.п.) в обход
 * журнала (PUT /api/trips/[id]) — по-прежнему только TRIP_DENORMALIZED_PAYMENT_ROLES,
 * это разные операции с разным риском (журнал пересчитывает сумму сам, прямая правка — нет).
 */
export const TRIP_PAYMENT_JOURNAL_ROLES = ['admin', 'owner', 'director', 'accountant', 'dispatcher'] as const;
/**
 * Финансовые поля рейса машины (зарплата, суточные ×1-4, прочие расходы, топливо,
 * доп. расходы автопарка FleetExpense) — те же роли, что и для оплат заявки. Машина,
 * водитель, даты, статус рейса — обычная операционная работа диспетчера, эта проверка
 * их не касается (см. аудит архитектуры, пункт 2: рейс полностью редактируем по составу/
 * датам/статусу, но не по деньгам).
 */
export const VEHICLE_TRIP_FINANCIAL_ROLES = CRITICAL_FINANCE_FIELDS_ROLES;
/**
 * Глобальная нумерация в карточке клиента (префиксы, счётчики серии) — только финансы/руководство.
 */
export const CLIENT_GLOBAL_DOC_NUMBERING_ROLES = ['admin', 'owner', 'director', 'accountant'] as const;

/**
 * Реквизиты компании в /settings (название, ИНН, адрес, телефон, банковские реквизиты,
 * руководитель) — печатаются на счетах/актах клиентам, поэтому та же роль, что и критичные
 * финансовые поля заявки (см. аудит, п.7). Персональные ключи Setting того же эндпоинта
 * (dashboard_mode:<email>, dashboard_widgets:<email>, reports_widgets:<email>) этой проверкой
 * не затрагиваются — см. COMPANY_SETTING_KEYS в app/api/settings/route.ts.
 */
export const COMPANY_REQUISITES_ROLES = CRITICAL_FINANCE_FIELDS_ROLES;

/**
 * Номера счёта/акта на заявке + генерация PDF/DOCX по этим номерам.
 * Включает dispatcher — операционный персонал, который уже работает с заявками.
 */
export const TRIP_DOC_NUMBER_ROLES = ['admin', 'owner', 'director', 'accountant', 'dispatcher'] as const;

/**
 * Настройка интеграции Wialon (сохранение/удаление API-токена, запуск синхронизации машин) —
 * уровень конфигурации автопарка, не операционная работа. Просмотр статуса телематики
 * (GET /api/wialon/config, /api/wialon/fleet-snapshot) доступен всем ролям без этой проверки.
 */
export const WIALON_CONFIG_ROLES = ['admin', 'owner', 'director'] as const;

/** Поля «оплачено на строке заявки» — не путать со ставкой клиента и курсом валюты. */
export const TRIP_DENORMALIZED_PAYMENT_FIELDS = [
  'clientPaidAmount',
  'clientPaidAmountAmd',
  'clientPaymentStatus',
  'carrierPaidAmount',
  'carrierPaidAmountAmd',
  'carrierPaymentStatus',
] as const;

export function getTouchedDenormalizedPaymentFields(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const o = body as Record<string, unknown>;
  return TRIP_DENORMALIZED_PAYMENT_FIELDS.filter((key) => Object.prototype.hasOwnProperty.call(o, key));
}

/**
 * Финансовые настройки нумерации документов клиента — см. CLIENT_GLOBAL_DOC_NUMBERING_ROLES.
 * Форма клиента (app/(app)/clients/page.tsx) — один общий form-объект и на создание, и на
 * редактирование, поэтому эти поля присутствуют в теле запроса ВСЕГДА (даже если пользователь
 * их не трогал) — проверка на "поле присутствует" здесь не годится (в отличие от денормали-
 * зованных полей оплаты заявки, которые trip-form.tsx в норме вообще не отправляет). Роль
 * нужно требовать только если значение реально ИЗМЕНИЛОСЬ — см. diffClientDocNumberingFields.
 */
export const CLIENT_GLOBAL_DOC_NUMBERING_FIELDS = [
  'invoicePrefix',
  'actPrefix',
  'numberFormat',
  'resetNumberingYearly',
] as const;

/** Сравнивает присланные значения с базовыми (текущая запись при PUT, значения по
 *  умолчанию при POST) и возвращает список реально изменённых полей нумерации. */
export function diffClientDocNumberingFields(
  base: Record<string, unknown>,
  submitted: Record<string, unknown>
): string[] {
  return CLIENT_GLOBAL_DOC_NUMBERING_FIELDS.filter((key) => {
    if (!Object.prototype.hasOwnProperty.call(submitted, key)) return false;
    return String(base[key] ?? '') !== String(submitted[key] ?? '');
  });
}

function normalizeRole(role: unknown): string {
  return String(role ?? '').trim().toLowerCase();
}

export function getSessionRole(session: any): string | null {
  const role = normalizeRole(session?.user?.role);
  return role || null;
}

export function hasAnyRole(session: any, allowedRoles: readonly string[]): boolean {
  const role = getSessionRole(session);
  if (!role) return false;
  const allowed = new Set(allowedRoles.map((r) => normalizeRole(r)));
  return allowed.has(role);
}

/**
 * Pure helper for API routes:
 * - does not change auth/session logic
 * - only validates role against allowed list
 */
export function assertRole(
  session: any,
  allowedRoles: readonly string[],
  actionLabel: string
): RoleGuardResult {
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Не авторизован' };
  }

  const role = getSessionRole(session);
  if (!role || !hasAnyRole(session, allowedRoles)) {
    return { ok: false, status: 403, error: `Недостаточно прав для действия: ${actionLabel}` };
  }

  return { ok: true, role };
}
