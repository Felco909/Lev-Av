export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { email, password, fullName } = await req.json();
    if (!email || !password || !fullName) {
      return NextResponse.json({ error: 'Заполните все поля' }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Пользователь уже существует' }, { status: 409 });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash: hash, fullName, role: 'dispatcher' },
    });
    return NextResponse.json({ id: user.id, email: user.email, fullName: user.fullName });
  } catch (e: any) {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
