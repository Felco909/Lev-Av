export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getCurrentSnapshot, WialonApiError } from '@/lib/wialon/client';

const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // ±30 дней (решено с пользователем)
const SAME_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Снимок пробега/топлива машины "сейчас" — используется для автозаполнения полей
 * Выезд/Возврат в форме рейса, ТОЛЬКО когда запрошенная дата близка к текущей
 * (см. CLAUDE.md/план: произвольный исторический разбор сырых сообщений Wialon
 * сочли слишком рискованным — можно разойтись с тем, что показывает сам Wialon).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const wialonUnitId = req.nextUrl.searchParams.get('wialonUnitId');
    const datetimeParam = req.nextUrl.searchParams.get('datetime');
    if (!wialonUnitId || !datetimeParam) {
      return NextResponse.json({ error: 'Укажите wialonUnitId и datetime' }, { status: 400 });
    }
    const unitId = Number(wialonUnitId);
    if (!Number.isFinite(unitId)) {
      return NextResponse.json({ error: 'wialonUnitId должен быть числом' }, { status: 400 });
    }
    const datetime = new Date(datetimeParam);
    if (isNaN(datetime.getTime())) {
      return NextResponse.json({ error: 'Некорректный datetime' }, { status: 400 });
    }

    if (Math.abs(Date.now() - datetime.getTime()) > RECENT_WINDOW_MS) {
      return NextResponse.json({ available: false, reason: 'too_old' });
    }

    const snapshot = await getCurrentSnapshot(unitId);
    if (snapshot.mileageKm == null && snapshot.fuelLevelL == null) {
      return NextResponse.json({ available: false, reason: 'no_data' });
    }

    // Snapshot всегда отражает ТЕКУЩЕЕ показание (Wialon не хранит истории без отчёта,
    // см. план) — если запрошенная дата не сегодня/вчера, это лишь приближение,
    // фронтенд должен явно предупредить об этом диспетчера.
    const isApproximate = Math.abs(Date.now() - datetime.getTime()) > SAME_DAY_MS;

    return NextResponse.json({
      available: true,
      mileageKm: snapshot.mileageKm,
      fuelLevelL: snapshot.fuelLevelL,
      measuredAt: snapshot.measuredAt ? snapshot.measuredAt.toISOString() : null,
      isApproximate,
    });
  } catch (e: any) {
    console.error('[wialon/vehicle-snapshot] error:', e);
    if (e instanceof WialonApiError) {
      return NextResponse.json({ available: false, reason: 'wialon_error' });
    }
    return NextResponse.json({ available: false, reason: 'wialon_error' });
  }
}
