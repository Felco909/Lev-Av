import { describe, it, expect } from 'vitest';
import { groupDebtRows, sumDebt, sumCashGap, type DebtTripRow } from './debts-service';

function row(overrides: Partial<DebtTripRow>): DebtTripRow {
  return {
    id: 'trip-1',
    tripNumber: 'TMS-2026-0001',
    routeFrom: 'A',
    routeTo: 'B',
    rateAmd: 1000,
    paidAmd: 0,
    remaining: 1000,
    tripDate: '2026-01-01',
    status: 'unloaded',
    paymentDueDate: null,
    daysLeft: null,
    isOverdue: false,
    isUrgent: false,
    cashGap: 0,
    entityId: 'client-1',
    entityName: 'Client One',
    ...overrides,
  };
}

describe('sumDebt', () => {
  it('sums the remaining field across rows, rounded to 2 decimals', () => {
    expect(sumDebt([row({ remaining: 100.005 }), row({ remaining: 50 })])).toBe(150.01);
  });

  it('is 0 for an empty list', () => {
    expect(sumDebt([])).toBe(0);
  });
});

describe('sumCashGap', () => {
  it('sums the cashGap field, treating missing/zero as 0', () => {
    expect(sumCashGap([row({ cashGap: 300 }), row({ cashGap: 0 })])).toBe(300);
  });
});

describe('groupDebtRows', () => {
  it('groups rows by entityId and sums totalDebt per group', () => {
    const rows = [
      row({ id: 't1', entityId: 'c1', entityName: 'Client One', remaining: 500 }),
      row({ id: 't2', entityId: 'c1', entityName: 'Client One', remaining: 300 }),
      row({ id: 't3', entityId: 'c2', entityName: 'Client Two', remaining: 1000 }),
    ];
    const grouped = groupDebtRows(rows);
    expect(grouped).toHaveLength(2);
    const c1 = grouped.find((g) => g.entity.id === 'c1')!;
    expect(c1.totalDebt).toBe(800);
    expect(c1.trips).toHaveLength(2);
  });

  it('sorts groups by totalDebt descending (biggest debtor first)', () => {
    const rows = [
      row({ id: 't1', entityId: 'small', remaining: 100 }),
      row({ id: 't2', entityId: 'big', remaining: 10000 }),
    ];
    const grouped = groupDebtRows(rows);
    expect(grouped[0].entity.id).toBe('big');
    expect(grouped[1].entity.id).toBe('small');
  });

  it('returns an empty array for no rows', () => {
    expect(groupDebtRows([])).toEqual([]);
  });
});
