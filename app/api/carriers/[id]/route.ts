export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function PUT(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();
    const c = await prisma.carrier.update({ where: { id: params?.id }, data: { name: body?.name, contactPerson: body?.contactPerson ?? null, phone: body?.phone ?? null, email: body?.email ?? null, inn: body?.inn ?? null } });
    return NextResponse.json(c);
  } catch (e: any) {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    await prisma.carrier.delete({ where: { id: params?.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'Невозможно удалить' }, { status: 500 });
  }
}
