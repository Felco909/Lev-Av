export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const clients = await prisma.client.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { trips: true } }, contacts: { orderBy: { name: 'asc' } } } });
    return NextResponse.json(clients ?? []);
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
    if (!body?.name) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 });
    const client = await prisma.client.create({
      data: {
        name: body.name,
        contactPerson: body?.contactPerson ?? null,
        phone: body?.phone ?? null,
        email: body?.email ?? null,
        inn: body?.inn ?? null,
        address: body?.address ?? null,
        invoicePrefix: body?.invoicePrefix || '\u0421\u0427',
        actPrefix: body?.actPrefix || '\u0410\u041A\u0422',
        numberFormat: body?.numberFormat || '{prefix}-{number}',
        resetNumberingYearly: body?.resetNumberingYearly ?? false,
        paymentTermsDays: body?.paymentTermsDays ? parseInt(body.paymentTermsDays) : null,
      },
    });
    return NextResponse.json(client);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
