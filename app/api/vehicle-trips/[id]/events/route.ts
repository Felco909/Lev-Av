export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/vehicle-trips/[id]/events — журнал событий рейса: статусы по базе компании
 * (Этап 7) + ручные правки/закрытие/пересчёт дохода закрытого рейса ("Доработка логики
 * рейсов", п.7). userId — обычный String (без Prisma-связи), поэтому имя пользователя
 * подтягивается отдельным запросом и подмешивается сюда же.
 */
export async function GET(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const events = await prisma.vehicleTripEvent.findMany({
    where: { vehicleTripId: params.id },
    orderBy: { createdAt: 'desc' },
  });

  const userIds = [...new Set(events.map((e) => e.userId).filter((id): id is string => !!id))];
  const users = userIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } })
    : [];
  const userById = new Map(users.map((u) => [u.id, u.fullName || u.email]));

  return NextResponse.json(events.map((e) => ({ ...e, userName: e.userId ? (userById.get(e.userId) ?? null) : null })));
}
