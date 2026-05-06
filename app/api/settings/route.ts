export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

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
