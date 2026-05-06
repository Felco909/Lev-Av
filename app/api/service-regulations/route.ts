export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const items = await prisma.serviceRegulation.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { serviceRecords: true } } } });
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
    const { name, description, mileageInterval, monthsInterval } = body;
    if (!name) return NextResponse.json({ error: 'Укажите название' }, { status: 400 });
    if (!mileageInterval && !monthsInterval) return NextResponse.json({ error: 'Укажите хотя бы один интервал' }, { status: 400 });
    const item = await prisma.serviceRegulation.create({
      data: {
        name,
        description: description || null,
        mileageInterval: mileageInterval ? Number(mileageInterval) : null,
        monthsInterval: monthsInterval ? Number(monthsInterval) : null,
      },
    });
    return NextResponse.json(item);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка создания' }, { status: 500 });
  }
}
