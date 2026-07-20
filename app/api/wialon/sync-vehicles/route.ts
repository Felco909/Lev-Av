export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { assertRole, WIALON_CONFIG_ROLES } from '@/lib/auth/role-guard';
import { matchVehiclesWithWialon } from '@/lib/wialon/matchVehicles';
import { WialonApiError } from '@/lib/wialon/client';

/** Сопоставляет машины TMS с объектами Wialon по гос.номеру (lib/wialon/matchVehicles.ts) —
 *  не создаёт новых машин, только заполняет Vehicle.wialonUnitId у существующих. */
export async function POST() {
  const session = await getServerSession(authOptions);
  const guard = assertRole(session, WIALON_CONFIG_ROLES, 'синхронизация машин с Wialon');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const result = await matchVehiclesWithWialon();
    return NextResponse.json(result);
  } catch (e: any) {
    if (e instanceof WialonApiError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error('[api/wialon/sync-vehicles] Ошибка синхронизации:', e);
    return NextResponse.json({ error: e?.message ?? 'Неизвестная ошибка' }, { status: 500 });
  }
}
