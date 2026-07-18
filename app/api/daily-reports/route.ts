export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { computeMetricRowsForTrips, getTripSplitExpenseTotalsAmd } from '@/lib/finance/finance-metrics-service';
import type { FinancePaymentInput, FinanceTripInput } from '@/lib/finance/types';

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function daysDiffFromToday(date: Date): number {
  const today = startOfDay(new Date());
  const due = startOfDay(date);
  return Math.floor((today.getTime() - due.getTime()) / 86400000);
}

function bucketByOverdueDays(daysOverdue: number): 'not_due' | 'overdue_1_3' | 'overdue_4_7' | 'overdue_8_14' | 'overdue_15_plus' {
  if (daysOverdue <= 0) return 'not_due';
  if (daysOverdue <= 3) return 'overdue_1_3';
  if (daysOverdue <= 7) return 'overdue_4_7';
  if (daysOverdue <= 14) return 'overdue_8_14';
  return 'overdue_15_plus';
}

// "Факт" рейса = статус показывает, что рейс реально состоялся (минимум разгрузка),
// а не просто числился запланированным на сегодня и не был отменён. new/in_progress —
// ещё не произошло; отменённые — не произошло вовсе. Остальные статусы (unloaded и
// дальше по воронке, включая archived) — состоялось.
const ACTUAL_TRIP_EXCLUDED_STATUSES = new Set(['new', 'in_progress']);
function isCancelledStatus(status: string | null | undefined): boolean {
  return typeof status === 'string' && status.toLowerCase().includes('cancel');
}
function tripActuallyHappened(status: string | null | undefined): boolean {
  if (!status) return false;
  if (ACTUAL_TRIP_EXCLUDED_STATUSES.has(status)) return false;
  return !isCancelledStatus(status);
}

async function loadRows(where: any) {
  const trips = await prisma.trip.findMany({
    where,
    select: {
      id: true,
      tripNumber: true,
      tripType: true,
      status: true,
      tripDate: true,
      paymentDueDate: true,
      carrierPaymentDate: true,
      clientRateAmd: true,
      clientRate: true,
      carrierRateAmd: true,
      carrierRate: true,
      clientExpenses: true,
      carrierExpenses: true,
      // description обязателен — по нему getTripSplitExpenseTotalsAmd определяет
      // сторону расхода (маркер __carrier__), без него все расходы считались клиентскими.
      expenses: { select: { amountAmd: true, amount: true, description: true } },
    },
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
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  return { rows, trips, tripMap, paymentsDb };
}

function summarizeSplit(rows: ReturnType<typeof computeMetricRowsForTrips>, type: 'own_transport' | 'expedition') {
  const filtered = rows.filter((r) => r.tripType === type);
  return {
    incomeAmd: roundMoney(filtered.reduce((s, r) => s + r.clientRateAmd, 0)),
    expenseAmd: roundMoney(
      filtered.reduce((s, r) => s + r.expensesAmd + (r.tripType === 'expedition' ? r.carrierRateAmd : 0), 0)
    ),
    profitAmd: roundMoney(filtered.reduce((s, r) => s + r.profitAmd, 0)),
    clientDebtAmd: roundMoney(filtered.reduce((s, r) => s + r.clientDebtAmd, 0)),
    carrierDebtAmd: roundMoney(filtered.reduce((s, r) => s + r.carrierDebtAmd, 0)),
    cashGapAmd: roundMoney(filtered.reduce((s, r) => s + r.cashGapAmd, 0)),
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);
    const weekStart = startOfDay(new Date(now.getTime() - 6 * 86400000));

    const [todayData, weekData, allData] = await Promise.all([
      loadRows({ tripDate: { gte: dayStart, lte: dayEnd } }),
      loadRows({ tripDate: { gte: weekStart, lte: dayEnd } }),
      loadRows({}),
    ]);

    const planFactDay = {
      plannedTrips: todayData.rows.length,
      actualTrips: todayData.rows.filter((r) => tripActuallyHappened(todayData.tripMap.get(r.tripId)?.status)).length,
      plannedRevenueAmd: roundMoney(todayData.rows.reduce((s, r) => s + r.clientRateAmd, 0)),
      actualRevenueAmd: roundMoney(todayData.rows.reduce((s, r) => s + r.clientPaidAmd, 0)),
      plannedProfitAmd: roundMoney(todayData.rows.reduce((s, r) => s + r.profitAmd, 0)),
      actualProfitAmd: roundMoney(
        todayData.rows.reduce((s, r) => {
          const paidDelta = r.clientPaidAmd - (r.tripType === 'expedition' ? r.carrierPaidAmd : 0);
          return s + (paidDelta - r.expensesAmd);
        }, 0)
      ),
    };

    const bucketLabels: Record<string, string> = {
      not_due: 'Не просрочено',
      overdue_1_3: 'Просрочка 1-3 дня',
      overdue_4_7: 'Просрочка 4-7 дней',
      overdue_8_14: 'Просрочка 8-14 дней',
      overdue_15_plus: 'Просрочка 15+ дней',
    };

    const bucketKeys = ['not_due', 'overdue_1_3', 'overdue_4_7', 'overdue_8_14', 'overdue_15_plus'] as const;
    const bucketState = new Map(
      bucketKeys.map((k) => [k, { clientDebtAmd: 0, carrierDebtAmd: 0, tripIds: new Set<string>() }]),
    );

    // Бакетуем по РЕАЛЬНОМУ сроку оплаты (paymentDueDate для клиента,
    // carrierPaymentDate для перевозчика) — раздельно, т.к. сроки могут отличаться.
    // Флаг "просрочено" берём из row.clientOverdue/row.carrierOverdue —
    // тех же канонических полей, что и в /api/dashboard, /api/director-finance
    // (computeOverdueFlag в lib/finance/formulas.ts): они уже корректно исключают
    // статусы new/in_progress/archived/отменённые из просрочки. Раньше этот блок
    // пересчитывал просрочку заново по голой дате, без учёта статуса — расхождение
    // с остальной системой (аудит, пункт 3). Если срок не задан или флаг false —
    // долг считается непросроченным, а НЕ "просроченным на возраст рейса".
    for (const row of allData.rows) {
      const trip = allData.tripMap.get(row.tripId);
      if (!trip) continue;

      if (row.clientDebtAmd > 0) {
        const bucket = row.clientOverdue && trip.paymentDueDate
          ? bucketByOverdueDays(daysDiffFromToday(new Date(trip.paymentDueDate)))
          : 'not_due';
        const state = bucketState.get(bucket)!;
        state.clientDebtAmd = roundMoney(state.clientDebtAmd + row.clientDebtAmd);
        state.tripIds.add(row.tripId);
      }

      if (row.carrierDebtAmd > 0) {
        const bucket = row.carrierOverdue && trip.carrierPaymentDate
          ? bucketByOverdueDays(daysDiffFromToday(new Date(trip.carrierPaymentDate)))
          : 'not_due';
        const state = bucketState.get(bucket)!;
        state.carrierDebtAmd = roundMoney(state.carrierDebtAmd + row.carrierDebtAmd);
        state.tripIds.add(row.tripId);
      }
    }

    const bucketInit = bucketKeys.map((k) => {
      const state = bucketState.get(k)!;
      return {
        bucket: k,
        label: bucketLabels[k],
        clientDebtAmd: state.clientDebtAmd,
        carrierDebtAmd: state.carrierDebtAmd,
        tripCount: state.tripIds.size,
      };
    });

    const expectedIncomingAmd = roundMoney(todayData.rows.reduce((s, r) => s + r.clientDebtAmd, 0));
    const actualIncomingAmd = roundMoney(
      todayData.paymentsDb.filter((p) => p.type === 'client' && p.paymentDate && new Date(p.paymentDate) >= dayStart && new Date(p.paymentDate) <= dayEnd)
        .reduce((s, p) => s + Number(p.amountAmd ?? 0), 0)
    );
    const expectedOutgoingAmd = roundMoney(
      todayData.rows.filter((r) => r.tripType === 'expedition').reduce((s, r) => s + r.carrierDebtAmd, 0)
    );
    const actualOutgoingAmd = roundMoney(
      todayData.paymentsDb.filter((p) => p.type === 'carrier' && p.paymentDate && new Date(p.paymentDate) >= dayStart && new Date(p.paymentDate) <= dayEnd)
        .reduce((s, p) => s + Number(p.amountAmd ?? 0), 0)
    );

    const cashFlow = {
      expectedIncomingAmd,
      actualIncomingAmd,
      expectedOutgoingAmd,
      actualOutgoingAmd,
      netExpectedAmd: roundMoney(expectedIncomingAmd - expectedOutgoingAmd),
      netActualAmd: roundMoney(actualIncomingAmd - actualOutgoingAmd),
    };

    const ownVsExpedition = {
      day: {
        ownTransport: summarizeSplit(todayData.rows, 'own_transport'),
        expedition: summarizeSplit(todayData.rows, 'expedition'),
      },
      week: {
        ownTransport: summarizeSplit(weekData.rows, 'own_transport'),
        expedition: summarizeSplit(weekData.rows, 'expedition'),
      },
    };

    return NextResponse.json({
      asOf: ymd(now),
      planFactDay,
      overdueBuckets: bucketInit,
      cashFlow,
      ownVsExpedition,
    });
  } catch (error) {
    console.error('Daily reports API error:', error);
    return NextResponse.json({ error: 'Ошибка daily reports' }, { status: 500 });
  }
}
