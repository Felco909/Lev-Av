export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { runCompanyBaseCheck } from '@/lib/company-base/baseCheck';

/** Ручной/немедленный запуск проверки базы компании — то же самое, что фоновая задача
 *  каждые 5 минут (Windows Task Scheduler), но по требованию (для теста или отладки). */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const result = await runCompanyBaseCheck();
  return NextResponse.json(result);
}
