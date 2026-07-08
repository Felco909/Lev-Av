import type { PaymentStatus } from '@/lib/finance/types';
import { computeIsClientPaymentOverdue, paymentDueDateToYmd } from '@/lib/client-overdue-logic';

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function computeDebtAmd(rateAmd: number, paidAmd: number): number {
  return round2(Math.max(0, (Number(rateAmd) || 0) - (Number(paidAmd) || 0)));
}

export function computePaymentStatus(rateAmd: number, paidAmd: number): PaymentStatus {
  const due = Math.max(0, Number(rateAmd) || 0);
  const paid = Math.max(0, Number(paidAmd) || 0);
  if (paid <= 0) return 'not_paid';
  if (paid >= due) return 'paid';
  return 'partially_paid';
}

export function computeExpeditionProfitAmd(clientRateAmd: number, carrierRateAmd: number, expensesAmd: number): number {
  return round2((Number(clientRateAmd) || 0) - (Number(carrierRateAmd) || 0) - (Number(expensesAmd) || 0));
}

export function computeOwnTransportProfitAmd(clientRateAmd: number, ownExpensesAmd: number): number {
  return round2((Number(clientRateAmd) || 0) - (Number(ownExpensesAmd) || 0));
}

/**
 * Расход, привязанный к заявке — минимальная форма, нужная для разбора по стороне.
 * amountAmd принимает number/string/Prisma Decimal (структурно, без импорта типа
 * из @prisma/client, чтобы этот модуль оставался безопасным для клиентского бандла).
 */
export interface ExpenseLike {
  amountAmd: number | string | null | undefined | { toString(): string };
  description?: string | null;
}

/**
 * Маркер "перевозчицкой" стороны расхода в свободном текстовом поле description.
 * См. CLAUDE.md — известная особенность модели Expense (нет отдельного поля "сторона").
 */
export const CARRIER_EXPENSE_MARKER = '__carrier__';

/** Единое место разбора расходов заявки на клиентскую/перевозчицкую сторону. */
export function splitExpensesAmd(expenses: readonly ExpenseLike[] | null | undefined): {
  clientExpensesAmd: number;
  carrierExpensesAmd: number;
} {
  let clientExpensesAmd = 0;
  let carrierExpensesAmd = 0;
  for (const e of expenses ?? []) {
    const amt = Number(e?.amountAmd) || 0;
    if (e?.description === CARRIER_EXPENSE_MARKER) carrierExpensesAmd += amt;
    else clientExpensesAmd += amt;
  }
  return { clientExpensesAmd: round2(clientExpensesAmd), carrierExpensesAmd: round2(carrierExpensesAmd) };
}

/**
 * Единая формула прибыли по заявке (см. CLAUDE.md — "Финансовая логика").
 * Одна и та же для own_transport и expedition: для own_transport carrierRateAmd
 * и carrierExpensesAmd естественно равны 0, т.к. нет перевозчика.
 * Доп. расходы (клиентские и перевозчицкие) — перевыставляемые, поэтому клиентские
 * прибавляются к клиентской части, а не вычитаются.
 */
export function computeTripProfitAmd(params: {
  clientRateAmd: number;
  carrierRateAmd?: number | null;
  expenses: readonly ExpenseLike[] | null | undefined;
}): number {
  const { clientExpensesAmd, carrierExpensesAmd } = splitExpensesAmd(params.expenses);
  const totalClientAmd = round2((Number(params.clientRateAmd) || 0) + clientExpensesAmd);
  const totalCarrierAmd = round2((Number(params.carrierRateAmd) || 0) + carrierExpensesAmd);
  return round2(totalClientAmd - totalCarrierAmd);
}

/**
 * Сколько клиент реально должен заплатить по заявке — ставка плюс
 * перевыставляемые клиентские расходы (см. computeTripProfitAmd).
 * Используется для долга/статуса оплаты (recalcTripPayments в
 * app/api/payments/route.ts, инлайн-редактирование в trips/[id]/route.ts) —
 * должно совпадать с тем, что фактически прибавляется к прибыли.
 */
export function computeClientDueAmd(clientRateAmd: number, expenses: readonly ExpenseLike[] | null | undefined): number {
  const { clientExpensesAmd } = splitExpensesAmd(expenses);
  return round2((Number(clientRateAmd) || 0) + clientExpensesAmd);
}

/** То же самое для стороны перевозчика (см. computeClientDueAmd). */
export function computeCarrierDueAmd(carrierRateAmd: number | null | undefined, expenses: readonly ExpenseLike[] | null | undefined): number {
  const { carrierExpensesAmd } = splitExpensesAmd(expenses);
  return round2((Number(carrierRateAmd) || 0) + carrierExpensesAmd);
}

export function computeCashGapAmd(clientPaidAmd: number, carrierPaidAmd: number): number {
  return round2(Math.max(0, (Number(carrierPaidAmd) || 0) - (Number(clientPaidAmd) || 0)));
}

export function computeOverdueFlag(
  dueDate: Date | string | null | undefined,
  debtAmd: number,
  tripStatus?: string | null
): boolean {
  return computeIsClientPaymentOverdue({
    status: tripStatus,
    paymentDueDateYmd: paymentDueDateToYmd(dueDate ?? null),
    remainderAmd: debtAmd,
    today: new Date(),
  });
}

export function roundMoney(value: number): number {
  return round2(value);
}
