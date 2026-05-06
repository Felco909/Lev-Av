export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const items = await prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { partPurchases: true } } },
    });
    return NextResponse.json(items);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();
    const { name, contactPerson, phone, paymentTerms } = body;
    if (!name) return NextResponse.json({ error: 'Укажите название' }, { status: 400 });
    const item = await prisma.supplier.create({
      data: { name, contactPerson: contactPerson || null, phone: phone || null, paymentTerms: paymentTerms || null },
    });
    return NextResponse.json(item);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка создания' }, { status: 500 });
  }
}
