export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const trips = await prisma.trip.findMany({
      select: {
        routeFrom: true, routeTo: true,
        clientRateAmd: true, clientRate: true,
        profitAmd: true, profit: true,
        tripDate: true,
      },
    });

    const map: Record<string, {
      tripCount: number; totalRate: number; totalProfit: number;
      lastTrip: Date | null;
    }> = {};

    for (const t of trips) {
      const key = `${(t.routeFrom || '').trim()} → ${(t.routeTo || '').trim()}`;
      if (!map[key]) map[key] = { tripCount: 0, totalRate: 0, totalProfit: 0, lastTrip: null };
      const m = map[key];
      m.tripCount++;
      m.totalRate += Number(t.clientRateAmd ?? t.clientRate ?? 0);
      m.totalProfit += Number(t.profitAmd ?? t.profit ?? 0);
      const d = t.tripDate ? new Date(t.tripDate) : null;
      if (d && (!m.lastTrip || d > m.lastTrip)) m.lastTrip = d;
    }

    const rows = Object.entries(map).map(([route, m]) => ({
      route,
      tripCount: m.tripCount,
      totalRevenue: m.totalRate,
      totalProfit: m.totalProfit,
      avgRate: m.tripCount > 0 ? Math.round(m.totalRate / m.tripCount) : 0,
      avgProfit: m.tripCount > 0 ? Math.round(m.totalProfit / m.tripCount) : 0,
      lastTrip: m.lastTrip?.toISOString().slice(0, 10) ?? null,
    })).sort((a, b) => b.totalProfit - a.totalProfit);

    return NextResponse.json(rows);
  } catch (e: any) {
    console.error('Route analytics error:', e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
