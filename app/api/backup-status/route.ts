export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getBackupStatus } from '@/lib/backup-status';

/**
 * Статус свежести бэкапа БД (локального pg_dump и копии на Google Drive) — для риска на
 * Dashboard (TMS-AUDIT-0042). Без ограничения по роли — тот же класс информации, что
 * /api/finance/audit (только проверка сессии).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    return NextResponse.json(getBackupStatus());
  } catch (e: any) {
    console.error('[backup-status] error:', e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
