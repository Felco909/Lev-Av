import type { PrismaClient } from '@prisma/client';
import {
  computeCarrierRemainderExpedition,
  computeClientOverdueForTrip,
  computeDaysLeftPaymentDueCalendar,
  isExcludedStatusForClientPaymentOverdue,
  paymentDueDateToYmd,
  calendarYmdLocal,
} from '@/lib/client-overdue-logic';

import {
  isArchivedWorkflowStatus,
  prismaPaymentReminderExcludedStatuses,
} from '@/lib/trip-workflow-filters';

/** @deprecated use prismaPaymentReminderExcludedStatuses() */
export { PAYMENT_REMINDER_EXCLUDED_STATUSES as EXCLUDE_FROM_CLIENT_PAYMENT_OVERDUE } from '@/lib/trip-workflow-filters';

function carrierPaymentDueYmd(trip: {
  carrierPaymentDate?: Date | string | null;
  paymentDueDate?: Date | string | null;
}): string | null {
  return paymentDueDateToYmd(trip.carrierPaymentDate ?? trip.paymentDueDate ?? null);
}

export type PaymentReminderRow = {
  id: string;
  tripNumber: string;
  status: string;
  clientName?: string;
  carrierName?: string;
  amount: number;
  currency: string;
  paymentDueDate: string;
  daysLeft: number;
  routeFrom?: string;
  routeTo?: string;
};

function paidMapsFromRows(
  rows: { tripId: string; amountAmd: unknown }[]
): { sums: Map<string, number>; counts: Map<string, number> } {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const p of rows) {
    const id = p.tripId;
    sums.set(id, (sums.get(id) ?? 0) + Number(p.amountAmd ?? 0));
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return { sums, counts };
}

/**
 * Client overdue: paymentDueDate before today, remainder &gt; 0, excluded statuses filtered out.
 * Remainder = rate − journal(client) if any Payment rows exist, else rate − denormalized paid on trip.
 */
export async function buildClientPaymentReminderBuckets(
  prisma: PrismaClient,
  todayStart: Date
): Promise<{ overdue: PaymentReminderRow[]; dueSoon: PaymentReminderRow[] }> {
  const trips = await prisma.trip.findMany({
    where: {
      paymentDueDate: { not: null },
      status: { notIn: prismaPaymentReminderExcludedStatuses() },
    },
    select: {
      id: true,
      tripNumber: true,
      status: true,
      paymentDueDate: true,
      currency: true,
      routeFrom: true,
      routeTo: true,
      clientRateAmd: true,
      clientRate: true,
      clientPaidAmountAmd: true,
      clientPaidAmount: true,
      client: { select: { name: true } },
    },
  });

  const ids = trips.map((t) => t.id);
  const payments =
    ids.length > 0
      ? await prisma.payment.findMany({
          where: { tripId: { in: ids }, type: 'client' },
          select: { tripId: true, amountAmd: true },
        })
      : [];
  const { sums: paidByTrip, counts: countByTrip } = paidMapsFromRows(payments);

  const overdue: PaymentReminderRow[] = [];
  const dueSoon: PaymentReminderRow[] = [];
  const todayYmd = calendarYmdLocal(todayStart);

  for (const t of trips) {
    if (isArchivedWorkflowStatus(t.status)) continue;
    const jPaid = paidByTrip.get(t.id) ?? 0;
    const jCnt = countByTrip.get(t.id) ?? 0;
    const oc = computeClientOverdueForTrip(t, jPaid, jCnt, todayStart);
    if (oc.remainderAmd <= 0.005) continue;

    const dueYmd = oc.paymentDueDateYmd;
    if (!dueYmd) continue;

    const daysLeft = oc.daysLeft ?? computeDaysLeftPaymentDueCalendar(dueYmd, todayStart) ?? 0;

    const row: PaymentReminderRow = {
      id: t.id,
      tripNumber: t.tripNumber,
      status: t.status,
      clientName: t.client?.name ?? '',
      amount: oc.remainderAmd,
      currency: t.currency || 'AMD',
      paymentDueDate: dueYmd,
      daysLeft,
      routeFrom: t.routeFrom ?? '',
      routeTo: t.routeTo ?? '',
    };

    if (dueYmd < todayYmd) overdue.push(row);
    else dueSoon.push(row);
  }

  overdue.sort((a, b) => a.daysLeft - b.daysLeft);
  dueSoon.sort((a, b) => a.daysLeft - b.daysLeft);

  return { overdue, dueSoon };
}

/**
 * Carrier overdue (expedition): same date/remainder rules, carrier journal vs denorm fields.
 */
export async function buildCarrierPaymentReminderBuckets(
  prisma: PrismaClient,
  todayStart: Date
): Promise<{ overdue: PaymentReminderRow[]; dueSoon: PaymentReminderRow[] }> {
  const trips = await prisma.trip.findMany({
    where: {
      tripType: 'expedition',
      status: { notIn: prismaPaymentReminderExcludedStatuses() },
      OR: [
        { carrierPaymentDate: { not: null } },
        { paymentDueDate: { not: null } },
      ],
    },
    select: {
      id: true,
      tripNumber: true,
      status: true,
      carrierPaymentDate: true,
      paymentDueDate: true,
      carrierCurrency: true,
      currency: true,
      routeFrom: true,
      routeTo: true,
      carrierRateAmd: true,
      carrierRate: true,
      carrierPaidAmountAmd: true,
      carrierPaidAmount: true,
      carrier: { select: { name: true } },
    },
  });

  const ids = trips.map((t) => t.id);
  const payments =
    ids.length > 0
      ? await prisma.payment.findMany({
          where: { tripId: { in: ids }, type: 'carrier' },
          select: { tripId: true, amountAmd: true },
        })
      : [];
  const { sums: paidByTrip, counts: countByTrip } = paidMapsFromRows(payments);

  const overdue: PaymentReminderRow[] = [];
  const dueSoon: PaymentReminderRow[] = [];
  const todayYmd = calendarYmdLocal(todayStart);

  for (const t of trips) {
    if (isArchivedWorkflowStatus(t.status)) continue;
    if (isExcludedStatusForClientPaymentOverdue(t.status)) continue;

    const rate = Number(t.carrierRateAmd ?? t.carrierRate ?? 0);
    const jPaid = paidByTrip.get(t.id) ?? 0;
    const jCnt = countByTrip.get(t.id) ?? 0;
    const denorm = Number(t.carrierPaidAmountAmd ?? t.carrierPaidAmount ?? 0);
    const remaining = computeCarrierRemainderExpedition(rate, jPaid, denorm, jCnt);
    if (remaining <= 0.005) continue;

    const dueYmd = carrierPaymentDueYmd(t);
    if (!dueYmd) continue;

    const daysLeft = computeDaysLeftPaymentDueCalendar(dueYmd, todayStart) ?? 0;

    const row: PaymentReminderRow = {
      id: t.id,
      tripNumber: t.tripNumber,
      status: t.status,
      carrierName: t.carrier?.name ?? '',
      amount: remaining,
      currency: t.carrierCurrency || t.currency || 'AMD',
      paymentDueDate: dueYmd,
      daysLeft,
      routeFrom: t.routeFrom ?? '',
      routeTo: t.routeTo ?? '',
    };

    if (dueYmd < todayYmd) overdue.push(row);
    else dueSoon.push(row);
  }

  overdue.sort((a, b) => a.daysLeft - b.daysLeft);
  dueSoon.sort((a, b) => a.daysLeft - b.daysLeft);

  return { overdue, dueSoon };
}

export type ClientOverdueDebugRow = {
  tripId: string;
  tripNumber: string;
  status: string;
  paymentDueDate: string | null;
  rateAmd: number;
  paidClientAmd: number;
  remainingAmd: number;
  dueDayMs: number | null;
  todayMs: number;
  includedInOverdue: boolean;
  reason: string;
};

export async function debugClientOverdueEvaluation(
  prisma: PrismaClient,
  todayStart: Date
): Promise<{ evaluated: number; overdueEligible: number; rows: ClientOverdueDebugRow[] }> {
  const trips = await prisma.trip.findMany({
    where: { paymentDueDate: { not: null } },
    select: {
      id: true,
      tripNumber: true,
      status: true,
      paymentDueDate: true,
      clientRateAmd: true,
      clientRate: true,
      clientPaidAmountAmd: true,
      clientPaidAmount: true,
    },
  });
  const ids = trips.map((t) => t.id);
  const payments =
    ids.length > 0
      ? await prisma.payment.findMany({
          where: { tripId: { in: ids }, type: 'client' },
          select: { tripId: true, amountAmd: true },
        })
      : [];
  const { sums: paidByTrip, counts: countByTrip } = paidMapsFromRows(payments);

  const rows: ClientOverdueDebugRow[] = [];
  let overdueEligible = 0;
  const t0 = todayStart.getTime();

  for (const t of trips) {
    const jPaid = paidByTrip.get(t.id) ?? 0;
    const jCnt = countByTrip.get(t.id) ?? 0;
    const oc = computeClientOverdueForTrip(t, jPaid, jCnt, todayStart);
    const rate = Number(t.clientRateAmd ?? t.clientRate ?? 0);
    const included = oc.overdue;

    let reason = '';
    if (isExcludedStatusForClientPaymentOverdue(t.status)) {
      reason = `excluded status: ${t.status}`;
    } else if (!oc.paymentDueDateYmd) {
      reason = 'no paymentDueDate';
    } else if (oc.remainderAmd <= 0.005) {
      reason = jCnt > 0 ? 'remainder 0 (journal)' : 'remainder 0 (denorm/journal)';
    } else if (!included && oc.paymentDueDateYmd >= calendarYmdLocal(todayStart)) {
      reason = 'due date not before today';
    } else if (included) {
      reason = 'OVERDUE (unified)';
      overdueEligible += 1;
    } else {
      reason = 'not overdue';
    }

    rows.push({
      tripId: t.id,
      tripNumber: t.tripNumber,
      status: t.status,
      paymentDueDate: oc.paymentDueDateYmd,
      rateAmd: rate,
      paidClientAmd: oc.journalPaidAmd,
      remainingAmd: oc.remainderAmd,
      dueDayMs: oc.paymentDueDateYmd ? new Date(`${oc.paymentDueDateYmd}T12:00:00`).getTime() : null,
      todayMs: t0,
      includedInOverdue: included,
      reason,
    });
  }

  rows.sort((a, b) => Number(b.includedInOverdue) - Number(a.includedInOverdue));
  return { evaluated: trips.length, overdueEligible, rows: rows.slice(0, 200) };
}
