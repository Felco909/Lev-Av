export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

/** GET /api/vehicle-trips/[id]/events — история статусов по геозонам (Этап 7). */
export async function GET(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const events = await prisma.vehicleTripEvent.findMany({
    where: { vehicleTripId: params.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(events);
}
