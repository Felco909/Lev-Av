import { describe, it, expect } from 'vitest';
import {
  computeDebtAmd,
  computePaymentStatus,
  splitExpensesAmd,
  computeTripProfitAmd,
  computeClientDueAmd,
  computeCarrierDueAmd,
  computeCashGapAmd,
  computeOverdueFlag,
  computeExpeditionProfitAmd,
  computeOwnTransportProfitAmd,
  roundMoney,
  computeCostPerKmAmd,
  computeProfitabilityRatio,
  computeProfitPerKmAmd,
  CARRIER_EXPENSE_MARKER,
  type ExpenseLike,
} from './formulas';

const clientExpense = (amountAmd: number): ExpenseLike => ({ amountAmd, description: 'fuel' });
const carrierExpense = (amountAmd: number): ExpenseLike => ({ amountAmd, description: CARRIER_EXPENSE_MARKER });

describe('splitExpensesAmd', () => {
  it('splits by the __carrier__ marker, everything else counts as client', () => {
    const result = splitExpensesAmd([clientExpense(50), carrierExpense(30), clientExpense(20)]);
    expect(result).toEqual({ clientExpensesAmd: 70, carrierExpensesAmd: 30 });
  });

  it('treats an empty description as client-side', () => {
    const result = splitExpensesAmd([{ amountAmd: 100, description: '' }]);
    expect(result).toEqual({ clientExpensesAmd: 100, carrierExpensesAmd: 0 });
  });

  it('handles null/undefined/empty expenses', () => {
    expect(splitExpensesAmd(null)).toEqual({ clientExpensesAmd: 0, carrierExpensesAmd: 0 });
    expect(splitExpensesAmd(undefined)).toEqual({ clientExpensesAmd: 0, carrierExpensesAmd: 0 });
    expect(splitExpensesAmd([])).toEqual({ clientExpensesAmd: 0, carrierExpensesAmd: 0 });
  });

  it('accepts Prisma Decimal-like values (structural toString)', () => {
    const decimalLike = { toString: () => '42.5' };
    const result = splitExpensesAmd([{ amountAmd: decimalLike as any, description: 'toll' }]);
    expect(result.clientExpensesAmd).toBe(42.5);
  });
});

describe('computeTripProfitAmd — expedition (item 1.1 regression)', () => {
  it('adds client expenses and subtracts carrier rate + carrier expenses', () => {
    // (1000 client rate + 50 client expense) - (700 carrier rate + 30 carrier expense) = 320
    const profit = computeTripProfitAmd({
      clientRateAmd: 1000,
      carrierRateAmd: 700,
      expenses: [clientExpense(50), carrierExpense(30)],
    });
    expect(profit).toBe(320);
  });

  it('matches a plain expedition with no expenses', () => {
    const profit = computeTripProfitAmd({ clientRateAmd: 1000, carrierRateAmd: 700, expenses: [] });
    expect(profit).toBe(300);
  });
});

describe('computeTripProfitAmd — own_transport (client expenses are billable, not a cost)', () => {
  it('adds the client expense to profit rather than subtracting it', () => {
    // 500 client rate + 40 client expense, no carrier at all -> 540
    const profit = computeTripProfitAmd({
      clientRateAmd: 500,
      carrierRateAmd: null,
      expenses: [clientExpense(40)],
    });
    expect(profit).toBe(540);
  });

  it('carrierRateAmd omitted entirely behaves the same as null', () => {
    const profit = computeTripProfitAmd({ clientRateAmd: 500, expenses: [clientExpense(40)] });
    expect(profit).toBe(540);
  });
});

describe('computeClientDueAmd / computeCarrierDueAmd', () => {
  it('client due = rate + client expenses', () => {
    expect(computeClientDueAmd(1000, [clientExpense(50), carrierExpense(30)])).toBe(1050);
  });

  it('carrier due = rate + carrier expenses', () => {
    expect(computeCarrierDueAmd(700, [clientExpense(50), carrierExpense(30)])).toBe(730);
  });

  it('carrier due handles a null/undefined carrier rate (own_transport)', () => {
    expect(computeCarrierDueAmd(null, [carrierExpense(30)])).toBe(30);
    expect(computeCarrierDueAmd(undefined, [])).toBe(0);
  });
});

describe('computeDebtAmd', () => {
  it('is rate minus paid, floored at zero', () => {
    expect(computeDebtAmd(1000, 400)).toBe(600);
    expect(computeDebtAmd(1000, 1500)).toBe(0);
  });
});

describe('computePaymentStatus', () => {
  it('not_paid when nothing has been paid', () => {
    expect(computePaymentStatus(1000, 0)).toBe('not_paid');
  });

  it('partially_paid when paid is between zero and due', () => {
    expect(computePaymentStatus(1000, 500)).toBe('partially_paid');
  });

  it('paid when paid meets or exceeds due', () => {
    expect(computePaymentStatus(1000, 1000)).toBe('paid');
    expect(computePaymentStatus(1000, 1200)).toBe('paid');
  });

  it('zero due with zero paid is not_paid, not paid (avoids a 0>=0 false "paid")', () => {
    // regression guard: computePaymentStatus checks `paid <= 0` first, so a trip
    // with no rate and no payment should read as not_paid, not paid.
    expect(computePaymentStatus(0, 0)).toBe('not_paid');
  });
});

describe('computeCashGapAmd', () => {
  it('is the excess of carrier-paid over client-paid, floored at zero', () => {
    expect(computeCashGapAmd(100, 400)).toBe(300);
    expect(computeCashGapAmd(400, 100)).toBe(0);
  });
});

describe('computeOverdueFlag', () => {
  it('is not overdue when there is no remaining debt', () => {
    expect(computeOverdueFlag('2026-01-01', 0, 'completed')).toBe(false);
  });

  it('is overdue when due date is in the past, debt remains, and status is not excluded', () => {
    expect(computeOverdueFlag('2026-01-01', 1000, 'completed')).toBe(true);
  });

  it('is not overdue when due date is in the future', () => {
    expect(computeOverdueFlag('2099-01-01', 1000, 'completed')).toBe(false);
  });

  it('excludes new/in_progress/archived trips regardless of date', () => {
    expect(computeOverdueFlag('2026-01-01', 1000, 'new')).toBe(false);
    expect(computeOverdueFlag('2026-01-01', 1000, 'in_progress')).toBe(false);
    expect(computeOverdueFlag('2026-01-01', 1000, 'archived')).toBe(false);
  });

  it('is not overdue when there is no due date at all', () => {
    expect(computeOverdueFlag(null, 1000, 'completed')).toBe(false);
  });
});

describe('computeExpeditionProfitAmd (finance-metrics-service module — NOT the same as computeTripProfitAmd, see CLAUDE.md)', () => {
  it('is client rate minus carrier rate minus expenses', () => {
    expect(computeExpeditionProfitAmd(1000, 700, 50)).toBe(250);
  });

  it('treats missing/null inputs as zero', () => {
    expect(computeExpeditionProfitAmd(1000, 0, 0)).toBe(1000);
  });
});

describe('computeOwnTransportProfitAmd (finance-metrics-service module)', () => {
  it('is client rate minus own expenses (no carrier side at all)', () => {
    expect(computeOwnTransportProfitAmd(1000, 300)).toBe(700);
  });
});

describe('roundMoney', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundMoney(100.005)).toBe(100.01);
    expect(roundMoney(100.004)).toBe(100);
  });

  it('treats NaN/undefined-like input as 0', () => {
    expect(roundMoney(Number('not-a-number'))).toBe(0);
  });
});

describe('computeCostPerKmAmd (vehicle-analytics, Этап 8)', () => {
  it('is total expenses divided by mileage', () => {
    expect(computeCostPerKmAmd(100000, 1000)).toBe(100);
  });

  it('is 0 when mileage is 0 (avoids division by zero)', () => {
    expect(computeCostPerKmAmd(100000, 0)).toBe(0);
  });
});

describe('computeProfitabilityRatio (vehicle-analytics, Этап 8)', () => {
  it('is profit / revenue as a percentage', () => {
    expect(computeProfitabilityRatio(250, 1000)).toBe(25);
  });

  it('is 0 when revenue is 0 (avoids division by zero)', () => {
    expect(computeProfitabilityRatio(250, 0)).toBe(0);
  });

  it('can exceed 100% (revenue smaller than profit is not physically expected, but the formula does not clamp)', () => {
    expect(computeProfitabilityRatio(1500, 1000)).toBe(150);
  });
});

describe('computeProfitPerKmAmd', () => {
  it('is profit divided by mileage', () => {
    expect(computeProfitPerKmAmd(50000, 1000)).toBe(50);
  });

  it('is 0 when mileage is 0', () => {
    expect(computeProfitPerKmAmd(50000, 0)).toBe(0);
  });

  it('can be negative for a lossy vehicle', () => {
    expect(computeProfitPerKmAmd(-20000, 1000)).toBe(-20);
  });
});
