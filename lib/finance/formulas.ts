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
