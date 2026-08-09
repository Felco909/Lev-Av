export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { assertRole, TRIP_DENORMALIZED_PAYMENT_ROLES } from '@/lib/auth/role-guard';
import { computeClientDueAmd, computeCarrierDueAmd, computeDebtAmd } from '@/lib/finance/formulas';
import { recordTripHistory } from '@/lib/trip-history';

export async function POST(request: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const tripId = params.id;
    // description обязателен — по нему getTripSplitExpenseTotalsAmd/splitExpensesAmd
    // определяет сторону расхода (маркер __carrier__), без него все перевыставляемые
    // расходы молча теряются при расчёте реального долга (аудит 01.08.2026, п.1).
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { expenses: { select: { amountAmd: true, amount: true, description: true } } },
    });
    if (!trip) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });

    if (trip.status === 'completed' || trip.status === 'paid') {
      return NextResponse.json({ error: 'Заявка уже завершена' }, { status: 400 });
    }
    if (trip.status !== 'sverka') {
      return NextResponse.json({ error: 'Завершить можно только из статуса «Сверка».' }, { status: 400 });
    }

    // 3-condition gate: client debt, carrier debt, taxCode — реальный долг считается
    // ТОЛЬКО через канонические computeClientDueAmd/computeCarrierDueAmd/computeDebtAmd
    // (lib/finance/formulas.ts), а не через "rate - paid" напрямую (аудит 01.08.2026, п.1):
    // локальная формула игнорировала перевыставляемые расходы (Expense) и позволяла
    // закрыть сделку с фактически непогашенным остатком.
    const payments = await prisma.payment.findMany({ where: { tripId } });
    const clientRateAmd = Number((trip as any).clientRateAmd ?? trip.clientRate ?? 0);
    const carrierRateAmd = Number((trip as any).carrierRateAmd ?? trip.carrierRate ?? 0);
    const clientDueAmd = computeClientDueAmd(clientRateAmd, trip.expenses);
    const carrierDueAmd = computeCarrierDueAmd(carrierRateAmd, trip.expenses);
    const clientPaidAmd = payments.filter((p: any) => p.type === 'client').reduce((s: number, p: any) => s + Number(p.amountAmd || 0), 0);
    const carrierPaidAmd = payments.filter((p: any) => p.type === 'carrier').reduce((s: number, p: any) => s + Number(p.amountAmd || 0), 0);
    const clientDebt = computeDebtAmd(clientDueAmd, clientPaidAmd);
    const carrierDebt = computeDebtAmd(carrierDueAmd, carrierPaidAmd);
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
      // Auto-close all debts: create balancing payments for remaining amounts.
      // clientDue/carrierDue — те же canonical clientDueAmd/carrierDueAmd, что и в гейте
      // выше (с учётом перевыставляемых расходов), а не голая ставка (аудит 01.08.2026, п.1).
      const clientDue = clientDueAmd;
      const carrierDue = carrierDueAmd;

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

/**
 * Reopen a completed trip — set status back to 'sverka' (на шаг назад по workflow,
 * симметрично un-archive из /api/trips/[id]/archive, который возвращает archived → completed).
 * Роль ограничена так же, как closeDebts/денормализованные платёжные поля выше — отмена
 * закрытия сделки требует финансовой роли, а не только «работы с заявками» (TMS-AUDIT-0015).
 * 'archived' сюда намеренно не принимается — выход из архива теперь только через
 * PUT /api/trips/[id]/archive, чтобы не было двух разных путей с разным результатом.
 */
export async function PUT(request: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const guard = assertRole(session, TRIP_DENORMALIZED_PAYMENT_ROLES, 'повторное открытие завершённой заявки');
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const tripId = params.id;
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });

    if (trip.status !== 'completed' && trip.status !== 'paid') {
      return NextResponse.json({ error: 'Заявка не завершена. Архивную заявку сначала верните из архива («Из архива»).' }, { status: 400 });
    }

    await prisma.trip.update({
      where: { id: tripId },
      data: { status: 'sverka' },
    });
    await recordTripHistory(tripId, 'status_changed', (session as any)?.user?.id ?? null, (session as any)?.user?.name ?? 'Система', [
      { field: 'status', oldValue: trip.status, newValue: 'sverka' },
    ]);

    return NextResponse.json({ success: true, status: 'sverka' });
  } catch (error) {
    console.error('Reopen trip error:', error);
    return NextResponse.json({ error: 'Ошибка открытия заявки' }, { status: 500 });
  }
}
