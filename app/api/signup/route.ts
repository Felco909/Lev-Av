export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { assertRole, USER_MANAGEMENT_ROLES, KNOWN_USER_ROLES } from '@/lib/auth/role-guard';

/**
 * Создание учётной записи — только для admin/owner. Раньше был публичным
 * (доступен без входа со страницы логина) — за 2.5 месяца так создалось
 * 104 мусорных testuser*@example.com аккаунта с ролью dispatcher.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const guard = assertRole(session, USER_MANAGEMENT_ROLES, 'создание пользователя');
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const { email, password, fullName, role } = await req.json();
    if (!email || !password || !fullName) {
      return NextResponse.json({ error: 'Заполните все поля' }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Пользователь уже существует' }, { status: 409 });
    }
    const requestedRole = String(role ?? '').trim().toLowerCase();
    const finalRole = (KNOWN_USER_ROLES as readonly string[]).includes(requestedRole) ? requestedRole : 'dispatcher';
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash: hash, fullName, role: finalRole },
    });
    return NextResponse.json({ id: user.id, email: user.email, fullName: user.fullName, role: user.role });
  } catch (e: any) {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
