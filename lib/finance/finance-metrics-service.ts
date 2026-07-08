import {
  computeCashGapAmd,
  computeDebtAmd,
  computeExpeditionProfitAmd,
  computeOverdueFlag,
  computeOwnTransportProfitAmd,
  computePaymentStatus,
  roundMoney,
  splitExpensesAmd,
} from '@/lib/finance/formulas';
import { CANONICAL_FORMULAS, CANONICAL_PAYMENT_STATUSES, FINANCE_CONTRACT_VERSION } from '@/lib/finance/finance-contract';
import type {
  FinanceAggregateMetrics,
  FinancePaymentInput,
  FinanceTripInput,
  TripFinanceMetrics,
} from '@/lib/finance/types';

export function getTripSplitExpenseTotalsAmd(trip: any): {
  clientExtraAmd: number;
  carrierExtraAmd: number;
} {
  // trip.expenses — реальная связь Prisma; сторона расхода определяется маркером
  // description === '__carrier__' (см. splitExpensesAmd / CLAUDE.md). Поля
  // trip.client_expenses / trip.carrier_expenses на записи из БД не существуют —
  // раньше это делало clientExtraAmd всегда нулём, а все расходы (включая клиентские)
  // попадали в "перевозчицкую" сумму и вычитались из прибыли.
  const { clientExpensesAmd, carrierExpensesAmd } = splitExpensesAmd(
    Array.isArray(trip?.expenses) ? trip.expenses : [],
  );

  return {
    clientExtraAmd: clientExpensesAmd,
    carrierExtraAmd: carrierExpensesAmd,
  };
}

function sumPaymentsAmd(payments: FinancePaymentInput[], tripId: string, type: 'client' | 'carrier'): number {
  return roundMoney(
    payments
      .filter((p) => p.tripId === tripId && p.type === type)
      .reduce((acc, p) => acc + (Number(p.amountAmd) || 0), 0)
  );
}

export function computeTripFinanceMetrics(trip: FinanceTripInput, payments: FinancePaymentInput[]): TripFinanceMetrics {
  const clientPaidAmd = sumPaymentsAmd(payments, trip.tripId, 'client');
  const carrierPaidAmd = sumPaymentsAmd(payments, trip.tripId, 'carrier');

  const clientDebtAmd = computeDebtAmd(trip.clientRateAmd, clientPaidAmd);
  const carrierDebtAmd = computeDebtAmd(trip.carrierRateAmd, carrierPaidAmd);
  const clientPaymentStatus = computePaymentStatus(trip.clientRateAmd, clientPaidAmd);
  const carrierPaymentStatus = computePaymentStatus(trip.carrierRateAmd, carrierPaidAmd);

  const profitAmd =
    trip.tripType === 'expedition'
      ? computeExpeditionProfitAmd(trip.clientRateAmd, trip.carrierRateAmd, trip.expensesAmd)
      : computeOwnTransportProfitAmd(trip.clientRateAmd, trip.expensesAmd);

  const cashGapAmd = trip.tripType === 'expedition' ? computeCashGapAmd(clientPaidAmd, carrierPaidAmd) : 0;

  return {
    tripId: trip.tripId,
    tripNumber: trip.tripNumber,
    tripType: trip.tripType,
    clientPaidAmd,
    carrierPaidAmd,
    clientDebtAmd,
    carrierDebtAmd,
    clientPaymentStatus,
    carrierPaymentStatus,
    clientOverdue: computeOverdueFlag(trip.clientDueDate, clientDebtAmd, trip.status),
    carrierOverdue: computeOverdueFlag(trip.carrierDueDate, carrierDebtAmd, trip.status),
    profitAmd,
    cashGapAmd,
  };
}

export function computeAggregateMetrics(rows: TripFinanceMetrics[]): FinanceAggregateMetrics {
  const totalClientDebtAmd = roundMoney(rows.reduce((acc, r) => acc + r.clientDebtAmd, 0));
  const totalCarrierDebtAmd = roundMoney(
    rows.filter((r) => r.tripType === 'expedition').reduce((acc, r) => acc + r.carrierDebtAmd, 0)
  );
  const totalProfitAmd = roundMoney(rows.reduce((acc, r) => acc + r.profitAmd, 0));
  const totalCashGapAmd = roundMoney(
    rows.filter((r) => r.tripType === 'expedition').reduce((acc, r) => acc + r.cashGapAmd, 0)
  );
  const overdueClientCount = rows.filter((r) => r.clientOverdue).length;
  const overdueCarrierCount = rows.filter((r) => r.carrierOverdue).length;

  return {
    totalClientDebtAmd,
    totalCarrierDebtAmd,
    totalProfitAmd,
    totalCashGapAmd,
    overdueClientCount,
    overdueCarrierCount,
  };
}

export interface FinanceMetricRow extends TripFinanceMetrics {
  clientRateAmd: number;
  carrierRateAmd: number;
  expensesAmd: number;
}

export interface FinanceBreakdownTotals {
  totalIncomeAmd: number;
  totalExpenseAmd: number;
  ownTransport: {
    incomeAmd: number;
    expenseAmd: number;
    profitAmd: number;
  };
  expedition: {
    incomeAmd: number;
    expenseAmd: number;
    profitAmd: number;
    clientDebtAmd: number;
    carrierDebtAmd: number;
    cashGapAmd: number;
  };
}

/**
 * Computes canonical per-trip finance rows from trip/payment inputs.
 * Keep this as a single entrypoint for API modules to avoid formula drift.
 */
export function computeMetricRowsForTrips(
  trips: FinanceTripInput[],
  payments: FinancePaymentInput[]
): FinanceMetricRow[] {
  return trips.map((trip) => {
    const metrics = computeTripFinanceMetrics(trip, payments);
    return {
      ...metrics,
      clientRateAmd: roundMoney(trip.clientRateAmd),
      carrierRateAmd: roundMoney(trip.carrierRateAmd),
      expensesAmd: roundMoney(trip.expensesAmd),
    };
  });
}

/**
 * Canonical financial totals intended for dashboard/debts/reports reuse.
 * All totals are AMD and rounded with roundMoney.
 */
export function computeBreakdownTotals(rows: FinanceMetricRow[]): FinanceBreakdownTotals {
  const ownRows = rows.filter((r) => r.tripType !== 'expedition');
  const expeditionRows = rows.filter((r) => r.tripType === 'expedition');

  const ownIncome = ownRows.reduce((acc, r) => acc + r.clientRateAmd, 0);
  const ownExpense = ownRows.reduce((acc, r) => acc + r.expensesAmd, 0);
  const ownProfit = ownRows.reduce((acc, r) => acc + r.profitAmd, 0);

  const expIncome = expeditionRows.reduce((acc, r) => acc + r.clientRateAmd, 0);
  const expExpense = expeditionRows.reduce((acc, r) => acc + r.carrierRateAmd + r.expensesAmd, 0);
  const expProfit = expeditionRows.reduce((acc, r) => acc + r.profitAmd, 0);
  const expClientDebt = expeditionRows.reduce((acc, r) => acc + r.clientDebtAmd, 0);
  const expCarrierDebt = expeditionRows.reduce((acc, r) => acc + r.carrierDebtAmd, 0);
  const expCashGap = expeditionRows.reduce((acc, r) => acc + r.cashGapAmd, 0);

  return {
    totalIncomeAmd: roundMoney(rows.reduce((acc, r) => acc + r.clientRateAmd, 0)),
    totalExpenseAmd: roundMoney(rows.reduce((acc, r) => acc + r.expensesAmd + (r.tripType === 'expedition' ? r.carrierRateAmd : 0), 0)),
    ownTransport: {
      incomeAmd: roundMoney(ownIncome),
      expenseAmd: roundMoney(ownExpense),
      profitAmd: roundMoney(ownProfit),
    },
    expedition: {
      incomeAmd: roundMoney(expIncome),
      expenseAmd: roundMoney(expExpense),
      profitAmd: roundMoney(expProfit),
      clientDebtAmd: roundMoney(expClientDebt),
      carrierDebtAmd: roundMoney(expCarrierDebt),
      cashGapAmd: roundMoney(expCashGap),
    },
  };
}

export interface FinanceValidationWarning {
  tripId: string;
  tripNumber: string;
  contractVersion: string;
  field: keyof Pick<
    TripFinanceMetrics,
    'clientDebtAmd' | 'carrierDebtAmd' | 'clientPaymentStatus' | 'carrierPaymentStatus' | 'profitAmd' | 'cashGapAmd'
  >;
  expected: string | number;
  actual: string | number;
  formulaKey:
    | keyof typeof CANONICAL_FORMULAS
    | 'payment_status_enum';
}

/**
 * Passive internal validation against canonical contract formulas.
 * Read-only: no writes, no side effects, no throws.
 */
export function validateMetricsAgainstContract(
  trip: FinanceTripInput,
  metrics: TripFinanceMetrics
): FinanceValidationWarning[] {
  const warnings: FinanceValidationWarning[] = [];

  const expectedClientDebt = computeDebtAmd(trip.clientRateAmd, metrics.clientPaidAmd);
  if (roundMoney(metrics.clientDebtAmd) !== roundMoney(expectedClientDebt)) {
    warnings.push({
      tripId: trip.tripId,
      tripNumber: trip.tripNumber,
      contractVersion: FINANCE_CONTRACT_VERSION,
      field: 'clientDebtAmd',
      expected: expectedClientDebt,
      actual: metrics.clientDebtAmd,
      formulaKey: 'client_debt_amd',
    });
  }

  const expectedCarrierDebt = computeDebtAmd(trip.carrierRateAmd, metrics.carrierPaidAmd);
  if (roundMoney(metrics.carrierDebtAmd) !== roundMoney(expectedCarrierDebt)) {
    warnings.push({
      tripId: trip.tripId,
      tripNumber: trip.tripNumber,
      contractVersion: FINANCE_CONTRACT_VERSION,
      field: 'carrierDebtAmd',
      expected: expectedCarrierDebt,
      actual: metrics.carrierDebtAmd,
      formulaKey: 'carrier_debt_amd',
    });
  }

  const expectedClientStatus = computePaymentStatus(trip.clientRateAmd, metrics.clientPaidAmd);
  if (metrics.clientPaymentStatus !== expectedClientStatus) {
    warnings.push({
      tripId: trip.tripId,
      tripNumber: trip.tripNumber,
      contractVersion: FINANCE_CONTRACT_VERSION,
      field: 'clientPaymentStatus',
      expected: expectedClientStatus,
      actual: metrics.clientPaymentStatus,
      formulaKey: 'client_payment_status',
    });
  }

  const expectedCarrierStatus = computePaymentStatus(trip.carrierRateAmd, metrics.carrierPaidAmd);
  if (metrics.carrierPaymentStatus !== expectedCarrierStatus) {
    warnings.push({
      tripId: trip.tripId,
      tripNumber: trip.tripNumber,
      contractVersion: FINANCE_CONTRACT_VERSION,
      field: 'carrierPaymentStatus',
      expected: expectedCarrierStatus,
      actual: metrics.carrierPaymentStatus,
      formulaKey: 'carrier_payment_status',
    });
  }

  if (!CANONICAL_PAYMENT_STATUSES.includes(metrics.clientPaymentStatus)) {
    warnings.push({
      tripId: trip.tripId,
      tripNumber: trip.tripNumber,
      contractVersion: FINANCE_CONTRACT_VERSION,
      field: 'clientPaymentStatus',
      expected: CANONICAL_PAYMENT_STATUSES.join(','),
      actual: metrics.clientPaymentStatus,
      formulaKey: 'payment_status_enum',
    });
  }
  if (!CANONICAL_PAYMENT_STATUSES.includes(metrics.carrierPaymentStatus)) {
    warnings.push({
      tripId: trip.tripId,
      tripNumber: trip.tripNumber,
      contractVersion: FINANCE_CONTRACT_VERSION,
      field: 'carrierPaymentStatus',
      expected: CANONICAL_PAYMENT_STATUSES.join(','),
      actual: metrics.carrierPaymentStatus,
      formulaKey: 'payment_status_enum',
    });
  }

  const expectedProfit =
    trip.tripType === 'expedition'
      ? computeExpeditionProfitAmd(trip.clientRateAmd, trip.carrierRateAmd, trip.expensesAmd)
      : computeOwnTransportProfitAmd(trip.clientRateAmd, trip.expensesAmd);
  if (roundMoney(metrics.profitAmd) !== roundMoney(expectedProfit)) {
    warnings.push({
      tripId: trip.tripId,
      tripNumber: trip.tripNumber,
      contractVersion: FINANCE_CONTRACT_VERSION,
      field: 'profitAmd',
      expected: expectedProfit,
      actual: metrics.profitAmd,
      formulaKey: trip.tripType === 'expedition' ? 'expedition_profit_amd' : 'own_transport_profit_amd',
    });
  }

  const expectedCashGap = trip.tripType === 'expedition'
    ? computeCashGapAmd(metrics.clientPaidAmd, metrics.carrierPaidAmd)
    : 0;
  if (roundMoney(metrics.cashGapAmd) !== roundMoney(expectedCashGap)) {
    warnings.push({
      tripId: trip.tripId,
      tripNumber: trip.tripNumber,
      contractVersion: FINANCE_CONTRACT_VERSION,
      field: 'cashGapAmd',
      expected: expectedCashGap,
      actual: metrics.cashGapAmd,
      formulaKey: 'cash_gap_amd',
    });
  }

  return warnings;
}
