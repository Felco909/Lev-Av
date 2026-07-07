import { STATUS_ORDER, canonicalWorkflowTripStatus } from '@/lib/utils';
import { TRIP_STATUS_LABELS_RU } from '@/lib/trip-workflow-filters';

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

/** @deprecated use assertReopenToAwaitingPaymentTransition */
export function assertReopenToUnloadedTransition(
  fromRaw: string | null | undefined,
): WorkflowGuardResult {
  return assertReopenToAwaitingPaymentTransition(fromRaw);
}

/** Статус при создании новой заявки. */
export function assertInitialTripWorkflowStatus(status: string | null | undefined): WorkflowGuardResult {
  const canonical = canonicalWorkflowTripStatus(status ?? 'new');
  if (canonical === 'archived' || canonical === 'completed') {
    return {
      ok: false,
      message: 'Новую заявку нельзя создать сразу как завершённую или в архиве.',
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
