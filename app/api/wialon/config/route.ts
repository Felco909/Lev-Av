export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { assertRole, WIALON_CONFIG_ROLES } from '@/lib/auth/role-guard';
import { getStoredWialonToken, saveWialonToken, clearWialonToken, maskToken } from '@/lib/wialon/token-store';
import { sanitizeToken } from '@/lib/wialon/client';

/** Статус подключения — токен не отдаётся целиком, только маска и источник (БД/.env). */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const dbToken = await getStoredWialonToken();
  const envToken = process.env.WIALON_TOKEN || null;
  const activeToken = dbToken ?? envToken;

  return NextResponse.json({
    configured: !!activeToken,
    source: dbToken ? 'db' : envToken ? 'env' : null,
    maskedToken: activeToken ? maskToken(sanitizeToken(activeToken)) : null,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const guard = assertRole(session, WIALON_CONFIG_ROLES, 'настройка подключения Wialon');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (token.length < 10) {
    return NextResponse.json({ error: 'Некорректный токен' }, { status: 400 });
  }

  try {
    await saveWialonToken(token);
  } catch (e: any) {
    console.error('[api/wialon/config] Ошибка сохранения токена:', e);
    return NextResponse.json({ error: e?.message ?? 'Не удалось сохранить токен' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  const guard = assertRole(session, WIALON_CONFIG_ROLES, 'удаление подключения Wialon');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  await clearWialonToken();
  return NextResponse.json({ success: true });
}
