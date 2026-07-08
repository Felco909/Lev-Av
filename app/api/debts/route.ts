export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { computeClientDueAmd, computeCarrierDueAmd } from '@/lib/finance/formulas';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    // Helper to derive overdue/urgency status based on DUE DATE, NOT trip date.
    // Overdue is ONLY meaningful for status='completed' AND a due date set.
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const calcDueState = (dueDate: Date | null | undefined, unloadDate?: Date | null, paymentTermsDays?: number | null) => {
      let effectiveDue: Date | null = dueDate ? new Date(dueDate) : null;
      if (!effectiveDue && unloadDate && paymentTermsDays && paymentTermsDays > 0) {
        effectiveDue = new Date(unloadDate);
        effectiveDue.setDate(effectiveDue.getDate() + paymentTermsDays);
      }
      if (!effectiveDue) {
        return { paymentDueDate: null as string | null, daysLeft: null as number | null, isOverdue: false, isUrgent: false };
      }
      const due = new Date(effectiveDue); due.setHours(0, 0, 0, 0);
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
      where: {
        status: { in: ['new', 'in_progress', 'unloaded', 'awaiting_payment', 'sverka', 'completed', 'archived'] },
        clientPaymentStatus: { in: ['not_paid', 'partially_paid'] },
      },
      include: {
        client: { select: { id: true, name: true, phone: true, email: true, paymentTermsDays: true } },
        carrier: { select: { id: true, name: true } },
        expenses: true,
      },
      orderBy: { tripDate: 'desc' },
    });

    const clientDebts = clientUnpaid.map(t => {
      const clientRateAmd = Number((t as any).clientRateAmd ?? t.clientRate ?? 0);
      const rateAmd = computeClientDueAmd(clientRateAmd, (t as any).expenses ?? []);
      const paidAmd = Number((t as any).clientPaidAmountAmd ?? 0);
      const remaining = Math.round((rateAmd - paidAmd) * 100) / 100;
      const dueState = calcDueState((t as any).paymentDueDate, (t as any).unloadDate, (t.client as any)?.paymentTermsDays);
      const carrierPaidAmd = Number((t as any).carrierPaidAmountAmd ?? 0);
      const cashGap = t.tripType === 'expedition' && carrierPaidAmd > paidAmd ? carrierPaidAmd - paidAmd : 0;
      return {
        id: t.id,
        tripNumber: t.tripNumber,
        clientName: t.client?.name ?? '—',
        routeFrom: t.routeFrom ?? '',
        routeTo: t.routeTo ?? '',
        rateAmd,
        paidAmd,
        remaining,
        tripDate: t.tripDate,
        status: t.status,
        cashGap,
        ...dueState,
      };
    }).filter(t => t.remaining > 0);

    const totalClientDebt = clientDebts.reduce((s, t) => s + t.remaining, 0);

    // Grouped by client
    const groupedMap = new Map<string, any>();
    for (const t of clientUnpaid) {
      const _clientRate = Number((t as any).clientRateAmd ?? t.clientRate ?? 0);
      const rateAmd = computeClientDueAmd(_clientRate, (t as any).expenses ?? []);
      const paidAmd = Number((t as any).clientPaidAmountAmd ?? 0);
      const remaining = Math.round((rateAmd - paidAmd) * 100) / 100;
      if (remaining <= 0) continue;
      const cId = t.client?.id ?? 'unknown';
      const carrierPaidAmd = Number((t as any).carrierPaidAmountAmd ?? 0);
      const cashGap = t.tripType === 'expedition' && carrierPaidAmd > paidAmd ? carrierPaidAmd - paidAmd : 0;
      const dueState = calcDueState((t as any).paymentDueDate, (t as any).unloadDate, (t.client as any)?.paymentTermsDays);
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
        rateAmd, paidAmd, remaining,
        status: t.status,
        cashGap, ...dueState,
      });
      g.totalDebt += remaining;
    }
    const grouped = Array.from(groupedMap.values()).sort((a, b) => b.totalDebt - a.totalDebt);

    // Carrier debts: trips where we owe the carrier
    const carrierUnpaid = await prisma.trip.findMany({
      where: {
        tripType: 'expedition',
        status: { in: ['new', 'in_progress', 'unloaded', 'awaiting_payment', 'sverka', 'completed', 'archived'] },
        carrierPaymentStatus: { in: ['not_paid', 'partially_paid'] },
      },
      include: {
        carrier: { select: { id: true, name: true } },
        expenses: true,
      },
      orderBy: { tripDate: 'desc' },
    });

    const carrierDebts = carrierUnpaid.map(t => {
      const carrierBaseAmd = Number((t as any).carrierRateAmd ?? t.carrierRate ?? 0);
      const rateAmd = computeCarrierDueAmd(carrierBaseAmd, (t as any).expenses ?? []);
      const paidAmd = Number((t as any).carrierPaidAmountAmd ?? 0);
      const remaining = Math.round((rateAmd - paidAmd) * 100) / 100;
      const dueState = calcDueState((t as any).carrierPaymentDate);
      const clientPaidAmd = Number((t as any).clientPaidAmountAmd ?? 0);
      const cashGap = paidAmd > clientPaidAmd ? paidAmd - clientPaidAmd : 0;
      return {
        id: t.id,
        tripNumber: t.tripNumber,
        carrierName: t.carrier?.name ?? '—',
        carrierId: t.carrier?.id ?? '',
        routeFrom: t.routeFrom ?? '',
        routeTo: t.routeTo ?? '',
        rateAmd,
        paidAmd,
        remaining,
        tripDate: t.tripDate,
        status: t.status,
        cashGap,
        ...dueState,
      };
    }).filter(t => t.remaining > 0);

    const totalCarrierDebt = carrierDebts.reduce((s, t) => s + t.remaining, 0);

    // Grouped by carrier
    const groupedCarrierMap = new Map<string, any>();
    for (const d of carrierDebts) {
      const cId = d.carrierId || 'unknown';
      if (!groupedCarrierMap.has(cId)) {
        groupedCarrierMap.set(cId, {
          carrier: { id: cId, name: d.carrierName },
          trips: [],
          totalDebt: 0,
        });
      }
      const g = groupedCarrierMap.get(cId)!;
      g.trips.push(d);
      g.totalDebt += d.remaining;
    }
    const groupedCarrier = Array.from(groupedCarrierMap.values()).sort((a, b) => b.totalDebt - a.totalDebt);

    return NextResponse.json({
      clientDebts,
      carrierDebts,
      totalClientDebt: Math.round(totalClientDebt * 100) / 100,
      totalCarrierDebt: Math.round(totalCarrierDebt * 100) / 100,
      grouped,
      groupedCarrier,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
