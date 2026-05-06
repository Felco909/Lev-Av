export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const drivers = await prisma.driver.findMany({ orderBy: { fullName: 'asc' } });
    return NextResponse.json(drivers ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();
    if (!body?.fullName) return NextResponse.json({ error: 'Укажите ФИО' }, { status: 400 });
    const d = await prisma.driver.create({ data: { fullName: body.fullName, phone: body?.phone ?? null, licenseNumber: body?.licenseNumber ?? null, status: body?.status ?? 'active' } });
    return NextResponse.json(d);
  } catch (e: any) {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
