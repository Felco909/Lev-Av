import { logTripDocAuthTrace } from '@/lib/trip-doc-auth-log';

export type RoleGuardResult =
  | { ok: true; role: string }
  | { ok: false; status: 401 | 403; error: string };

export const CRITICAL_PAYMENTS_ROLES = ['admin', 'owner', 'director', 'accountant'] as const;
/**
 * Роли, которым разрешено менять денормализованные поля оплат прямо на заявке
 * (clientPaidAmount*, carrierPaidAmount*, *PaymentStatus), минуя журнал проводок.
 * Ставки, курсы, расходы, статус маршрута — обычная работа; для них эта проверка не используется.
 */
export const CRITICAL_FINANCE_FIELDS_ROLES = ['admin', 'owner', 'director', 'accountant'] as const;
export const TRIP_DENORMALIZED_PAYMENT_ROLES = CRITICAL_FINANCE_FIELDS_ROLES;
/**
 * Глобальная нумерация в карточке клиента (префиксы, счётчики серии) — только финансы/руководство.
 */
export const CLIENT_GLOBAL_DOC_NUMBERING_ROLES = ['admin', 'owner', 'director', 'accountant'] as const;

/**
 * Номера счёта/акта на заявке + генерация PDF/DOCX по этим номерам.
 * Включает dispatcher — операционный персонал, который уже работает с заявками.
 */
export const TRIP_DOC_NUMBER_ROLES = ['admin', 'owner', 'director', 'accountant', 'dispatcher'] as const;

/** @deprecated Используйте CLIENT_GLOBAL_DOC_NUMBERING_ROLES или TRIP_DOC_NUMBER_ROLES по контексту. */
export const CRITICAL_DOC_NUMBERING_ROLES = CLIENT_GLOBAL_DOC_NUMBERING_ROLES;

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

/**
 * Доступ к номерам счёта/акта на заявке и генерации PDF/DOCX.
 * Достаточно быть залогиненным: роль в JWT на LAN иногда не попадает в session.user,
 * из‑за чего раньше был ложный 403. Права «кто может в систему» уже обеспечены входом + middleware.
 * Опционально: TRIP_DOC_AUTH_DEBUG=1 и передать req — пишет host/origin/наличие cookie в консоль сервера.
 */
export function assertAuthenticatedForTripDocuments(
  session: any,
  actionLabel: string,
  req?: Request
): RoleGuardResult {
  logTripDocAuthTrace(req, session, `assertTripDocs:${actionLabel}`);

  if (!session?.user) {
    return { ok: false, status: 401, error: 'Не авторизован' };
  }
  const role = getSessionRole(session);
  return { ok: true, role: role || 'authenticated' };
}
