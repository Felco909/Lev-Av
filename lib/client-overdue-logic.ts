/**
 * Single source of truth for "client payment overdue" across trips list, dashboard, finance metrics.
 * Uses calendar YYYY-MM-DD comparison for payment_due_date (@db.Date) to avoid TZ drift.
 *
 * Entry points (same rules everywhere):
 * - GET /api/trips: computeClientOverdueForTrip() per row (+ journal sums from Payment)
 * - Dashboard / reminders: buildClientPaymentReminderBuckets() in dashboard-payment-reminders.ts
 * - Finance aggregates: computeOverdueFlag() in formulas.ts → computeIsClientPaymentOverdue()
 */

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Архив и рейсы «в пути»; cancelled-like — отдельно в isExcludedStatusForClientPaymentOverdue */
export const EXCLUDED_STATUSES_CLIENT_PAYMENT_OVERDUE = new Set([
  'archived',
  'new',
  'in_progress',
]);

export function isExcludedStatusForClientPaymentOverdue(status: string | null | undefined): boolean {
  if (status == null || status === '') return false;
  if (EXCLUDED_STATUSES_CLIENT_PAYMENT_OVERDUE.has(status)) return true;
  const s = String(status).toLowerCase();
  if (s.includes('cancel')) return true;
  return false;
}

/** Today as YYYY-MM-DD in local timezone (matches trips list browser logic). */
export function calendarYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Normalize Prisma @db.Date or ISO string to YYYY-MM-DD (UTC calendar from stored DATE).
 */
export function paymentDueDateToYmd(due: Date | string | null | undefined): string | null {
  if (due == null) return null;
  if (typeof due === 'string') {
    const s = due.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  return due.toISOString().slice(0, 10);
}

/**
 * Days until due (negative = overdue). Same approach as trips/page awaitingPaymentMeta:
 * parse date-only at local noon then zero to midnight.
 */
export function computeDaysLeftPaymentDueCalendar(dueYmd: string | null, today: Date): number | null {
  if (!dueYmd) return null;
  const due = new Date(`${dueYmd}T12:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const t = new Date(`${calendarYmdLocal(today)}T12:00:00`);
  due.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - t.getTime()) / 86400000);
}

/**
 * Effective paid amount: if there is at least one client Payment row, trust journal sum only;
 * otherwise fall back to denormalized trip fields (manual entry without journal).
 */
export function computeClientRemainderAmd(
  rateAmd: number,
  journalPaidAmd: number,
  denormPaidAmd: number,
  journalPaymentRowCount: number
): number {
  const rate = round2(Number(rateAmd) || 0);
  const j = round2(Number(journalPaidAmd) || 0);
  const d = round2(Number(denormPaidAmd) || 0);
  const paid = journalPaymentRowCount > 0 ? j : d;
  return round2(Math.max(0, rate - paid));
}

/** Alias for expedition carrier remainder (same journal-first rule). */
export function computeCarrierRemainderExpedition(
  rateAmd: number,
  journalPaidAmd: number,
  denormPaidAmd: number,
  journalPaymentRowCount: number
): number {
  return computeClientRemainderAmd(rateAmd, journalPaidAmd, denormPaidAmd, journalPaymentRowCount);
}

export function computeIsClientPaymentOverdue(args: {
  status: string | null | undefined;
  paymentDueDateYmd: string | null;
  remainderAmd: number;
  today: Date;
}): boolean {
  if (args.remainderAmd <= 0.005) return false;
  if (isExcludedStatusForClientPaymentOverdue(args.status)) return false;
  if (!args.paymentDueDateYmd) return false;
  const todayYmd = calendarYmdLocal(args.today);
  return args.paymentDueDateYmd < todayYmd;
}

export type ClientOverdueComputed = {
  paymentDueDateYmd: string | null;
  remainderAmd: number;
  daysLeft: number | null;
  overdue: boolean;
  journalPaidAmd: number;
  journalPaymentRowCount: number;
};

/** Legacy trips-list heuristic: red if unpaid status flag and due date passed (ignores journal remainder). */
export function legacyTripsListDueCellLooksOverdue(
  trip: { status?: string | null; clientPaymentStatus?: string | null; paymentDueDate?: Date | string | null },
  today: Date
): boolean {
  if (isExcludedStatusForClientPaymentOverdue(trip.status)) return false;
  if ((trip.clientPaymentStatus || 'not_paid') === 'paid') return false;
  const ymd = paymentDueDateToYmd(trip.paymentDueDate ?? null);
  if (!ymd) return false;
  return ymd < calendarYmdLocal(today);
}

export async function computeClientOverdueMismatchSamples(
  prisma: import('@prisma/client').PrismaClient,
  today: Date
): Promise<{
  /** Was red by old list rule but unified overdue=false */
  listRedUnifiedNot: Array<{
    tripNumber: string;
    clientName: string;
    route: string;
    status: string;
    remainderAmd: number;
    paymentDueYmd: string | null;
    note: string;
  }>;
  /** Unified overdue=true but old list would not show red */
  unifiedRedListNot: Array<{
    tripNumber: string;
    clientName: string;
    route: string;
    status: string;
    remainderAmd: number;
    paymentDueYmd: string | null;
    note: string;
  }>;
}> {
  const trips = await prisma.trip.findMany({
    where: { paymentDueDate: { not: null } },
    select: {
      id: true,
      tripNumber: true,
      status: true,
      paymentDueDate: true,
      clientPaymentStatus: true,
      clientRateAmd: true,
      clientRate: true,
      clientPaidAmountAmd: true,
      clientPaidAmount: true,
      routeFrom: true,
      routeTo: true,
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
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const p of payments) {
    sums.set(p.tripId, (sums.get(p.tripId) ?? 0) + Number(p.amountAmd ?? 0));
    counts.set(p.tripId, (counts.get(p.tripId) ?? 0) + 1);
  }

  const outA: Array<{
    tripNumber: string;
    clientName: string;
    route: string;
    status: string;
    remainderAmd: number;
    paymentDueYmd: string | null;
    note: string;
  }> = [];
  const outB: typeof outA = [];

  for (const t of trips) {
    const jPaid = sums.get(t.id) ?? 0;
    const jCnt = counts.get(t.id) ?? 0;
    const oc = computeClientOverdueForTrip(t, jPaid, jCnt, today);
    const legacy = legacyTripsListDueCellLooksOverdue(t, today);

    const route = `${t.routeFrom ?? ''} → ${t.routeTo ?? ''}`;
    const clientName = t.client?.name ?? '';

    if (legacy && !oc.overdue) {
      let note = 'legacy row red (status not paid + due passed); unified=false — ';
      if (oc.remainderAmd <= 0.005) note += 'remainder 0 by journal/denorm (often journal paid fully but status not paid).';
      else if (isExcludedStatusForClientPaymentOverdue(t.status)) note += `excluded status ${t.status}.`;
      else if (!oc.paymentDueDateYmd) note += 'no due ymd.';
      else note += 'check calendar comparison.';
      outA.push({
        tripNumber: t.tripNumber,
        clientName,
        route,
        status: t.status,
        remainderAmd: oc.remainderAmd,
        paymentDueYmd: oc.paymentDueDateYmd,
        note,
      });
    }
    if (!legacy && oc.overdue) {
      outB.push({
        tripNumber: t.tripNumber,
        clientName,
        route,
        status: t.status,
        remainderAmd: oc.remainderAmd,
        paymentDueYmd: oc.paymentDueDateYmd,
        note: 'unified overdue but list heuristic would not red — usually status=paid with remainder still shown elsewhere.',
      });
    }
  }

  return { listRedUnifiedNot: outA.slice(0, 40), unifiedRedListNot: outB.slice(0, 40) };
}

export function computeClientOverdueForTrip(
  trip: {
    status?: string | null;
    paymentDueDate?: Date | string | null;
    clientRateAmd?: unknown;
    clientRate?: unknown;
    clientPaidAmountAmd?: unknown;
    clientPaidAmount?: unknown;
  },
  journalPaidAmd: number,
  journalPaymentRowCount: number,
  today: Date
): ClientOverdueComputed {
  const rate = Number(trip.clientRateAmd ?? trip.clientRate ?? 0);
  const denorm = Number(trip.clientPaidAmountAmd ?? trip.clientPaidAmount ?? 0);
  const remainderAmd = computeClientRemainderAmd(rate, journalPaidAmd, denorm, journalPaymentRowCount);
  const paymentDueDateYmd = paymentDueDateToYmd(trip.paymentDueDate ?? null);
  const daysLeft = computeDaysLeftPaymentDueCalendar(paymentDueDateYmd, today);
  const overdue = computeIsClientPaymentOverdue({
    status: trip.status,
    paymentDueDateYmd,
    remainderAmd,
    today,
  });
  return {
    paymentDueDateYmd,
    remainderAmd,
    daysLeft,
    overdue,
    journalPaidAmd: round2(journalPaidAmd),
    journalPaymentRowCount,
  };
}
