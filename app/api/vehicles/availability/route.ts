export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

// Check which vehicles are busy on a given date
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const excludeTripId = searchParams.get('excludeTripId');
    if (!date) return NextResponse.json({ error: '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0434\u0430\u0442\u0443' }, { status: 400 });

    const tripDate = new Date(date);
    const where: any = {
      tripDate,
      vehicleId: { not: null },
      status: { in: ['new', 'in_progress'] },
    };
    if (excludeTripId) where.id = { not: excludeTripId };

    const busyTrips = await prisma.trip.findMany({
      where,
      select: { vehicleId: true },
    });
    const busyVehicleIds = busyTrips.map(t => t.vehicleId).filter(Boolean) as string[];
    return NextResponse.json({ busyVehicleIds });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430' }, { status: 500 });
  }
}
