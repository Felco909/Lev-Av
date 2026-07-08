import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { computeClientDueAmd, computeCarrierDueAmd, computePaymentStatus } from '@/lib/finance/formulas';

/** Recalculate paid totals & payment status for a trip (both client and carrier) */
async function recalcTripPayments(tripId: string) {
  const payments = await prisma.payment.findMany({ where: { tripId } });

  // Client payments
  const clientPayments = payments.filter(p => p.type === 'client');
  const clientPaidAmd = clientPayments.reduce((s, p) => s + Number(p.amountAmd || 0), 0);
  const clientPaidOrig = clientPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  // Carrier payments
  const carrierPayments = payments.filter(p => p.type === 'carrier');
  const carrierPaidAmd = carrierPayments.reduce((s, p) => s + Number(p.amountAmd || 0), 0);
  const carrierPaidOrig = carrierPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { clientRateAmd: true, clientRate: true, carrierRateAmd: true, carrierRate: true, expenses: true },
  });

  // Клиент должен ставку + перевыставляемые клиентские расходы (см. CLAUDE.md,
  // та же логика, что и в computeTripProfitAmd) — раньше расходы тут не учитывались.
  const clientDue = computeClientDueAmd(Number(trip?.clientRateAmd ?? trip?.clientRate ?? 0), trip?.expenses ?? []);
  const clientStatus = computePaymentStatus(clientDue, clientPaidAmd);

  const carrierDue = computeCarrierDueAmd(trip?.carrierRateAmd != null ? Number(trip.carrierRateAmd) : (trip?.carrierRate != null ? Number(trip.carrierRate) : 0), trip?.expenses ?? []);
  const carrierStatus = computePaymentStatus(carrierDue, carrierPaidAmd);

  await prisma.trip.update({
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
  const body = await req.json();
  const { tripId, amount, currency, exchangeRate, paymentDate, method, description, type } = body;
  if (!tripId || !amount || !paymentDate) {
    return NextResponse.json({ error: 'Заполните обязательные поля' }, { status: 400 });
  }
  const cur = currency || 'AMD';
  const rate = Number(exchangeRate) || 1;
  const computedAmountAmd = cur === 'AMD' ? Number(amount) : Math.round(Number(amount) * rate * 100) / 100;
  const paymentType = type === 'carrier' ? 'carrier' : 'client';

  const payment = await prisma.payment.create({
    data: {
      tripId,
      type: paymentType,
      amount: Number(amount),
      amountAmd: computedAmountAmd,
      currency: cur,
      exchangeRate: rate,
      paymentDate: new Date(paymentDate),
      method: method || 'bank_transfer',
      description: description || null,
    },
  });
  await recalcTripPayments(tripId);
  return NextResponse.json({
    ...payment,
    amount: Number(payment.amount),
    amountAmd: Number(payment.amountAmd),
    exchangeRate: Number(payment.exchangeRate),
  }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const payment = await prisma.payment.findUnique({ where: { id }, select: { tripId: true } });
  await prisma.payment.delete({ where: { id } });
  if (payment?.tripId) await recalcTripPayments(payment.tripId);
  return NextResponse.json({ ok: true });
}
