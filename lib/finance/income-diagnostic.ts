import { prisma } from '@/lib/prisma';
import { resolveMatchRangeEnd, type VehicleTripBoundaryLike } from '@/lib/vehicle-trips/revenue';
import { getVehicleTripsIncomeAmdBulk } from '@/lib/finance/own-fleet-income';

/**
 * Сравнение старого расчёта дохода рейса (сопоставление заявок по датам,
 * lib/vehicle-trips/revenue.ts) и нового (явная связь Trip.vehicleTripId,
 * lib/finance/own-fleet-income.ts) — "shadow"-диагностика перед переключением
 * каждого потребителя на новый источник (Этап 3 согласованного плана).
 * Ничего не пишет, только считает и классифицирует расхождения.
 */

export interface IncomeDiagnosticRow {
  vehicleTripId: string;
  tripNumber: string;
  plateNumber: string;
  status: string;
  oldRevenueAmd: number;
  newRevenueAmd: number;
  diffAmd: number;
  reason: 'match' | 'awaiting_link' | 'linked_outside_date_window' | 'needs_manual_review';
  reasonText: string;
}

function amd(t: { clientRateAmd: unknown; clientRate: unknown }): number {
  return Number(t.clientRateAmd ?? t.clientRate ?? 0);
}

export async function compareIncomeCalculations(): Promise<IncomeDiagnosticRow[]> {
  const allVts = await prisma.vehicleTrip.findMany({
    select: {
      id: true, vehicleId: true, departureDate: true, returnDate: true, tripNumber: true, status: true,
      vehicle: { select: { plateNumber: true } },
    },
  });
  const boundaries: VehicleTripBoundaryLike[] = allVts;

  const newIncomeMap = await getVehicleTripsIncomeAmdBulk(allVts.map((v) => v.id));

  const rows: IncomeDiagnosticRow[] = [];
  for (const vt of allVts) {
    const rangeEnd = resolveMatchRangeEnd(vt, boundaries);
    const oldTrips = await prisma.trip.findMany({
      where: { vehicleId: vt.vehicleId, tripDate: { gte: vt.departureDate, lte: rangeEnd } },
      select: { clientRateAmd: true, clientRate: true },
    });
    const oldRevenueAmd = oldTrips.reduce((s, t) => s + amd(t), 0);
    const newRevenueAmd = newIncomeMap.get(vt.id) ?? 0;
    const diffAmd = Math.round((newRevenueAmd - oldRevenueAmd) * 100) / 100;

    let reason: IncomeDiagnosticRow['reason'] = 'match';
    let reasonText = 'Совпадает';
    if (Math.abs(diffAmd) >= 1) {
      if (diffAmd < 0) {
        // Новый меньше старого — вероятно, часть заявок, которые старый алгоритм
        // находил по датам, ещё не привязана явно (см. "Ожидают привязки").
        const unlinkedInWindow = await prisma.trip.count({
          where: { vehicleId: vt.vehicleId, vehicleTripId: null, tripDate: { gte: vt.departureDate, lte: rangeEnd } },
        });
        reason = unlinkedInWindow > 0 ? 'awaiting_link' : 'needs_manual_review';
        reasonText = unlinkedInWindow > 0
          ? `${unlinkedInWindow} заявок ещё не привязано явно к рейсу (см. "Ожидают привязки")`
          : 'Не объясняется ожидающими привязки заявками — требует ручной проверки';
      } else {
        // Новый больше старого — вероятно, к рейсу привязана заявка с датой ВНЕ
        // окна, которое находил старый алгоритм (осознанный перенос диспетчером).
        reason = 'linked_outside_date_window';
        reasonText = 'К рейсу привязана заявка с датой вне окна старого алгоритма (ручная привязка/перенос)';
      }
    }

    rows.push({
      vehicleTripId: vt.id,
      tripNumber: vt.tripNumber,
      plateNumber: vt.vehicle.plateNumber,
      status: vt.status,
      oldRevenueAmd: Math.round(oldRevenueAmd * 100) / 100,
      newRevenueAmd: Math.round(newRevenueAmd * 100) / 100,
      diffAmd,
      reason,
      reasonText,
    });
  }
  return rows;
}
