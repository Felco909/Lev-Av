export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
/**
 * POST /api/vehicle-trips/[id]/recalculate-income — обновление замороженного дохода
 * ЗАКРЫТОГО рейса по УЖЕ явно привязанным заявкам (Trip.vehicleTripId), например если
 * ставка одной из них была исправлена после закрытия. Состав заявок (сама привязка)
 * этим эндпоинтом больше не трогается и не пересобирается по датам — после закрытия
 * состав зафиксирован и не подлежит изменению (см. архитектуру "заявка → рейс"),
 * меняется только пересчитанная сумма по тому же набору.
 *
 * body: { confirm?: boolean } — без confirm (или confirm=false) отдаёт предпросмотр
 * (текущий состав и сумма по нему), НИЧЕГО не сохраняя. confirm=true — применяет:
 * обновляет finalRevenueAmd, пишет запись в журнал.
 */
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  const userId = (session.user as any)?.id as string | undefined;

  const body = await req.json().catch(() => ({}));
  const confirm = body?.confirm === true;

  const trip = await prisma.vehicleTrip.findUnique({ where: { id: params.id } });
  if (!trip) return NextResponse.json({ error: 'Рейс не найден' }, { status: 404 });
  if (trip.status !== 'completed') {
    return NextResponse.json({ error: 'Пересчёт с подтверждением нужен только для закрытых рейсов' }, { status: 400 });
  }

  const linkedTrips = await prisma.trip.findMany({
    where: { vehicleTripId: trip.id },
    select: { id: true, tripNumber: true, routeFrom: true, routeTo: true, tripDate: true, clientRateAmd: true, clientRate: true, client: { select: { name: true } } },
    orderBy: { tripDate: 'asc' },
  });
  const matched = linkedTrips.map((t) => ({
    id: t.id, tripNumber: t.tripNumber, routeFrom: t.routeFrom, routeTo: t.routeTo, tripDate: t.tripDate,
    clientRateAmd: Number(t.clientRateAmd || t.clientRate || 0), clientName: t.client?.name ?? null,
  }));
  const newRevenueAmd = matched.reduce((s, t) => s + t.clientRateAmd, 0);
  const oldRevenueAmd = trip.finalRevenueAmd != null ? Number(trip.finalRevenueAmd) : null;

  if (!confirm) {
    return NextResponse.json({
      preview: true,
      matchedTrips: matched,
      newRevenueAmd,
      oldRevenueAmd,
      changed: oldRevenueAmd !== newRevenueAmd,
    });
  }

  // Привязку заявок НЕ трогаем — состав закрытого рейса зафиксирован (см. архитектуру
  // "заявка → рейс"), пересчитывается только сумма по уже привязанному набору.
  const updated = await prisma.vehicleTrip.update({
    where: { id: trip.id },
    data: { finalRevenueAmd: newRevenueAmd },
  });

  await prisma.vehicleTripEvent.create({
    data: {
      vehicleTripId: trip.id, action: 'income_recalculated', field: 'finalRevenueAmd',
      oldValue: oldRevenueAmd != null ? String(oldRevenueAmd) : null,
      newValue: String(newRevenueAmd),
      userId: userId ?? null,
    },
  });

  return NextResponse.json({ preview: false, applied: true, matchedTrips: matched, finalRevenueAmd: updated.finalRevenueAmd });
}
