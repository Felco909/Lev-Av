export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { computeAggregateMetrics, computeBreakdownTotals, computeMetricRowsForTrips, getTripSplitExpenseTotalsAmd } from '@/lib/finance/finance-metrics-service';
import type { FinancePaymentInput, FinanceTripInput } from '@/lib/finance/types';
import { computeVehicleTripExpensesAmd } from '@/lib/vehicle-trips/close-trip';
import { getVehicleTripsIncomeAmdBulk } from '@/lib/finance/own-fleet-income';

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const where: any = {};
    if (dateFrom || dateTo) {
      where.tripDate = {};
      if (dateFrom) where.tripDate.gte = new Date(dateFrom);
      if (dateTo) where.tripDate.lte = new Date(dateTo);
    }

    const trips = await prisma.trip.findMany({
      where,
      select: {
        id: true,
        tripNumber: true,
        tripType: true,
        status: true,
        routeFrom: true,
        routeTo: true,
        tripDate: true,
        clientRateAmd: true,
        clientRate: true,
        carrierRateAmd: true,
        carrierRate: true,
        clientExpenses: true,
        carrierExpenses: true,
        paymentDueDate: true,
        carrierPaymentDate: true,
        client: { select: { name: true } },
        // description обязателен — по нему getTripSplitExpenseTotalsAmd определяет
        // сторону расхода (маркер __carrier__), без него все расходы считались клиентскими.
        expenses: { select: { amountAmd: true, amount: true, description: true } },
      },
      orderBy: { tripDate: 'desc' },
    });

    const tripInputs: FinanceTripInput[] = trips.map((t) => ({
      ...(function () {
        const split = getTripSplitExpenseTotalsAmd(t as any);
        return {
          tripId: t.id,
          tripNumber: t.tripNumber,
          tripType: t.tripType as 'own_transport' | 'expedition',
          status: t.status,
          clientRateAmd: Number(t.clientRateAmd ?? t.clientRate ?? 0) + split.clientExtraAmd,
          carrierRateAmd: Number(t.carrierRateAmd ?? t.carrierRate ?? 0),
          expensesAmd: split.carrierExtraAmd,
          clientDueDate: t.paymentDueDate ?? null,
          carrierDueDate: t.carrierPaymentDate ?? null,
        };
      })(),
    }));

    const tripIds = trips.map((t) => t.id);
    const paymentsDb = tripIds.length
      ? await prisma.payment.findMany({
          where: { tripId: { in: tripIds } },
          select: { tripId: true, type: true, amountAmd: true, paymentDate: true },
        })
      : [];

    const payments: FinancePaymentInput[] = paymentsDb.map((p) => ({
      tripId: p.tripId,
      type: p.type as 'client' | 'carrier',
      amountAmd: Number(p.amountAmd ?? 0),
      paymentDate: p.paymentDate,
    }));

    const rows = computeMetricRowsForTrips(tripInputs, payments);
    const aggregate = computeAggregateMetrics(rows);
    const breakdown = computeBreakdownTotals(rows);

    // "Собственный транспорт" — Этап 3 миграции на архитектуру "заявка → рейс": доход и
    // расход теперь считаются по ОДНОМУ И ТОМУ ЖЕ набору рейсов машин (раньше это были
    // две независимые суммы: доход — по всем заявкам own_transport напрямую, расход — по
    // VehicleTrip за период — из-за этого могли расходиться). Расход — та же
    // computeVehicleTripExpensesAmd, что и у карточки рейса, /vehicles/[id]/economics и
    // /api/vehicle-analytics. Доход — сумма заявок, ЯВНО привязанных к каждому рейсу
    // (Trip.vehicleTripId), даты заявок в расчёте не участвуют.
    const vehicleTripWhere: any = {};
    if (dateFrom || dateTo) {
      vehicleTripWhere.departureDate = {};
      if (dateFrom) vehicleTripWhere.departureDate.gte = new Date(dateFrom);
      if (dateTo) vehicleTripWhere.departureDate.lte = new Date(dateTo);
    }
    const vehicleTrips = await prisma.vehicleTrip.findMany({
      where: vehicleTripWhere,
      select: {
        id: true,
        salaryAmd: true, perDiemAmd: true, perDiem2Amd: true, perDiem3Amd: true, perDiem4Amd: true,
        otherExpensesAmd: true, fuelCostAmd: true,
        fleetExpenses: { select: { amountAmd: true } },
      },
    });
    const ownFleetIncomeByVt = await getVehicleTripsIncomeAmdBulk(vehicleTrips.map((vt) => vt.id));
    const ownFleetIncomeAmd = vehicleTrips.reduce(
      (sum, vt) => sum + (ownFleetIncomeByVt.get(vt.id) ?? 0),
      0
    );
    const ownFleetExpenseAmd = vehicleTrips.reduce(
      (sum, vt) => sum + computeVehicleTripExpensesAmd(vt),
      0
    );
    const metaByTripId = new Map(
      trips.map((t) => [
        t.id,
        {
          route: `${t.routeFrom ?? ''} -> ${t.routeTo ?? ''}`,
          clientName: t.client?.name ?? 'Клиент не указан',
          tripDate: t.tripDate,
        },
      ])
    );

    const kpi = {
      revenueAmd: breakdown.totalIncomeAmd,
      expenseAmd: breakdown.totalExpenseAmd,
      profitAmd: aggregate.totalProfitAmd,
      clientDebtAmd: aggregate.totalClientDebtAmd,
      carrierDebtAmd: aggregate.totalCarrierDebtAmd,
      cashGapAmd: aggregate.totalCashGapAmd,
    };

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const risksToday = rows
      .filter((r) => {
        const meta = metaByTripId.get(r.tripId);
        if (!meta?.tripDate) return false;
        const t = new Date(meta.tripDate);
        return t >= start && t <= end;
      })
      .flatMap((r) => {
        const list: Array<{ id: string; tripId: string; tripNumber: string; title: string; amountAmd: number; tone: 'warning' | 'danger' }> = [];
        if (r.cashGapAmd > 0) {
          list.push({
            id: `${r.tripId}-gap`,
            tripId: r.tripId,
            tripNumber: r.tripNumber,
            title: 'Cash-gap по заявке',
            amountAmd: r.cashGapAmd,
            tone: 'danger',
          });
        }
        if (r.clientDebtAmd > 0) {
          list.push({
            id: `${r.tripId}-client-debt`,
            tripId: r.tripId,
            tripNumber: r.tripNumber,
            title: 'Дебиторская задолженность',
            amountAmd: r.clientDebtAmd,
            tone: r.clientDebtAmd > 0 ? 'warning' : 'danger',
          });
        }
        if (r.carrierDebtAmd > 0 && r.tripType === 'expedition') {
          list.push({
            id: `${r.tripId}-carrier-debt`,
            tripId: r.tripId,
            tripNumber: r.tripNumber,
            title: 'Кредиторская задолженность',
            amountAmd: r.carrierDebtAmd,
            tone: 'warning',
          });
        }
        return list;
      })
      .sort((a, b) => b.amountAmd - a.amountAmd)
      .slice(0, 12);

    const drillDown = rows
      .filter((r) => r.clientDebtAmd > 0 || r.carrierDebtAmd > 0 || r.cashGapAmd > 0 || r.profitAmd < 0)
      .map((r) => {
        const meta = metaByTripId.get(r.tripId);
        return {
          tripId: r.tripId,
          tripNumber: r.tripNumber,
          route: meta?.route ?? '',
          clientName: meta?.clientName ?? 'Клиент не указан',
          tripType: r.tripType,
          profitAmd: r.profitAmd,
          clientDebtAmd: r.clientDebtAmd,
          carrierDebtAmd: r.carrierDebtAmd,
          cashGapAmd: r.cashGapAmd,
        };
      })
      .sort((a, b) => {
        const ar = Math.max(a.clientDebtAmd, a.carrierDebtAmd, a.cashGapAmd, a.profitAmd < 0 ? Math.abs(a.profitAmd) : 0);
        const br = Math.max(b.clientDebtAmd, b.carrierDebtAmd, b.cashGapAmd, b.profitAmd < 0 ? Math.abs(b.profitAmd) : 0);
        return br - ar;
      })
      .slice(0, 20);

    return NextResponse.json({
      asOf: ymd(new Date()),
      kpi,
      ownTransport: {
        incomeAmd: Math.round(ownFleetIncomeAmd),
        expenseAmd: Math.round(ownFleetExpenseAmd),
        profitAmd: Math.round(ownFleetIncomeAmd - ownFleetExpenseAmd),
      },
      expedition: {
        incomeAmd: breakdown.expedition.incomeAmd,
        expenseAmd: breakdown.expedition.expenseAmd,
        profitAmd: breakdown.expedition.profitAmd,
        clientDebtAmd: breakdown.expedition.clientDebtAmd,
        carrierDebtAmd: breakdown.expedition.carrierDebtAmd,
        cashGapAmd: breakdown.expedition.cashGapAmd,
      },
      risksToday,
      drillDown,
    });
  } catch (error) {
    console.error('Director finance API error:', error);
    return NextResponse.json({ error: 'Ошибка финансового среза директора' }, { status: 500 });
  }
}
