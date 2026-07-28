export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import {
  getClientDebtRows,
  getCarrierDebtRows,
  groupDebtRows,
  sumDebt,
  getPaymentReminders,
} from '@/lib/finance/debts-service';

/**
 * GET /api/debts — единый слой чтения долгов (lib/finance/debts-service.ts), см.
 * docs аудита раздела «Долги» (28.07.2026). Раньше здесь была собственная копия
 * calcDueState() и инлайн-формула кассового разрыва — теперь оба вызывают общие
 * канонические функции (formulas.ts), используемые также /api/dashboard и
 * /api/reports/company-debts. Форма ответа сохранена для обратной совместимости
 * (debts/page.tsx, reports/page.tsx, day-tasks/page.tsx), добавлено новое поле
 * reminders (buildClientPaymentReminderBuckets/buildCarrierPaymentReminderBuckets —
 * ранее существовавший, но нигде не подключённый модуль).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [clientRows, carrierRows, reminders] = await Promise.all([
      getClientDebtRows(prisma, todayStart),
      getCarrierDebtRows(prisma, todayStart),
      getPaymentReminders(prisma, todayStart),
    ]);

    const clientDebts = clientRows.map((r) => ({
      id: r.id,
      tripNumber: r.tripNumber,
      clientName: r.entityName,
      routeFrom: r.routeFrom,
      routeTo: r.routeTo,
      rateAmd: r.rateAmd,
      paidAmd: r.paidAmd,
      remaining: r.remaining,
      tripDate: r.tripDate,
      status: r.status,
      cashGap: r.cashGap,
      paymentDueDate: r.paymentDueDate,
      daysLeft: r.daysLeft,
      isOverdue: r.isOverdue,
      isUrgent: r.isUrgent,
    }));

    const carrierDebts = carrierRows.map((r) => ({
      id: r.id,
      tripNumber: r.tripNumber,
      carrierName: r.entityName,
      carrierId: r.entityId,
      routeFrom: r.routeFrom,
      routeTo: r.routeTo,
      rateAmd: r.rateAmd,
      paidAmd: r.paidAmd,
      remaining: r.remaining,
      tripDate: r.tripDate,
      status: r.status,
      cashGap: r.cashGap,
      paymentDueDate: r.paymentDueDate,
      daysLeft: r.daysLeft,
      isOverdue: r.isOverdue,
      isUrgent: r.isUrgent,
    }));

    const grouped = groupDebtRows(clientRows).map((g) => ({
      client: { id: g.entity.id, name: g.entity.name, phone: g.entity.phone ?? null, email: g.entity.email ?? null },
      trips: g.trips.map((t) => ({
        id: t.id, tripNumber: t.tripNumber, routeFrom: t.routeFrom, routeTo: t.routeTo,
        tripDate: t.tripDate, rateAmd: t.rateAmd, paidAmd: t.paidAmd, remaining: t.remaining,
        status: t.status, cashGap: t.cashGap, paymentDueDate: t.paymentDueDate,
        daysLeft: t.daysLeft, isOverdue: t.isOverdue, isUrgent: t.isUrgent,
      })),
      totalDebt: g.totalDebt,
    }));

    const groupedCarrier = groupDebtRows(carrierRows).map((g) => ({
      carrier: { id: g.entity.id, name: g.entity.name },
      trips: g.trips.map((t) => ({
        id: t.id, tripNumber: t.tripNumber, routeFrom: t.routeFrom, routeTo: t.routeTo,
        tripDate: t.tripDate, rateAmd: t.rateAmd, paidAmd: t.paidAmd, remaining: t.remaining,
        status: t.status, cashGap: t.cashGap, paymentDueDate: t.paymentDueDate,
        daysLeft: t.daysLeft, isOverdue: t.isOverdue, isUrgent: t.isUrgent,
      })),
      totalDebt: g.totalDebt,
    }));

    return NextResponse.json({
      clientDebts,
      carrierDebts,
      totalClientDebt: sumDebt(clientRows),
      totalCarrierDebt: sumDebt(carrierRows),
      grouped,
      groupedCarrier,
      reminders,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
