export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { login, getUnits, WialonApiError } from '@/lib/wialon/client';
import { getStoredWialonToken } from '@/lib/wialon/token-store';

/** Проверка соединения — логин + список техники. Ошибки Wialon возвращаются как 200/ok:false,
 *  чтобы фронтенд отличал "Wialon сказал нет" от настоящего сбоя сети/сервера. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  try {
    const dbToken = await getStoredWialonToken();
    const { sid, raw } = await login(dbToken ?? undefined);
    const units = await getUnits(sid);
    return NextResponse.json({
      ok: true,
      authorizedAs: typeof raw?.au === 'string' ? raw.au : null,
      unitsCount: units.length,
    });
  } catch (e: any) {
    if (e instanceof WialonApiError) {
      return NextResponse.json({ ok: false, error: e.message, code: e.code });
    }
    console.error('[api/wialon/test-connection] Неожиданная ошибка:', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'Неизвестная ошибка' });
  }
}
