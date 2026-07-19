export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { syncVehicleMileageFromWialon } from '@/lib/wialon/syncMileage';
import { WialonApiError } from '@/lib/wialon/client';

/**
 * Ручной/UI-триггер синхронизации пробега с Wialon (см. lib/wialon/syncMileage.ts).
 * Для ежедневного автозапуска — scripts/wialon-sync-mileage.ts через Windows Task Scheduler,
 * этот роут его не подменяет (используются одна и та же функция).
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const result = await syncVehicleMileageFromWialon();
    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[wialon/sync-mileage] error:', e);
    if (e instanceof WialonApiError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    return NextResponse.json({ error: e?.message ?? 'Ошибка синхронизации с Wialon' }, { status: 500 });
  }
}
