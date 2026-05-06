export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();
    const d = await prisma.driver.update({ where: { id: params?.id }, data: { fullName: body?.fullName, phone: body?.phone ?? null, licenseNumber: body?.licenseNumber ?? null, status: body?.status } });
    return NextResponse.json(d);
  } catch (e: any) {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    await prisma.driver.delete({ where: { id: params?.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'Невозможно удалить' }, { status: 500 });
  }
}
