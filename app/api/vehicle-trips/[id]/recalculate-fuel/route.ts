export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { calculateVehicleTripTotals } from '@/lib/wialon/calculateTripFuel';
import { logClosedTripEdits } from '@/lib/vehicle-trips/close-trip';

/**
 * "Пересчитать по Wialon" — без ограничений по времени, можно вызывать сколько угодно
 * раз, любой ролью, независимо от статуса рейса (см. lib/vehicle-trips/attach-service.ts —
 * "рейс полностью редактируем независимо от статуса", явное решение пользователя от
 * 2026-07-23). Нужно, т.к. трекер буферизует данные при потере связи (например, транзит
 * через зоны без покрытия) и досылает их с задержкой в день-два.
 *
 * Пересчёт закрытого (completed) рейса логируется в VehicleTripEvent — было/стало по
 * calculatedKm/calculatedFuelConsumedL, та же логика и тот же список полей, что и при ручной
 * правке закрытого рейса (TMS-AUDIT-0025) — раньше пересчёт не оставлял никакого следа.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const userId = (session.user as any)?.id as string | undefined;

    const { id } = await params;
    const before = await prisma.vehicleTrip.findUnique({ where: { id } });
    const result = await calculateVehicleTripTotals(id);

    if (before && before.status === 'completed') {
      await logClosedTripEdits(id, userId, before, {
        ...before,
        calculatedKm: result.calculatedKm,
        calculatedFuelConsumedL: result.calculatedFuelConsumedL,
      });
    }

    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[vehicle-trips/recalculate-fuel] error:', e);
    return NextResponse.json({ error: e?.message ?? 'Ошибка пересчёта' }, { status: 500 });
  }
}
