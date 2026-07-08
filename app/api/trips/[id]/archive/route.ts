export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { isArchivedStatus, validateTripArchiveTransition } from '@/lib/trip-archive-rules';

/** Ручная отправка заявки в архив (без автоархива). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const trip = await prisma.trip.findUnique({ where: { id: params?.id } });
    if (!trip) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
    if (isArchivedStatus(trip.status)) {
      return NextResponse.json({ error: 'Заявка уже в архиве' }, { status: 400 });
    }

    const validation = validateTripArchiveTransition({
      status: trip.status,
      taxCode: trip.taxCode,
    });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.message, missing: validation.missing }, { status: 422 });
    }

    const updated = await prisma.trip.update({
      where: { id: trip.id },
      data: { status: 'archived' },
    });

    return NextResponse.json({ success: true, status: updated.status });
  } catch (e) {
    console.error('POST /api/trips/[id]/archive', e);
    return NextResponse.json({ error: 'Ошибка архивации' }, { status: 500 });
  }
}

/** Вернуть заявку из архива в «Оплачен / Завершён». */
export async function PUT(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const trip = await prisma.trip.findUnique({ where: { id: params?.id } });
    if (!trip) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
    if (!isArchivedStatus(trip.status)) {
      return NextResponse.json({ error: 'Заявка не в архиве' }, { status: 400 });
    }

    const updated = await prisma.trip.update({
      where: { id: trip.id },
      data: { status: 'completed' },
    });

    return NextResponse.json({ success: true, status: updated.status });
  } catch (e) {
    console.error('PUT /api/trips/[id]/archive', e);
    return NextResponse.json({ error: 'Ошибка возврата из архива' }, { status: 500 });
  }
}
