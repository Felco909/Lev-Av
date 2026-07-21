export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/company-base/status — сводка по присутствию машин на базе компании, для
 * виджета "Автопарк" на дашборде: на базе / в рейсе / время отсутствия каждой машины.
 * Отдельный лёгкий роут, не трогает основную агрегацию app/api/dashboard/route.ts.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const vehicles = await prisma.vehicle.findMany({
    where: { wialonUnitId: { not: null }, status: 'active' },
    select: {
      id: true, plateNumber: true, brand: true, model: true,
      atBase: true, atBaseChangedAt: true,
      vehicleTrips: { where: { status: 'active' }, select: { tripNumber: true }, take: 1 },
    },
    orderBy: { plateNumber: 'asc' },
  });

  const result = vehicles.map((v) => ({
    id: v.id,
    plateNumber: v.plateNumber,
    brand: v.brand,
    model: v.model,
    atBase: v.atBase,
    atBaseChangedAt: v.atBaseChangedAt,
    activeTripNumber: v.vehicleTrips[0]?.tripNumber ?? null,
  }));

  return NextResponse.json(result);
}
