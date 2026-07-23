export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { attachTripsToVehicleTrip } from '@/lib/vehicle-trips/attach-service';

/**
 * Массовая привязка заявок к рейсу — карточка рейса ("Добавить заявки") и
 * предложение после создания нового рейса (см. Этап 2 архитектуры "заявка → рейс").
 * Рейс полностью редактируем независимо от статуса (переработка модуля "Рейсы",
 * 2026-07-23) — привязка/перенос заявок работает и для завершённого рейса.
 */
export async function POST(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const body = await req.json();
    const tripIds: string[] = Array.isArray(body?.tripIds) ? body.tripIds : [];
    if (tripIds.length === 0) {
      return NextResponse.json({ error: 'Не указаны заявки для привязки' }, { status: 400 });
    }

    const result = await attachTripsToVehicleTrip(params.id, tripIds);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[vehicle-trips/attach-trips] error:', e);
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status: 500 });
  }
}
