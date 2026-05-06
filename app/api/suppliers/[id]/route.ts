export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const { name, contactPerson, phone, paymentTerms } = body;
    const item = await prisma.supplier.update({
      where: { id },
      data: { name, contactPerson: contactPerson || null, phone: phone || null, paymentTerms: paymentTerms || null },
    });
    return NextResponse.json(item);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const { id } = await params;
    // Check for linked purchases
    const cnt = await prisma.partPurchase.count({ where: { supplierId: id } });
    if (cnt > 0) return NextResponse.json({ error: `Невозможно удалить — у поставщика ${cnt} запись(ей)` }, { status: 400 });
    await prisma.supplier.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка удаления' }, { status: 500 });
  }
}
