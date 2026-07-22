export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { checkOwnFleetDataIntegrity } from '@/lib/finance/integrity-check';

/**
 * Диагностика целостности данных архитектуры "заявка → рейс" (Этап 0 миграции,
 * см. согласованный план). Только чтение, ничего не исправляет — список нарушений
 * для последующего разбора администратором/диспетчером.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const violations = await checkOwnFleetDataIntegrity();
    const bySeverity = {
      error: violations.filter((v) => v.severity === 'error').length,
      warning: violations.filter((v) => v.severity === 'warning').length,
      info: violations.filter((v) => v.severity === 'info').length,
    };

    return NextResponse.json({ violations, total: violations.length, bySeverity });
  } catch (e: any) {
    console.error('[finance/own-fleet-integrity] error:', e);
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status: 500 });
  }
}
