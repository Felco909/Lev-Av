import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const vehicleId = sp.get('vehicleId') || undefined;
  const expenseType = sp.get('expenseType') || undefined;
  const dateFrom = sp.get('dateFrom') || undefined;
  const dateTo = sp.get('dateTo') || undefined;
  const vehicleTripId = sp.get('vehicleTripId') || undefined;

  const where: any = {};
  if (vehicleId) where.vehicleId = vehicleId;
  if (expenseType) where.expenseType = expenseType;
  if (vehicleTripId) where.vehicleTripId = vehicleTripId;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo) where.date.lte = new Date(dateTo + 'T23:59:59');
  }

  const rows = await prisma.fleetExpense.findMany({
    where,
    include: {
      vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
      vehicleTrip: { select: { id: true, tripNumber: true } },
    },
    orderBy: { date: 'desc' },
  });

  // Totals by type
  const totals: Record<string, number> = {};
  let grandTotal = 0;
  for (const r of rows) {
    const amt = Number(r.amountAmd);
    totals[r.expenseType] = (totals[r.expenseType] || 0) + amt;
    grandTotal += amt;
  }

  return NextResponse.json({ rows, totals, grandTotal });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { date, vehicleId, expenseType, amount, currency, exchangeRate, comment, vehicleTripId, liters } = body;

  if (!date || !vehicleId || !expenseType || amount == null) {
    return NextResponse.json({ error: 'Обязательные поля: дата, машина, тип, сумма' }, { status: 400 });
  }

  const amt = parseFloat(amount) || 0;
  const cur = currency || 'AMD';
  const rate = parseFloat(exchangeRate) || 1;
  const amountAmd = cur === 'AMD' ? amt : Math.round(amt * rate * 100) / 100;

  const record = await prisma.fleetExpense.create({
    data: {
      date: new Date(date),
      vehicleId,
      vehicleTripId: vehicleTripId || null,
      expenseType,
      liters: liters ? parseFloat(liters) : null,
      amount: amt,
      currency: cur,
      exchangeRate: rate,
      amountAmd,
      comment: comment || null,
    },
    include: {
      vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
      vehicleTrip: { select: { id: true, tripNumber: true } },
    },
  });

  return NextResponse.json(record, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, date, vehicleId, expenseType, amount, currency, exchangeRate, comment, vehicleTripId, liters } = body;

  if (!id) return NextResponse.json({ error: 'ID обязателен' }, { status: 400 });

  const amt = parseFloat(amount) || 0;
  const cur = currency || 'AMD';
  const rate = parseFloat(exchangeRate) || 1;
  const amountAmd = cur === 'AMD' ? amt : Math.round(amt * rate * 100) / 100;

  const data: any = {
    date: date ? new Date(date) : undefined,
    vehicleId: vehicleId || undefined,
    expenseType: expenseType || undefined,
    liters: liters !== undefined ? (liters ? parseFloat(liters) : null) : undefined,
    amount: amt,
    currency: cur,
    exchangeRate: rate,
    amountAmd,
    comment: comment ?? undefined,
  };
  if (vehicleTripId !== undefined) data.vehicleTripId = vehicleTripId || null;

  const record = await prisma.fleetExpense.update({
    where: { id },
    data,
    include: {
      vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
      vehicleTrip: { select: { id: true, tripNumber: true } },
    },
  });

  return NextResponse.json(record);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const id = sp.get('id');
  if (!id) return NextResponse.json({ error: 'ID обязателен' }, { status: 400 });

  await prisma.fleetExpense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
