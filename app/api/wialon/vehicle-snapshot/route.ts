export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getOdometerAtDate, getFuelLevelAtDate, WialonApiError } from '@/lib/wialon/client';

// getOdometerAtDate прогоняет весь GPS-трек от даты до сейчас (getMileageFromTrack) — дороже
// прямого запроса, поэтому глубину в прошлое ограничиваем ради отзывчивости интерактивного
// автозаполнения. 45 дней с запасом покрывает типичный длинный рейс этого парка (см. CLAUDE.md:
// маршруты Армения-Россия-Грузия/СНГ), полноценный расчёт на любую дату остаётся доступен через
// "Пересчитать по Wialon" (calculateVehicleTripTotals), который считает по границам самого рейса,
// а не "от даты до сейчас", и не имеет этого ограничения.
const MILEAGE_TRACK_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

// Остаток топлива ищется в окне вокруг даты (см. getFuelLevelAtDate, до ±7 дней) — если там
// пусто, дальше не расширяем: это уже "нет данных", а не "слишком старая дата".
const FUEL_APPROXIMATE_THRESHOLD_SEC = 30 * 60;

/**
 * Снимок пробега/топлива машины НА КОНКРЕТНУЮ ДАТУ — используется для автозаполнения полей
 * Выезд/Возврат в форме рейса. Оба значения — честные исторические (пробег: текущий счётчик
 * минус пройденное по GPS-треку с даты; топливо: ближайшее по времени сырое показание датчика
 * рядом с датой), а не "текущее значение с оговоркой", как было раньше.
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

    const withinMileageWindow = Math.abs(Date.now() - datetime.getTime()) <= MILEAGE_TRACK_WINDOW_MS;

    const [mileageResult, fuelResult] = await Promise.all([
      withinMileageWindow
        ? getOdometerAtDate(unitId, datetime).catch(() => ({ mileageKm: null, raw: {} }))
        : Promise.resolve({ mileageKm: null, raw: { reason: 'too_old_for_track' } }),
      getFuelLevelAtDate(unitId, datetime).catch(() => ({ fuelLevelL: null, measuredAt: null, lat: null, lon: null, raw: {} })),
    ]);

    if (mileageResult.mileageKm == null && fuelResult.fuelLevelL == null) {
      return NextResponse.json({ available: false, reason: withinMileageWindow ? 'no_data' : 'too_old' });
    }

    const fuelDiffSec = typeof fuelResult.raw?.diffSeconds === 'number' ? fuelResult.raw.diffSeconds : null;
    const isApproximate = fuelDiffSec != null && fuelDiffSec > FUEL_APPROXIMATE_THRESHOLD_SEC;

    return NextResponse.json({
      available: true,
      mileageKm: mileageResult.mileageKm,
      fuelLevelL: fuelResult.fuelLevelL,
      lat: fuelResult.lat,
      lon: fuelResult.lon,
      measuredAt: fuelResult.measuredAt ? fuelResult.measuredAt.toISOString() : null,
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
