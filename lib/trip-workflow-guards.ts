import { STATUS_ORDER, canonicalWorkflowTripStatus } from '@/lib/utils';
import { TRIP_STATUS_LABELS_RU } from '@/lib/trip-workflow-filters';
import { computeClientDueAmd, computeCarrierDueAmd, computeDebtAmd, type ExpenseLike } from '@/lib/finance/formulas';

export type WorkflowGuardResult = { ok: true } | { ok: false; message: string };

function statusLabel(status: string): string {
  return TRIP_STATUS_LABELS_RU[status] ?? status;
}

function workflowIndex(status: string): number {
  const canonical = canonicalWorkflowTripStatus(status);
  const idx = (STATUS_ORDER as readonly string[]).indexOf(canonical);
  return idx >= 0 ? idx : STATUS_ORDER.indexOf('completed');
}

/** Нормализация legacy-статусов из API-запроса. */
export function normalizeIncomingWorkflowStatus(status: string | null | undefined): string | undefined {
  if (status == null || String(status).trim() === '') return undefined;
  const raw = String(status).trim();
  if (raw === 'paid') return 'completed';
  return raw;
}

/** Прямая смена статуса через PATCH/PUT/close (не archive). */
export function assertDirectWorkflowStatusChange(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
): WorkflowGuardResult {
  const to = normalizeIncomingWorkflowStatus(toRaw);
  if (!to) return { ok: true };

  const from = canonicalWorkflowTripStatus(fromRaw);
  const toCanon = canonicalWorkflowTripStatus(to);
  if (from === toCanon) return { ok: true };

  if (from === 'archived') {
    if (toCanon !== 'archived') return { ok: true };
    return { ok: false, message: 'Заявка уже в архиве.' };
  }

  if (toCanon === 'archived') {
    return { ok: true };
  }

  // «Отменена» — та же логика, что и «Архив»: боковой статус вне линейного workflow,
  // доступен из любого шага (отмена может произойти на любой стадии) и из него можно
  // вернуться в любой статус (например, если отменили по ошибке).
  if (from === 'cancelled') {
    if (toCanon !== 'cancelled') return { ok: true };
    return { ok: false, message: 'Заявка уже отменена.' };
  }

  if (toCanon === 'cancelled') {
    return { ok: true };
  }

  const fromIdx = workflowIndex(from);
  const toIdx = workflowIndex(toCanon);
  if (Math.abs(fromIdx - toIdx) > 1) {
    return {
      ok: false,
      message: `Нельзя сразу перевести заявку из «${statusLabel(from)}» в «${statusLabel(toCanon)}». Допустим только соседний шаг workflow.`,
    };
  }

  return { ok: true };
}

/** Завершение: только из «На оплату». */
export function assertCompletedWorkflowTransition(
  fromRaw: string | null | undefined,
): WorkflowGuardResult {
  const from = canonicalWorkflowTripStatus(fromRaw);
  if (from === 'completed') {
    return { ok: false, message: 'Заявка уже в статусе «Оплачен / Завершён».' };
  }
  if (from === 'archived') {
    return { ok: false, message: 'Сначала смените статус с «Архив» на другой.' };
  }
  if (from !== 'sverka') {
    return {
      ok: false,
      message: `Завершить можно только из «${statusLabel('sverka')}». Сейчас: «${statusLabel(from)}».`,
    };
  }
  return { ok: true };
}

/** Повторное открытие: только из «Оплачен / Завершён» → «На оплату». */
export function assertReopenToAwaitingPaymentTransition(
  fromRaw: string | null | undefined,
): WorkflowGuardResult {
  return assertDirectWorkflowStatusChange(fromRaw, 'awaiting_payment');
}

/**
 * Чек-лист перед переходом в «Оплачен / Завершён»: долг клиента, долг перевозчику
 * (для экспедиции) и налоговый код (см. CLAUDE.md, workflow "Сверка → чек-лист →
 * Завершён"). Логика долга — та же canonical computeClientDueAmd/computeCarrierDueAmd/
 * computeDebtAmd, что уже использует POST /api/trips/[id]/close (аудит нашёл, что этот
 * эндпоинт не вызывается фронтендом — реальная точка входа в "Завершён" сейчас PUT/PATCH,
 * поэтому проверка нужна именно там; см. docs/audit/phase2-lifecycle-status.md TMS-AUDIT-0014).
 */
export function assertTripCompletionAllowed(input: {
  tripType: string | null | undefined;
  clientRateAmd: number;
  carrierRateAmd: number | null | undefined;
  expenses: readonly ExpenseLike[] | null | undefined;
  clientPaidAmountAmd: number;
  carrierPaidAmountAmd: number;
  taxCode: string | null | undefined;
}): WorkflowGuardResult {
  const clientDueAmd = computeClientDueAmd(input.clientRateAmd, input.expenses);
  const carrierDueAmd = computeCarrierDueAmd(input.carrierRateAmd, input.expenses);
  const clientDebt = computeDebtAmd(clientDueAmd, input.clientPaidAmountAmd);
  const carrierDebt = computeDebtAmd(carrierDueAmd, input.carrierPaidAmountAmd);

  const blocking: string[] = [];
  if (clientDebt > 0) {
    blocking.push(`клиент не оплатил полностью (остаток ${Math.round(clientDebt).toLocaleString('ru-RU')} AMD)`);
  }
  if (input.tripType === 'expedition' && carrierDebt > 0) {
    blocking.push(`перевозчику не выплачено полностью (остаток ${Math.round(carrierDebt).toLocaleString('ru-RU')} AMD)`);
  }
  if (!String(input.taxCode ?? '').trim()) {
    blocking.push('не заполнен налоговый код');
  }
  if (blocking.length > 0) {
    return { ok: false, message: `Нельзя завершить заявку: ${blocking.join('; ')}.` };
  }
  return { ok: true };
}

/** Денежные поля, определяющие сумму сделки — заморожены после «Завершён» (см. ниже). */
const FROZEN_ON_COMPLETED_FIELDS = [
  'clientRate',
  'carrierRate',
  'currency',
  'exchangeRate',
  'carrierCurrency',
  'carrierExchangeRate',
  'tripType',
] as const;

function normalizeExpenseForCompare(e: { amount?: unknown; amountAmd?: unknown; currency?: unknown; expenseType?: unknown; description?: unknown }): string {
  return [
    Number(e?.amountAmd ?? e?.amount ?? 0).toFixed(2),
    String(e?.currency ?? ''),
    String(e?.expenseType ?? ''),
    String(e?.description ?? ''),
  ].join('|');
}

function expensesDiffer(
  a: readonly { amount?: unknown; amountAmd?: unknown; currency?: unknown; expenseType?: unknown; description?: unknown }[] | null | undefined,
  b: readonly { amount?: unknown; amountAmd?: unknown; currency?: unknown; expenseType?: unknown; description?: unknown }[] | null | undefined,
): boolean {
  const na = (a ?? []).map(normalizeExpenseForCompare).sort();
  const nb = (b ?? []).map(normalizeExpenseForCompare).sort();
  if (na.length !== nb.length) return true;
  return na.some((v, i) => v !== nb[i]);
}

/**
 * Заморозка финансовых данных завершённой/архивной заявки на уровне API (аудит нашёл,
 * что ставки/расходы/платежи по факту менялись без ограничений даже после "Завершён" —
 * см. docs/audit/phase2-lifecycle-status.md TMS-AUDIT-0016). Архив — блокирует правку
 * целиком (симметрично клиентской formLocked в trip-form.tsx). Завершён — блокирует
 * только денежные поля и смену статуса; налоговый код/примечания/маршрут/документы
 * остаются редактируемыми — это осознанный штатный сценарий ("налоговый код можно
 * внести до отправки в архив", тост в trip-form.tsx после завершения).
 */
export function assertTripFinancialsEditable(
  oldTrip: {
    status: string | null | undefined;
    clientRate: unknown;
    carrierRate: unknown;
    currency: string | null | undefined;
    exchangeRate: unknown;
    carrierCurrency: string | null | undefined;
    carrierExchangeRate: unknown;
    tripType: string | null | undefined;
    expenses?: readonly { amount?: unknown; amountAmd?: unknown; currency?: unknown; expenseType?: unknown; description?: unknown }[] | null;
  },
  body: Record<string, unknown>,
): WorkflowGuardResult {
  const canonical = canonicalWorkflowTripStatus(oldTrip.status);

  if (canonical === 'archived') {
    return {
      ok: false,
      message: 'Заявка в архиве — редактирование запрещено. Сначала верните её из архива («Из архива»).',
    };
  }

  if (canonical !== 'completed') return { ok: true };

  if (body.status !== undefined) {
    const bodyCanonical = canonicalWorkflowTripStatus(String(body.status ?? ''));
    if (bodyCanonical !== 'completed') {
      return {
        ok: false,
        message: 'Заявка завершена — статус меняется только через «Открыть снова» или «В архив».',
      };
    }
  }

  const numDiffers = (key: keyof typeof oldTrip) =>
    key in body && Number((body as any)[key] ?? 0) !== Number(oldTrip[key] ?? 0);
  const strDiffers = (key: keyof typeof oldTrip) =>
    key in body && String((body as any)[key] ?? '') !== String(oldTrip[key] ?? '');

  const blocked =
    numDiffers('clientRate') ||
    numDiffers('carrierRate') ||
    strDiffers('currency') ||
    numDiffers('exchangeRate') ||
    strDiffers('carrierCurrency') ||
    numDiffers('carrierExchangeRate') ||
    strDiffers('tripType') ||
    ('expenses' in body && expensesDiffer(body.expenses as any[], oldTrip.expenses));

  if (blocked) {
    return {
      ok: false,
      message: 'Заявка завершена — ставки/валюты/расходы защищены от изменений. Сначала откройте заявку снова («Открыть снова»).',
    };
  }

  return { ok: true };
}

/** Статус при создании новой заявки. */
export function assertInitialTripWorkflowStatus(status: string | null | undefined): WorkflowGuardResult {
  const canonical = canonicalWorkflowTripStatus(status ?? 'new');
  if (canonical === 'archived' || canonical === 'completed' || canonical === 'cancelled') {
    return {
      ok: false,
      message: 'Новую заявку нельзя создать сразу как завершённую, отменённую или в архиве.',
    };
  }
  if (canonical !== 'new' && canonical !== 'in_progress') {
    return {
      ok: false,
      message: 'Новую заявку можно создать только со статусом «Новый» или «В пути».',
    };
  }
  return { ok: true };
}
