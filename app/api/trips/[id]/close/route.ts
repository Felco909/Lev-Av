export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { assertRole, TRIP_DENORMALIZED_PAYMENT_ROLES } from '@/lib/auth/role-guard';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const tripId = params.id;
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });

    if (trip.status === 'completed' || trip.status === 'paid') {
      return NextResponse.json({ error: 'Заявка уже завершена' }, { status: 400 });
    }
    if (trip.status !== 'sverka') {
      return NextResponse.json({ error: 'Завершить можно только из статуса «Сверка».' }, { status: 400 });
    }

    // 3-condition gate: client debt, carrier debt, taxCode
    const payments = await prisma.payment.findMany({ where: { tripId } });
    const clientRateAmd = Number((trip as any).clientRateAmd ?? trip.clientRate ?? 0);
    const clientPaidAmd = payments.filter((p: any) => p.type === 'client').reduce((s: number, p: any) => s + Number(p.amountAmd || 0), 0);
    const clientDebt = Math.round(clientRateAmd - clientPaidAmd);
    const carrierRateAmd = Number((trip as any).carrierRateAmd ?? trip.carrierRate ?? 0);
    const carrierPaidAmd = payments.filter((p: any) => p.type === 'carrier').reduce((s: number, p: any) => s + Number(p.amountAmd || 0), 0);
    const carrierDebt = Math.round(carrierRateAmd - carrierPaidAmd);
    const blockingErrors: string[] = [];
    if (clientDebt > 0) blockingErrors.push(`Клиент не полностью оплатил (остаток: ${clientDebt.toLocaleString('ru-RU')} AMD)`);
    if (trip.tripType === 'expedition' && carrierDebt > 0) blockingErrors.push(`Перевозчик не получил полную оплату (остаток: ${carrierDebt.toLocaleString('ru-RU')} AMD)`);
    if (!(trip as any).taxCode?.trim()) blockingErrors.push('Налоговый код не заполнен');
    if (blockingErrors.length > 0) {
      return NextResponse.json({ error: blockingErrors.join('; '), blockingErrors }, { status: 422 });
    }

    const body = await request.json().catch(() => ({}));
    const closeDebts = body?.closeDebts === true;

    // closeDebts напрямую проставляет clientPaidAmount*/carrierPaidAmount*/статусы
    // "оплачено" в обход журнала платежей — та же защита, что и на прямой правке
    // этих полей (см. lib/auth/role-guard.ts). Обычное завершение без closeDebts
    // (просто смена статуса) этой проверкой не затрагивается.
    if (closeDebts) {
      const guard = assertRole(session, TRIP_DENORMALIZED_PAYMENT_ROLES, 'автозакрытие долгов при завершении заявки');
      if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    if (closeDebts) {
      // Auto-close all debts: create balancing payments for remaining amounts
      const clientDue = Number(trip.clientRateAmd ?? trip.clientRate ?? 0);
      const carrierDue = Number(trip.carrierRateAmd ?? trip.carrierRate ?? 0);

      // Get existing paid amounts
      const existingPayments = await prisma.payment.findMany({ where: { tripId } });
      const clientPaidAmd = existingPayments.filter(p => p.type === 'client').reduce((s, p) => s + Number(p.amountAmd || 0), 0);
      const carrierPaidAmd = existingPayments.filter(p => p.type === 'carrier').reduce((s, p) => s + Number(p.amountAmd || 0), 0);

      const today = new Date();
      const paymentsToCreate: any[] = [];

      // Create balancing client payment if there's a remaining debt
      const clientRemaining = clientDue - clientPaidAmd;
      if (clientRemaining > 0) {
        paymentsToCreate.push({
          tripId,
          type: 'client',
          amount: new Decimal(clientRemaining),
          amountAmd: new Decimal(clientRemaining),
          currency: 'AMD',
          exchangeRate: new Decimal(1),
          paymentDate: today,
          description: 'Авто-закрытие при завершении заявки',
          method: 'other',
        });
      }

      // Create balancing carrier payment if there's a remaining debt
      const carrierRemaining = carrierDue - carrierPaidAmd;
      if (carrierRemaining > 0 && trip.tripType === 'expedition') {
        paymentsToCreate.push({
          tripId,
          type: 'carrier',
          amount: new Decimal(carrierRemaining),
          amountAmd: new Decimal(carrierRemaining),
          currency: 'AMD',
          exchangeRate: new Decimal(1),
          paymentDate: today,
          description: 'Авто-закрытие при завершении заявки',
          method: 'other',
        });
      }

      if (paymentsToCreate.length > 0) {
        await prisma.payment.createMany({ data: paymentsToCreate });
      }

      // Update trip with full paid amounts and status
      await prisma.trip.update({
        where: { id: tripId },
        data: {
          status: 'completed',
          clientPaidAmount: new Decimal(clientDue),
          clientPaidAmountAmd: new Decimal(clientDue),
          clientPaymentStatus: 'paid',
          ...(trip.tripType === 'expedition' ? {
            carrierPaidAmount: new Decimal(carrierDue),
            carrierPaidAmountAmd: new Decimal(carrierDue),
            carrierPaymentStatus: 'paid',
          } : {}),
        },
      });
    } else {
      // Simple close — just change status
      await prisma.trip.update({
        where: { id: tripId },
        data: { status: 'completed' },
      });
    }

    return NextResponse.json({ success: true, status: 'completed' });
  } catch (error) {
    console.error('Close trip error:', error);
    return NextResponse.json({ error: 'Ошибка закрытия заявки' }, { status: 500 });
  }
}

/** Reopen a completed trip — set status back to 'unloaded' */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const tripId = params.id;
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });

    if (trip.status !== 'completed' && trip.status !== 'paid' && trip.status !== 'archived') {
      return NextResponse.json({ error: 'Заявка не завершена' }, { status: 400 });
    }

    await prisma.trip.update({
      where: { id: tripId },
      data: { status: 'sverka' },
    });

    return NextResponse.json({ success: true, status: 'sverka' });
  } catch (error) {
    console.error('Reopen trip error:', error);
    return NextResponse.json({ error: 'Ошибка открытия заявки' }, { status: 500 });
  }
}
