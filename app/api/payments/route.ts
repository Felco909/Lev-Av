import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { computeClientDueAmd, computeCarrierDueAmd, computePaymentStatus } from '@/lib/finance/formulas';
import { assertRole, TRIP_PAYMENT_JOURNAL_ROLES } from '@/lib/auth/role-guard';

/**
 * Recalculate paid totals & payment status for a trip (both client and carrier).
 * Принимает опциональный tx-клиент, чтобы вызываться внутри prisma.$transaction —
 * иначе создание платежа и пересчёт заявки были бы двумя независимыми запросами
 * и при сбое между ними могли разойтись (см. CLAUDE.md / аудит).
 */
async function recalcTripPayments(tripId: string, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const payments = await client.payment.findMany({ where: { tripId } });

  // Client payments
  const clientPayments = payments.filter(p => p.type === 'client');
  const clientPaidAmd = clientPayments.reduce((s, p) => s + Number(p.amountAmd || 0), 0);
  const clientPaidOrig = clientPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  // Carrier payments
  const carrierPayments = payments.filter(p => p.type === 'carrier');
  const carrierPaidAmd = carrierPayments.reduce((s, p) => s + Number(p.amountAmd || 0), 0);
  const carrierPaidOrig = carrierPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  const trip = await client.trip.findUnique({
    where: { id: tripId },
    select: { clientRateAmd: true, clientRate: true, carrierRateAmd: true, carrierRate: true, expenses: true },
  });

  // Клиент должен ставку + перевыставляемые клиентские расходы (см. CLAUDE.md,
  // та же логика, что и в computeTripProfitAmd) — раньше расходы тут не учитывались.
  const clientDue = computeClientDueAmd(Number(trip?.clientRateAmd ?? trip?.clientRate ?? 0), trip?.expenses ?? []);
  const clientStatus = computePaymentStatus(clientDue, clientPaidAmd);

  const carrierDue = computeCarrierDueAmd(trip?.carrierRateAmd != null ? Number(trip.carrierRateAmd) : (trip?.carrierRate != null ? Number(trip.carrierRate) : 0), trip?.expenses ?? []);
  const carrierStatus = computePaymentStatus(carrierDue, carrierPaidAmd);

  await client.trip.update({
    where: { id: tripId },
    data: {
      clientPaidAmount: new Decimal(clientPaidOrig),
      clientPaidAmountAmd: new Decimal(clientPaidAmd),
      clientPaymentStatus: clientStatus,
      carrierPaidAmount: new Decimal(carrierPaidOrig),
      carrierPaidAmountAmd: new Decimal(carrierPaidAmd),
      carrierPaymentStatus: carrierStatus,
    },
  });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tripId = req.nextUrl.searchParams.get('tripId');
  if (!tripId) return NextResponse.json({ error: 'tripId required' }, { status: 400 });
  const type = req.nextUrl.searchParams.get('type'); // optional filter
  const where: any = { tripId };
  if (type === 'client' || type === 'carrier') where.type = type;
  const payments = await prisma.payment.findMany({ where, orderBy: { paymentDate: 'desc' } });
  return NextResponse.json(payments.map(p => ({
    ...p,
    amount: Number(p.amount),
    amountAmd: Number(p.amountAmd),
    exchangeRate: Number(p.exchangeRate),
  })));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const guard = assertRole(session, TRIP_PAYMENT_JOURNAL_ROLES, 'создание платежа');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const body = await req.json();
  const { tripId, amount, currency, exchangeRate, paymentDate, method, description, type } = body;
  if (!tripId || !amount || !paymentDate) {
    return NextResponse.json({ error: 'Заполните обязательные поля' }, { status: 400 });
  }
  const cur = currency || 'AMD';
  const rate = Number(exchangeRate) || 1;
  const computedAmountAmd = cur === 'AMD' ? Number(amount) : Math.round(Number(amount) * rate * 100) / 100;
  const paymentType = type === 'carrier' ? 'carrier' : 'client';

  const paymentDateObj = new Date(paymentDate);

  const { payment, isDuplicate } = await prisma.$transaction(async (tx) => {
    // Advisory-лок по tripId сериализует конкурентные запросы на создание платежа по
    // ОДНОЙ и той же заявке — без него две параллельные вкладки/двойной клик проходят
    // проверку "дубля нет" одновременно и обе создают платёж (классический race condition).
    // hashtext() детерминированно превращает tripId (cuid-строку) в int для pg_advisory_xact_lock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tripId}))`;

    // Защита от повторной отправки (двойной клик/ретрай сети/resubmit формы, аудит
    // 01.08.2026, п.3 — реальный дубль в БД на TMS-2026-0105): если платёж с теми же
    // tripId+type+amount+currency+paymentDate уже создан в последние 15 секунд —
    // считаем это повторной отправкой ТОГО ЖЕ платежа и возвращаем существующий,
    // а не создаём новый. 15 сек достаточно для двойного клика/ретрая, но не блокирует
    // легитимный повторный платёж той же суммой, введённый позже осознанно.
    const dupWindowStart = new Date(Date.now() - 15_000);
    const existing = await tx.payment.findFirst({
      where: {
        tripId,
        type: paymentType,
        amount: new Decimal(Number(amount)),
        currency: cur,
        paymentDate: paymentDateObj,
        createdAt: { gte: dupWindowStart },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return { payment: existing, isDuplicate: true };
    }

    const created = await tx.payment.create({
      data: {
        tripId,
        type: paymentType,
        amount: Number(amount),
        amountAmd: computedAmountAmd,
        currency: cur,
        exchangeRate: rate,
        paymentDate: paymentDateObj,
        method: method || 'bank_transfer',
        description: description || null,
      },
    });
    await recalcTripPayments(tripId, tx);
    return { payment: created, isDuplicate: false };
  });

  return NextResponse.json({
    ...payment,
    amount: Number(payment.amount),
    amountAmd: Number(payment.amountAmd),
    exchangeRate: Number(payment.exchangeRate),
    ...(isDuplicate ? { duplicateOfExisting: true } : {}),
  }, { status: isDuplicate ? 200 : 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const guard = assertRole(session, TRIP_PAYMENT_JOURNAL_ROLES, 'удаление платежа');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const payment = await prisma.payment.findUnique({ where: { id }, select: { tripId: true } });
  await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id } });
    if (payment?.tripId) await recalcTripPayments(payment.tripId, tx);
  });
  return NextResponse.json({ ok: true });
}
