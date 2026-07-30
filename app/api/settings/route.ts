export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { assertRole, COMPANY_REQUISITES_ROLES } from '@/lib/auth/role-guard';

/**
 * Реквизиты компании (печатаются на счетах/актах) — правка только admin/owner/director/
 * accountant (см. аудит, п.7). Всё остальное в этой же таблице Setting — персональные
 * ключи вида dashboard_mode:<email>/dashboard_widgets:<email>/reports_widgets:<email> —
 * доступно любому авторизованному пользователю, как и раньше.
 */
const COMPANY_SETTING_KEYS = new Set([
  'company_name',
  'company_inn',
  'company_address',
  'company_phone',
  'company_bank',
  'company_director',
]);

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const settings = await prisma.setting.findMany();
    const map: Record<string, string> = {};
    for (const s of settings) { map[s.key] = s.value; }
    return NextResponse.json(map);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();
    const { key, value } = body;
    if (!key || typeof value !== 'string') return NextResponse.json({ error: 'key и value обязательны' }, { status: 400 });

    if (COMPANY_SETTING_KEYS.has(key)) {
      const guard = assertRole(session, COMPANY_REQUISITES_ROLES, 'изменение реквизитов компании');
      if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
