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
    const month = searchParams.get('month'); // YYYY-MM
    if (!month) return NextResponse.json({ error: 'Укажите месяц' }, { status: 400 });

    const [year, m] = month.split('-').map(Number);
    const dateFrom = new Date(year, m - 1, 1);
    const dateTo = new Date(year, m, 0); // last day of month

    const trips = await prisma.trip.findMany({
      where: {
        tripDate: { gte: dateFrom, lte: dateTo },
      },
      include: {
        client: { select: { name: true } },
        vehicle: { select: { plateNumber: true } },
        driver: { select: { fullName: true } },
        carrier: { select: { name: true } },
      },
      orderBy: { tripDate: 'asc' },
    });

    // Also fetch trips that have payment due dates in this month (may differ from tripDate)
    const paymentDueTrips = await prisma.trip.findMany({
      where: {
        paymentDueDate: { gte: dateFrom, lte: dateTo },
        NOT: { tripDate: { gte: dateFrom, lte: dateTo } }, // exclude already fetched
      },
      include: {
        client: { select: { name: true } },
        vehicle: { select: { plateNumber: true } },
        driver: { select: { fullName: true } },
        carrier: { select: { name: true } },
      },
      orderBy: { paymentDueDate: 'asc' },
    });

    const mapTrip = (t: any, isPaymentDue = false) => ({
      id: t.id,
      tripNumber: t.tripNumber,
      routeFrom: t.routeFrom,
      routeTo: t.routeTo,
      tripType: t.tripType,
      status: t.status,
      tripDate: t.tripDate,
      clientRate: Number(t.clientRateAmd ?? t.clientRate ?? 0),
      profit: Number(t.profitAmd ?? t.profit ?? 0),
      clientName: t.client?.name,
      vehiclePlate: t.vehicle?.plateNumber,
      driverName: t.driver?.fullName,
      carrierName: t.carrier?.name,
      paymentDueDate: t.paymentDueDate ?? null,
      clientPaymentStatus: t.clientPaymentStatus,
      isPaymentDueEntry: isPaymentDue,
    });

    const result = [
      ...trips.map(t => mapTrip(t, false)),
      ...paymentDueTrips.map(t => mapTrip(t, true)),
    ];

    return NextResponse.json(result);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
