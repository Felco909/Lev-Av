export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Введите email и пароль' }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'Неверные данные' }, { status: 401 });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Неверные данные' }, { status: 401 });
    }
    return NextResponse.json({ id: user.id, email: user.email, fullName: user.fullName, role: user.role });
  } catch (e: any) {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
