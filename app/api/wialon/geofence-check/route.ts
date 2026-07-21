export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { runGeofenceCheck } from '@/lib/wialon/geofenceCheck';

/** POST — ручной запуск проверки геозон (та же логика, что и по расписанию каждые 5 мин,
 *  scripts/wialon-geofence-check.ts) — для немедленной проверки/тестирования. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  try {
    const result = await runGeofenceCheck();
    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[api/wialon/geofence-check] Ошибка:', e);
    return NextResponse.json({ error: e?.message ?? 'Неизвестная ошибка' }, { status: 500 });
  }
}
