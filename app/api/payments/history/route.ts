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
    const type = searchParams.get('type'); // client | carrier

    const where: any = {};
    if (dateFrom || dateTo) {
      where.paymentDate = {};
      if (dateFrom) where.paymentDate.gte = new Date(dateFrom);
      if (dateTo) where.paymentDate.lte = new Date(dateTo);
    }
    if (type) where.type = type;

    const payments = await prisma.payment.findMany({
      where,
      include: {
        trip: {
          select: {
            id: true, tripNumber: true, routeFrom: true, routeTo: true,
            client: { select: { name: true } },
            carrier: { select: { name: true } },
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });

    const rows = payments.map(p => ({
      id: p.id,
      tripId: p.trip?.id,
      tripNumber: p.trip?.tripNumber ?? '',
      type: p.type,
      counterparty: p.type === 'client' ? (p.trip?.client?.name ?? '') : (p.trip?.carrier?.name ?? ''),
      route: `${p.trip?.routeFrom ?? ''} → ${p.trip?.routeTo ?? ''}`,
      amount: Number(p.amountAmd ?? p.amount ?? 0),
      currency: p.currency,
      paymentDate: p.paymentDate,
      description: p.description,
    }));

    const totalClient = rows.filter(r => r.type === 'client').reduce((s, r) => s + r.amount, 0);
    const totalCarrier = rows.filter(r => r.type === 'carrier').reduce((s, r) => s + r.amount, 0);

    return NextResponse.json({ rows, totalClient, totalCarrier });
  } catch (e: any) {
    console.error('Payment history error:', e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
