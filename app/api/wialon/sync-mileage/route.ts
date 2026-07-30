export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { syncVehicleMileageFromWialon } from '@/lib/wialon/syncMileage';
import { WialonApiError } from '@/lib/wialon/client';
import { assertRole, WIALON_CONFIG_ROLES } from '@/lib/auth/role-guard';

/**
 * Ручной/UI-триггер синхронизации пробега с Wialon (см. lib/wialon/syncMileage.ts).
 * Для ежедневного автозапуска — scripts/wialon-sync-mileage.ts через Windows Task Scheduler,
 * этот роут его не подменяет (используются одна и та же функция, скрипт вызывает её напрямую,
 * минуя HTTP — эта проверка роли на плановый запуск не влияет).
 * Та же роль, что и у соседних wialon/config и wialon/sync-vehicles (аудит, п.4) — раньше
 * здесь была только проверка логина, без роли.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const guard = assertRole(session, WIALON_CONFIG_ROLES, 'синхронизация пробега с Wialon');
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

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
