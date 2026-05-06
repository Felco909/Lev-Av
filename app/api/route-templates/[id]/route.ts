export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { Decimal } from '@prisma/client/runtime/library';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const item = await prisma.routeTemplate.update({
      where: { id },
      data: {
        routeFrom: body.routeFrom,
        routeTo: body.routeTo,
        distance: body.distance ? Number(body.distance) : null,
        defaultRate: body.defaultRate ? new Decimal(Number(body.defaultRate)) : null,
        currency: body.currency || 'AMD',
        vehicleType: body.vehicleType || null,
        notes: body.notes || null,
      },
    });
    return NextResponse.json({ ...item, defaultRate: item.defaultRate != null ? Number(item.defaultRate) : null });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });
    const { id } = await params;
    await prisma.routeTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430' }, { status: 500 });
  }
}
