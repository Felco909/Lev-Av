export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { compareIncomeCalculations } from '@/lib/finance/income-diagnostic';

/**
 * Shadow-диагностика: старый расчёт дохода рейса (по датам) vs новый (по
 * vehicleTripId) — см. Этап 3 согласованного плана. Только чтение.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const rows = await compareIncomeCalculations();
    const mismatches = rows.filter((r) => r.reason !== 'match');
    const needsReview = rows.filter((r) => r.reason === 'needs_manual_review');

    return NextResponse.json({
      rows,
      total: rows.length,
      mismatchCount: mismatches.length,
      needsManualReviewCount: needsReview.length,
    });
  } catch (e: any) {
    console.error('[finance/income-diagnostic] error:', e);
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status: 500 });
  }
}
