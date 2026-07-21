export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { findMatchingTrips, sumRevenueAmd } from '@/lib/vehicle-trips/revenue';

/**
 * POST /api/vehicle-trips/[id]/recalculate-income — пересчёт состава заявок и дохода
 * ПОСЛЕ ручной правки дат уже закрытого рейса ("Доработка логики рейсов", п.8): нельзя
 * автоматически менять архивные финансовые данные — только explicit-подтверждением.
 *
 * body: { confirm?: boolean } — без confirm (или confirm=false) отдаёт предпросмотр
 * (какие заявки войдут по текущим датам рейса, на какую сумму), НИЧЕГО не сохраняя.
 * confirm=true — применяет: обновляет привязку заявок (Trip.vehicleTripId) и
 * finalRevenueAmd, пишет запись в журнал.
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

  const matched = await findMatchingTrips(trip.vehicleId, trip.departureDate, trip.returnDate ?? new Date());
  const newRevenueAmd = sumRevenueAmd(matched);
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

  // Снимаем старую привязку (могли уйти заявки, не попадающие в новый диапазон дат) и
  // проставляем новую — набор, зафиксированный при закрытии, полностью заменяется.
  await prisma.trip.updateMany({ where: { vehicleTripId: trip.id }, data: { vehicleTripId: null } });
  if (matched.length > 0) {
    await prisma.trip.updateMany({ where: { id: { in: matched.map((t) => t.id) } }, data: { vehicleTripId: trip.id } });
  }

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
