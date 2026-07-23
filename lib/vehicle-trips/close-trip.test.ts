import { describe, it, expect } from 'vitest';
import { vehicleTripFinancialsChanged } from './close-trip';

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
