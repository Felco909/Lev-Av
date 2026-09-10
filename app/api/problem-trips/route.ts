export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getClientDebtRows, getCarrierDebtRows } from '@/lib/finance/debts-service';
import { getIdleVehicles, getStuckVehicleTrips } from '@/lib/dashboard/operational-summary';

/**
 * "Проблемные рейсы" (аудит ТМС 05.09.2026, приоритет 🟠) — сводный экран, который НЕ считает
 * ничего заново: только собирает в одном месте уже существующие канонические источники,
 * которые до этого были разбросаны по /dashboard (Command Center), /debts и колокольчику
 * (/api/trips/stats). Ни Trip, ни VehicleTrip, ни формулы не трогаются — чистое чтение.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [clientRows, carrierRows, idleVehicles, stuckVehicleTrips] = await Promise.all([
      getClientDebtRows(prisma, todayStart),
      getCarrierDebtRows(prisma, todayStart),
      getIdleVehicles(prisma, 5),
      getStuckVehicleTrips(prisma, 14),
    ]);

    const overdueClientPayments = clientRows
      .filter((r) => r.isOverdue)
      .map((r) => ({ id: r.id, tripNumber: r.tripNumber, entityName: r.entityName, remaining: r.remaining, daysOverdue: r.daysLeft != null ? Math.abs(r.daysLeft) : 0 }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    const overdueCarrierPayments = carrierRows
      .filter((r) => r.isOverdue)
      .map((r) => ({ id: r.id, tripNumber: r.tripNumber, entityName: r.entityName, remaining: r.remaining, daysOverdue: r.daysLeft != null ? Math.abs(r.daysLeft) : 0 }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Дедуп кассового разрыва по заявке — та же логика, что в /api/dashboard и
    // /api/trips/stats (заявка может встретиться и в клиентских, и в перевозчицких строках).
    const cashGapDedup = new Map<string, { id: string; tripNumber: string; gapAmd: number }>();
    for (const r of [...clientRows, ...carrierRows]) {
      if (r.cashGap > 0 && !cashGapDedup.has(r.id)) {
        cashGapDedup.set(r.id, { id: r.id, tripNumber: r.tripNumber, gapAmd: r.cashGap });
      }
    }
    const cashGapTrips = Array.from(cashGapDedup.values()).sort((a, b) => b.gapAmd - a.gapAmd);

    // Заявки без счёта/акта / без вложений — та же выборка, что Command Center на дашборде
    // (app/api/dashboard/route.ts, шаг 10), здесь без ограничения в 10 строк — полный список.
    const DOCS_DUE_STATUSES = ['unloaded', 'awaiting_payment'];
    const docsDueTrips = await prisma.trip.findMany({
      where: { status: { in: DOCS_DUE_STATUSES } },
      select: {
        id: true, tripNumber: true, status: true, invoiceDocNumber: true, actDocNumber: true,
        client: { select: { name: true } },
        _count: { select: { attachments: true } },
      },
      orderBy: { tripDate: 'desc' },
    });
    const noInvoiceActTrips = docsDueTrips
      .filter((t) => t.status === 'unloaded' && (!t.invoiceDocNumber || !t.actDocNumber))
      .map((t) => ({ id: t.id, tripNumber: t.tripNumber, entityName: t.client?.name ?? '—' }));
    const noAttachmentTrips = docsDueTrips
      .filter((t) => t._count.attachments === 0)
      .map((t) => ({ id: t.id, tripNumber: t.tripNumber, entityName: t.client?.name ?? '—' }));

    const counts = {
      critical: overdueClientPayments.length + overdueCarrierPayments.length,
      warning: cashGapTrips.length + noInvoiceActTrips.length + noAttachmentTrips.length,
      info: idleVehicles.length + stuckVehicleTrips.length,
    };

    return NextResponse.json({
      counts,
      overdueClientPayments,
      overdueCarrierPayments,
      cashGapTrips,
      noInvoiceActTrips,
      noAttachmentTrips,
      idleVehicles,
      stuckVehicleTrips,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
