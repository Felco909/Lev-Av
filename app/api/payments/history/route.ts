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
      type: p.type,
      amount: Number(p.amount),
      amountAmd: Number(p.amountAmd),
      currency: p.currency,
      exchangeRate: Number(p.exchangeRate),
      paymentDate: p.paymentDate,
      method: p.method,
      description: p.description,
      trip: {
        id: p.trip?.id ?? '',
        tripNumber: p.trip?.tripNumber ?? '',
        routeFrom: p.trip?.routeFrom ?? '',
        routeTo: p.trip?.routeTo ?? '',
        client: p.trip?.client ?? null,
        carrier: p.trip?.carrier ?? null,
      },
    }));

    return NextResponse.json({ payments: rows });
  } catch (e: any) {
    console.error('Payment history error:', e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
