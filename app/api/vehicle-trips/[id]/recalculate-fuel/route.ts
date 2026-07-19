export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { calculateVehicleTripTotals } from '@/lib/wialon/calculateTripFuel';

/**
 * "Пересчитать по Wialon" — без ограничений по времени, можно вызывать сколько угодно
 * раз. Нужно, т.к. трекер буферизует данные при потере связи (например, транзит через
 * зоны без покрытия) и досылает их с задержкой в день-два.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { id } = await params;
    const result = await calculateVehicleTripTotals(id);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[vehicle-trips/recalculate-fuel] error:', e);
    return NextResponse.json({ error: e?.message ?? 'Ошибка пересчёта' }, { status: 500 });
  }
}
