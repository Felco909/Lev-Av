export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { detachTripFromVehicleTrip } from '@/lib/vehicle-trips/attach-service';

/**
 * POST /api/trips/[id]/detach — открепить заявку от рейса (карточка рейса, кнопка
 * "Открепить" в списке привязанных заявок). Заявка возвращается в "Ожидают привязки".
 */
export async function POST(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    await detachTripFromVehicleTrip(params.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[trips/detach] error:', e);
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status: 500 });
  }
}
