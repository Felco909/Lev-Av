export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { Decimal } from '@prisma/client/runtime/library';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });
    const templates = await prisma.routeTemplate.findMany({ orderBy: { routeFrom: 'asc' } });
    return NextResponse.json(templates.map(t => ({
      ...t,
      defaultRate: t.defaultRate != null ? Number(t.defaultRate) : null,
    })));
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });
    const body = await req.json();
    const { routeFrom, routeTo, distance, defaultRate, currency, vehicleType, notes } = body;
    if (!routeFrom || !routeTo) return NextResponse.json({ error: '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u043c\u0430\u0440\u0448\u0440\u0443\u0442' }, { status: 400 });
    const item = await prisma.routeTemplate.create({
      data: {
        routeFrom,
        routeTo,
        distance: distance ? Number(distance) : null,
        defaultRate: defaultRate ? new Decimal(Number(defaultRate)) : null,
        currency: currency || 'AMD',
        vehicleType: vehicleType || null,
        notes: notes || null,
      },
    });
    return NextResponse.json({ ...item, defaultRate: item.defaultRate != null ? Number(item.defaultRate) : null });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u044f' }, { status: 500 });
  }
}
