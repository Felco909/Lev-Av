export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    // Helper to derive overdue/urgency status based on DUE DATE, NOT trip date.
    // Overdue is ONLY meaningful for status='completed' AND a due date set.
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const calcDueState = (dueDate: Date | null | undefined, status: string) => {
      if (!dueDate || status !== 'completed') {
        return { paymentDueDate: null as string | null, daysLeft: null as number | null, isOverdue: false, isUrgent: false };
      }
      const due = new Date(dueDate); due.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((due.getTime() - todayStart.getTime()) / 86400000);
      return {
        paymentDueDate: due.toISOString().slice(0, 10),
        daysLeft,
        isOverdue: daysLeft < 0,
        isUrgent: daysLeft >= 0 && daysLeft <= 3,
      };
    };

    // Client debts: trips where client owes us
    const clientUnpaid = await prisma.trip.findMany({
      where: { clientPaymentStatus: { in: ['not_paid', 'partially_paid'] } },
      include: {
        client: { select: { id: true, name: true, phone: true, email: true } },
      },
      orderBy: { tripDate: 'desc' },
    });

    const clientDebts = clientUnpaid.map(t => {
      const rateAmd = Number((t as any).clientRateAmd ?? t.clientRate ?? 0);
      const paidAmd = Number((t as any).clientPaidAmountAmd ?? 0);
      const remaining = Math.round((rateAmd - paidAmd) * 100) / 100;
      const dueState = calcDueState((t as any).paymentDueDate, t.status ?? '');
      return {
        id: t.id,
        tripNumber: t.tripNumber,
        clientName: t.client?.name ?? '—',
        rateAmd,
        paidAmd,
        remaining,
        tripDate: t.tripDate,
        status: t.status,
        ...dueState,
      };
    }).filter(t => t.remaining > 0);

    const totalClientDebt = clientDebts.reduce((s, t) => s + t.remaining, 0);

    // Grouped by client (for reports page backward compat)
    const groupedMap = new Map<string, any>();
    for (const t of clientUnpaid) {
      const rateAmd = Number((t as any).clientRateAmd ?? t.clientRate ?? 0);
      const paidAmd = Number((t as any).clientPaidAmountAmd ?? 0);
      const remaining = Math.round((rateAmd - paidAmd) * 100) / 100;
      if (remaining <= 0) continue;
      const cId = t.client?.id ?? 'unknown';
      if (!groupedMap.has(cId)) {
        groupedMap.set(cId, {
          client: { id: cId, name: t.client?.name ?? '—', phone: (t.client as any)?.phone ?? null, email: (t.client as any)?.email ?? null },
          trips: [],
          totalDebt: 0,
        });
      }
      const g = groupedMap.get(cId)!;
      g.trips.push({
        id: t.id, tripNumber: t.tripNumber,
        routeFrom: t.routeFrom ?? '', routeTo: t.routeTo ?? '',
        tripDate: t.tripDate ? new Date(t.tripDate).toISOString().slice(0, 10) : '',
        clientRate: rateAmd, clientPaidAmountAmd: paidAmd, remaining,
        clientPaymentStatus: t.clientPaymentStatus ?? 'not_paid', status: t.status,
      });
      g.totalDebt += remaining;
    }
    const grouped = Array.from(groupedMap.values()).sort((a, b) => b.totalDebt - a.totalDebt);

    // Carrier debts: trips where we owe the carrier
    const carrierUnpaid = await prisma.trip.findMany({
      where: {
        tripType: 'expedition',
        carrierPaymentStatus: { in: ['not_paid', 'partially_paid'] },
      },
      include: {
        carrier: { select: { id: true, name: true } },
      },
      orderBy: { tripDate: 'desc' },
    });

    const carrierDebts = carrierUnpaid.map(t => {
      const rateAmd = Number((t as any).carrierRateAmd ?? t.carrierRate ?? 0);
      const paidAmd = Number((t as any).carrierPaidAmountAmd ?? 0);
      const remaining = Math.round((rateAmd - paidAmd) * 100) / 100;
      const dueState = calcDueState((t as any).carrierPaymentDate, t.status ?? '');
      return {
        id: t.id,
        tripNumber: t.tripNumber,
        carrierName: t.carrier?.name ?? '—',
        rateAmd,
        paidAmd,
        remaining,
        tripDate: t.tripDate,
        status: t.status,
        ...dueState,
      };
    }).filter(t => t.remaining > 0);

    const totalCarrierDebt = carrierDebts.reduce((s, t) => s + t.remaining, 0);

    return NextResponse.json({
      clientDebts,
      carrierDebts,
      totalClientDebt: Math.round(totalClientDebt * 100) / 100,
      totalCarrierDebt: Math.round(totalCarrierDebt * 100) / 100,
      grouped, // backward compat for reports page
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
