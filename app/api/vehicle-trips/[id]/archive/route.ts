export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

/** Отправить завершённый рейс машины в архив. */
export async function POST(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const vt = await prisma.vehicleTrip.findUnique({ where: { id: params?.id } });
    if (!vt) return NextResponse.json({ error: 'Рейс не найден' }, { status: 404 });
    if (vt.status === 'archived') {
      return NextResponse.json({ error: 'Рейс уже в архиве' }, { status: 400 });
    }
    if (vt.status !== 'completed') {
      return NextResponse.json({ error: 'В архив можно отправить только завершённый рейс' }, { status: 400 });
    }

    const updated = await prisma.vehicleTrip.update({
      where: { id: vt.id },
      data: { status: 'archived' },
    });

    return NextResponse.json({ success: true, status: updated.status });
  } catch (e) {
    console.error('POST /api/vehicle-trips/[id]/archive', e);
    return NextResponse.json({ error: 'Ошибка архивации' }, { status: 500 });
  }
}

/** Вернуть рейс из архива в «Завершён». */
export async function PUT(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const vt = await prisma.vehicleTrip.findUnique({ where: { id: params?.id } });
    if (!vt) return NextResponse.json({ error: 'Рейс не найден' }, { status: 404 });
    if (vt.status !== 'archived') {
      return NextResponse.json({ error: 'Рейс не в архиве' }, { status: 400 });
    }

    const updated = await prisma.vehicleTrip.update({
      where: { id: vt.id },
      data: { status: 'completed' },
    });

    return NextResponse.json({ success: true, status: updated.status });
  } catch (e) {
    console.error('PUT /api/vehicle-trips/[id]/archive', e);
    return NextResponse.json({ error: 'Ошибка возврата из архива' }, { status: 500 });
  }
}
