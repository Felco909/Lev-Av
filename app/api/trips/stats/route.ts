export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

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

    // Sequential queries to avoid connection pool exhaustion
    const allTrips = await prisma.trip.aggregate({ where, _sum: { profitAmd: true }, _count: true });
    const [ownTrips, expTrips] = await Promise.all([
      prisma.trip.aggregate({ where: { ...where, tripType: 'own_transport' }, _sum: { profitAmd: true, clientRateAmd: true }, _count: true }),
      prisma.trip.aggregate({ where: { ...where, tripType: 'expedition' }, _sum: { profitAmd: true, clientRateAmd: true }, _count: true }),
    ]);

    const [statusCounts, trips] = await Promise.all([
      prisma.trip.groupBy({ by: ['status'], where, _count: true }),
      prisma.trip.findMany({ where, select: { tripDate: true, profitAmd: true, tripType: true }, orderBy: { tripDate: 'asc' } }),
    ]);

    const monthlyData: Record<string, { own: number; exp: number }> = {};
    for (const t of trips ?? []) {
      const key = `${t?.tripDate?.getFullYear?.()}-${String((t?.tripDate?.getMonth?.() ?? 0) + 1).padStart(2, '0')}`;
      if (!monthlyData[key]) monthlyData[key] = { own: 0, exp: 0 };
      const pAmd = Number(t?.profitAmd ?? 0);
      if (t?.tripType === 'own_transport') monthlyData[key].own += pAmd;
      else monthlyData[key].exp += pAmd;
    }

    // Current month vs previous month comparison + reminders
    const now = new Date();
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Batch reminders in groups of 2 to limit concurrent connections
    const [unclosedTrips, tripsWithoutDocs] = await Promise.all([
      prisma.trip.findMany({
        where: { status: 'in_progress', tripDate: { lte: threeDaysAgo } },
        select: { id: true, tripNumber: true, routeFrom: true, routeTo: true, tripDate: true, client: { select: { name: true } } },
        orderBy: { tripDate: 'asc' },
        take: 10,
      }),
      prisma.trip.findMany({
        where: { status: { in: ['unloaded', 'paid'] }, attachments: { none: {} } },
        select: { id: true, tripNumber: true, routeFrom: true, routeTo: true, client: { select: { name: true } } },
        orderBy: { tripDate: 'desc' },
        take: 10,
      }),
    ]);
    // Overdue/due payment reminders apply ONLY to trips with status='completed' AND a payment date set.
    // unpaidTrips: completed trips whose due date has passed AND the client still owes money.
    // paymentDueTrips: all completed trips with a due date set AND remaining client debt (split by daysLeft in UI).
    const [unpaidTripsRaw, paymentDueTripsRaw] = await Promise.all([
      prisma.trip.findMany({
        where: {
          status: 'completed',
          paymentDueDate: { not: null, lt: new Date() },
          clientPaymentStatus: { in: ['not_paid', 'partially_paid'] },
        },
        select: { id: true, tripNumber: true, routeFrom: true, routeTo: true, paymentDueDate: true, clientRate: true, clientRateAmd: true, clientPaidAmount: true, clientPaidAmountAmd: true, client: { select: { name: true } } },
        orderBy: { paymentDueDate: 'asc' },
        take: 20,
      }),
      prisma.trip.findMany({
        where: {
          status: 'completed',
          paymentDueDate: { not: null },
          clientPaymentStatus: { in: ['not_paid', 'partially_paid'] },
        },
        select: { id: true, tripNumber: true, routeFrom: true, routeTo: true, clientRate: true, clientRateAmd: true, clientPaidAmount: true, clientPaidAmountAmd: true, paymentDueDate: true, status: true, client: { select: { name: true } } },
        orderBy: { paymentDueDate: 'asc' },
        take: 30,
      }),
    ]);
    // Filter out trips that already have no remaining debt
    const unpaidTrips = unpaidTripsRaw.filter((t: any) => {
      const rate = Number(t.clientRateAmd ?? t.clientRate ?? 0);
      const paid = Number(t.clientPaidAmountAmd ?? t.clientPaidAmount ?? 0);
      return rate - paid > 0;
    });
    const paymentDueTrips = paymentDueTripsRaw.filter((t: any) => {
      const rate = Number(t.clientRateAmd ?? t.clientRate ?? 0);
      const paid = Number(t.clientPaidAmountAmd ?? t.clientPaidAmount ?? 0);
      return rate - paid > 0;
    });
    const [vehicleUtilization, totalVehicles] = await Promise.all([
      prisma.trip.groupBy({
        by: ['vehicleId'],
        where: { vehicleId: { not: null }, tripDate: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
        _count: true,
      }),
      prisma.vehicle.count({ where: { status: 'active' } }),
    ]);
    const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const curMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const [curMonth, prevMonth] = await Promise.all([
      prisma.trip.aggregate({ where: { tripDate: { gte: curMonthStart, lte: curMonthEnd } }, _sum: { profitAmd: true, clientRateAmd: true }, _count: true }),
      prisma.trip.aggregate({ where: { tripDate: { gte: prevMonthStart, lte: prevMonthEnd } }, _sum: { profitAmd: true, clientRateAmd: true }, _count: true }),
    ]);

    const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
    const [overdueRaw, cashGapRaw] = await Promise.all([
      prisma.trip.findMany({
        where: {
          status: { notIn: ['new', 'in_progress', 'archived'] },
          clientPaymentStatus: { in: ['not_paid', 'partially_paid'] },
          OR: [
            { paymentDueDate: { not: null } },
            { unloadDate: { not: null } },
          ],
        },
        select: {
          id: true, tripNumber: true, paymentDueDate: true, unloadDate: true,
          clientRateAmd: true, clientRate: true,
          clientPaidAmountAmd: true, clientPaidAmount: true,
          client: { select: { name: true, paymentTermsDays: true } },
        },
        take: 100,
      }),
      prisma.trip.findMany({
        where: {
          tripType: 'expedition',
          status: { notIn: ['archived', 'new', 'in_progress'] },
          carrierPaidAmountAmd: { gt: 0 },
        },
        select: {
          id: true, tripNumber: true,
          clientPaidAmountAmd: true, clientPaidAmount: true,
          carrierPaidAmountAmd: true, carrierPaidAmount: true,
        },
        take: 20,
      }),
    ]);

    const overdueClientPayments = overdueRaw
      .map((t: any) => {
        // Effective due date: stored paymentDueDate, else unloadDate + client.paymentTermsDays
        let effectiveDue: Date | null = t.paymentDueDate ? new Date(t.paymentDueDate) : null;
        if (!effectiveDue && t.unloadDate && Number(t.client?.paymentTermsDays) > 0) {
          effectiveDue = new Date(t.unloadDate);
          effectiveDue.setDate(effectiveDue.getDate() + Number(t.client.paymentTermsDays));
        }
        if (!effectiveDue) return null;
        const dueMs = new Date(effectiveDue).setHours(0, 0, 0, 0);
        if (dueMs >= todayMidnight.getTime()) return null;
        const rate = Number(t.clientRateAmd ?? t.clientRate ?? 0);
        const paid = Number(t.clientPaidAmountAmd ?? t.clientPaidAmount ?? 0);
        const remainingAmd = Math.round((rate - paid) * 100) / 100;
        const daysOverdue = Math.floor((todayMidnight.getTime() - dueMs) / 86400000);
        return { id: t.id, tripNumber: t.tripNumber, clientName: t.client?.name ?? '', remainingAmd, daysOverdue };
      })
      .filter((t: any) => t !== null && t.remainingAmd > 0.005)
      .sort((a: any, b: any) => b.daysOverdue - a.daysOverdue);

    const cashGapTrips = cashGapRaw
      .map((t: any) => {
        const clientPaid = Number(t.clientPaidAmountAmd ?? t.clientPaidAmount ?? 0);
        const carrierPaid = Number(t.carrierPaidAmountAmd ?? t.carrierPaidAmount ?? 0);
        const gapAmd = Math.round((carrierPaid - clientPaid) * 100) / 100;
        return { id: t.id, tripNumber: t.tripNumber, gapAmd };
      })
      .filter((t: any) => t.gapAmd > 0.005);

    return NextResponse.json({
      totalTrips: allTrips?._count ?? 0,
      totalProfit: Number(allTrips?._sum?.profitAmd ?? 0),
      ownCount: ownTrips?._count ?? 0,
      ownProfit: Number(ownTrips?._sum?.profitAmd ?? 0),
      ownRevenue: Number(ownTrips?._sum?.clientRateAmd ?? 0),
      expCount: expTrips?._count ?? 0,
      expProfit: Number(expTrips?._sum?.profitAmd ?? 0),
      expRevenue: Number(expTrips?._sum?.clientRateAmd ?? 0),
      statusCounts: (statusCounts ?? []).map((s: any) => ({ status: s?.status, count: s?._count ?? 0 })),
      monthlyData: Object.entries(monthlyData ?? {}).map(([month, data]: [string, any]) => ({
        month, own: data?.own ?? 0, exp: data?.exp ?? 0,
      })),
      currentMonth: {
        trips: curMonth?._count ?? 0,
        profit: Number(curMonth?._sum?.profitAmd ?? 0),
        revenue: Number(curMonth?._sum?.clientRateAmd ?? 0),
      },
      previousMonth: {
        trips: prevMonth?._count ?? 0,
        profit: Number(prevMonth?._sum?.profitAmd ?? 0),
        revenue: Number(prevMonth?._sum?.clientRateAmd ?? 0),
      },
      reminders: {
        unclosedTrips: (unclosedTrips ?? []).map((t: any) => ({ id: t.id, tripNumber: t.tripNumber, routeFrom: t.routeFrom, routeTo: t.routeTo, tripDate: t.tripDate, clientName: t.client?.name })),
        tripsWithoutDocs: (tripsWithoutDocs ?? []).map((t: any) => ({ id: t.id, tripNumber: t.tripNumber, routeFrom: t.routeFrom, routeTo: t.routeTo, clientName: t.client?.name })),
        unpaidTrips: (unpaidTrips ?? []).map((t: any) => ({ id: t.id, tripNumber: t.tripNumber, routeFrom: t.routeFrom, routeTo: t.routeTo, clientRate: Number(t.clientRate ?? 0), clientName: t.client?.name })),
        paymentDueTrips: (paymentDueTrips ?? []).map((t: any) => {
          const due = new Date(t.paymentDueDate);
          const today = new Date(); today.setHours(0,0,0,0);
          const daysLeft = Math.ceil((due.getTime() - today.getTime()) / 86400000);
          return { id: t.id, tripNumber: t.tripNumber, routeFrom: t.routeFrom, routeTo: t.routeTo, clientRate: Number(t.clientRate ?? 0), clientName: t.client?.name, paymentDueDate: due.toISOString().split('T')[0], daysLeft };
        }),
        overdueClientPayments,
        cashGapTrips,
      },
      vehicleUtilization: {
        totalVehicles: totalVehicles ?? 0,
        activeThisMonth: (vehicleUtilization ?? []).length,
        details: (vehicleUtilization ?? []).map((v: any) => ({ vehicleId: v.vehicleId, trips: v._count })),
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}