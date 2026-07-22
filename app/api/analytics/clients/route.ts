export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

type ClientRow = { id: string; name: string; phone: string | null };
type AnalyticsRow = {
  clientId: string;
  clientName: string;
  phone: string | null;
  tripCount: number;
  revenue: number;
  profit: number;
  avgCheck: number;
  avgProfit: number;
  unpaidPct: number;
  debt: number;
  lastTrip: string | null;
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const clients = await prisma.client.findMany({
      select: { id: true, name: true, phone: true },
      orderBy: { name: 'asc' },
    });

    const trips = await prisma.trip.findMany({
      select: {
        clientId: true, clientRateAmd: true, clientRate: true,
        profitAmd: true, profit: true,
        clientPaymentStatus: true, tripDate: true,
        clientPaidAmountAmd: true, clientPaidAmount: true,
      },
    });

    const map: Record<string, {
      tripCount: number; revenue: number; profit: number;
      unpaidCount: number; totalCount: number; debt: number;
      firstTrip: Date | null; lastTrip: Date | null;
    }> = {};

    for (const t of trips) {
      if (!map[t.clientId]) map[t.clientId] = { tripCount: 0, revenue: 0, profit: 0, unpaidCount: 0, totalCount: 0, debt: 0, firstTrip: null, lastTrip: null };
      const m = map[t.clientId];
      m.tripCount++;
      m.totalCount++;
      m.revenue += Number(t.clientRateAmd ?? t.clientRate ?? 0);
      m.profit += Number(t.profitAmd ?? t.profit ?? 0);
      if (t.clientPaymentStatus !== 'paid') {
        m.unpaidCount++;
        const rate = Number(t.clientRateAmd ?? t.clientRate ?? 0);
        const paid = Number(t.clientPaidAmountAmd ?? t.clientPaidAmount ?? 0);
        m.debt += Math.max(0, rate - paid);
      }
      const d = t.tripDate ? new Date(t.tripDate) : null;
      if (d) {
        if (!m.firstTrip || d < m.firstTrip) m.firstTrip = d;
        if (!m.lastTrip || d > m.lastTrip) m.lastTrip = d;
      }
    }

    const rows: AnalyticsRow[] = (clients as ClientRow[]).map((c: ClientRow) => {
      const m = map[c.id] || { tripCount: 0, revenue: 0, profit: 0, unpaidCount: 0, totalCount: 0, debt: 0, firstTrip: null, lastTrip: null };
      return {
        clientId: c.id, clientName: c.name, phone: c.phone,
        tripCount: m.tripCount,
        revenue: m.revenue,
        profit: m.profit,
        avgCheck: m.tripCount > 0 ? Math.round(m.revenue / m.tripCount) : 0,
        avgProfit: m.tripCount > 0 ? Math.round(m.profit / m.tripCount) : 0,
        unpaidPct: m.totalCount > 0 ? Math.round((m.unpaidCount / m.totalCount) * 100) : 0,
        debt: m.debt,
        lastTrip: m.lastTrip?.toISOString().slice(0, 10) ?? null,
      };
    }).filter((r: AnalyticsRow) => r.tripCount > 0).sort((a: AnalyticsRow, b: AnalyticsRow) => b.revenue - a.revenue);

    return NextResponse.json({ rows });
  } catch (e: any) {
    console.error('Client analytics error:', e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
