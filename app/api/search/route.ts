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
    const q = (searchParams.get('q') || '').trim();
    if (q.length < 2) return NextResponse.json({ trips: [], clients: [], carriers: [] });

    const like = `%${q}%`;

    const [trips, clients, carriers] = await Promise.all([
      prisma.trip.findMany({
        where: {
          OR: [
            { tripNumber: { contains: q, mode: 'insensitive' } },
            { routeFrom: { contains: q, mode: 'insensitive' } },
            { routeTo: { contains: q, mode: 'insensitive' } },
            { client: { name: { contains: q, mode: 'insensitive' } } },
          ],
        },
        select: { id: true, tripNumber: true, routeFrom: true, routeTo: true, client: { select: { name: true } } },
        take: 8,
        orderBy: { tripDate: 'desc' },
      }),
      prisma.client.findMany({
        where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, name: true, phone: true },
        take: 5,
        orderBy: { name: 'asc' },
      }),
      prisma.carrier.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        select: { id: true, name: true },
        take: 5,
        orderBy: { name: 'asc' },
      }),
    ]);

    return NextResponse.json({ trips, clients, carriers });
  } catch (e: any) {
    console.error('Search error:', e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
