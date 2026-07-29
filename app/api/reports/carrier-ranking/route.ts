export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

/**
 * GET /api/reports/carrier-ranking — рейтинг перевозчиков (Dashboard v3, единый виджет
 * "Рейтинги"). Тот же паттерн группировки, что уже даёт topClients в /api/reports/trips —
 * не новая формула, а тот же приём (группировка Trip по стороне сделки), применённый к
 * carrierId вместо clientId. profitAmd — уже сохранённое каноническое значение (computeTripProfitAmd,
 * lib/finance/formulas.ts), здесь не пересчитывается.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const where: any = { tripType: 'expedition', NOT: { status: 'cancelled' } };
    if (dateFrom || dateTo) {
      where.tripDate = {};
      if (dateFrom) where.tripDate.gte = new Date(dateFrom);
      if (dateTo) where.tripDate.lte = new Date(dateTo);
    }

    const trips = await prisma.trip.findMany({
      where,
      select: {
        carrierId: true,
        carrierRateAmd: true, carrierRate: true,
        profitAmd: true, profit: true,
        carrier: { select: { name: true } },
      },
    });

    const map: Record<string, { carrierId: string; carrierName: string; trips: number; turnover: number; profit: number }> = {};
    for (const t of trips) {
      if (!t.carrierId || !t.carrier) continue;
      if (!map[t.carrierId]) {
        map[t.carrierId] = { carrierId: t.carrierId, carrierName: t.carrier.name, trips: 0, turnover: 0, profit: 0 };
      }
      map[t.carrierId].trips += 1;
      map[t.carrierId].turnover += Number(t.carrierRateAmd ?? t.carrierRate ?? 0);
      map[t.carrierId].profit += Number(t.profitAmd ?? t.profit ?? 0);
    }

    const ranking = Object.values(map).sort((a, b) => b.profit - a.profit);

    return NextResponse.json({ ranking });
  } catch (e) {
    console.error('Carrier ranking API error:', e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
