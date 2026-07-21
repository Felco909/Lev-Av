export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const carriers = await prisma.carrier.findMany({ orderBy: { name: 'asc' } });
    return NextResponse.json(carriers ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();
    if (!body?.name) return NextResponse.json({ error: 'Укажите название' }, { status: 400 });
    const c = await prisma.carrier.create({ data: { name: body.name, contactPerson: body?.contactPerson ?? null, phone: body?.phone ?? null, email: body?.email ?? null, inn: body?.inn ?? null, address: body?.address ?? null, bankDetails: body?.bankDetails ?? null } });
    return NextResponse.json(c);
  } catch (e: any) {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
