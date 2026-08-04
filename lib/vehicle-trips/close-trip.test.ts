import { describe, it, expect } from 'vitest';
import { vehicleTripFinancialsChanged, computeVehicleTripExpensesAmd } from './close-trip';

describe('vehicleTripFinancialsChanged (Этап 2 — когда PUT/POST /api/vehicle-trips требует роль)', () => {
  const before = {
    salaryAmd: 800000, perDiemAmd: 100000, perDiem2Amd: 0, perDiem3Amd: 0, perDiem4Amd: 0,
    otherExpensesAmd: 0, fuelCostAmd: 250000,
  };

  it('is false when only non-financial fields are in the diff (dates/status/vehicle/notes)', () => {
    // Карточка рейса шлёт ВСЕ денежные поля разом, пересчитанные из тех же значений —
    // т.е. они присутствуют в data, но численно совпадают с уже сохранёнными.
    const data = { ...before, status: 'archived', vehicleId: 'v2', departureDate: new Date(), notes: 'смена машины' };
    expect(vehicleTripFinancialsChanged(before, data)).toBe(false);
  });

  it('is true when salary actually changes', () => {
    const data = { ...before, salaryAmd: 850000 };
    expect(vehicleTripFinancialsChanged(before, data)).toBe(true);
  });

  it('is true when any of the 4 per-diem slots changes', () => {
    expect(vehicleTripFinancialsChanged(before, { ...before, perDiem2Amd: 15000 })).toBe(true);
    expect(vehicleTripFinancialsChanged(before, { ...before, perDiem4Amd: 5000 })).toBe(true);
  });

  it('is true when fuel cost changes', () => {
    expect(vehicleTripFinancialsChanged(before, { ...before, fuelCostAmd: 260000 })).toBe(true);
  });

  it('is false for tiny rounding noise under 1 cent (Decimal round-trip)', () => {
    expect(vehicleTripFinancialsChanged(before, { ...before, salaryAmd: 800000.004 })).toBe(false);
  });

  it('treats before=null (create) as all-zero — flags any non-zero financial field', () => {
    expect(vehicleTripFinancialsChanged(null, { salaryAmd: 500000 })).toBe(true);
    expect(vehicleTripFinancialsChanged(null, { status: 'active', vehicleId: 'v1' })).toBe(false);
  });

  it('ignores a financial field that is absent from data entirely (not being written)', () => {
    expect(vehicleTripFinancialsChanged(before, { status: 'active' })).toBe(false);
  });
});

describe('computeVehicleTripExpensesAmd (RC-1 — fuel cost is part of the trip expense sum)', () => {
  it('sums salary + all 4 per-diem slots + other + fuel + FleetExpense rows', () => {
    const total = computeVehicleTripExpensesAmd({
      salaryAmd: 800000,
      perDiemAmd: 50000, perDiem2Amd: 20000, perDiem3Amd: 0, perDiem4Amd: 10000,
      otherExpensesAmd: 15000,
      fuelCostAmd: 250000,
      fleetExpenses: [{ amountAmd: 30000 }, { amountAmd: 5000 }],
    });
    expect(total).toBe(800000 + 50000 + 20000 + 0 + 10000 + 15000 + 250000 + 30000 + 5000);
  });

  it('treats fuelCostAmd as the sole fuel source — a fleet expense row does not double as fuel', () => {
    // Regression guard for the fuel-data migration (CLAUDE.md): FleetExpense rows
    // (even expenseType='fuel') are a separate spend stream and must never be read
    // as fuel cost — they are summed here only as generic fleet overhead, alongside
    // (not instead of) fuelCostAmd.
    const withFuelRecord = computeVehicleTripExpensesAmd({
      salaryAmd: 0, perDiemAmd: 0, perDiem2Amd: 0, perDiem3Amd: 0, perDiem4Amd: 0,
      otherExpensesAmd: 0, fuelCostAmd: 100000,
      fleetExpenses: [{ amountAmd: 40000 }],
    });
    expect(withFuelRecord).toBe(140000); // 100000 fuel + 40000 fleet overhead, not one replacing the other
  });

  it('treats null/undefined numeric fields as 0', () => {
    const total = computeVehicleTripExpensesAmd({
      salaryAmd: null, perDiemAmd: undefined, perDiem2Amd: null, perDiem3Amd: null, perDiem4Amd: null,
      otherExpensesAmd: null, fuelCostAmd: null,
      fleetExpenses: [],
    });
    expect(total).toBe(0);
  });

  it('accepts Prisma Decimal-like values (structural toString/valueOf)', () => {
    const decimalLike = { toString: () => '12345.5' } as any;
    const total = computeVehicleTripExpensesAmd({
      salaryAmd: decimalLike, perDiemAmd: 0, perDiem2Amd: 0, perDiem3Amd: 0, perDiem4Amd: 0,
      otherExpensesAmd: 0, fuelCostAmd: 0,
      fleetExpenses: [],
    });
    expect(total).toBe(12345.5);
  });
});
