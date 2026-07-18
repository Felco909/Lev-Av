export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { assertRole, CRITICAL_PAYMENTS_ROLES } from '@/lib/auth/role-guard';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });
    const guard = assertRole(session, CRITICAL_PAYMENTS_ROLES, '\u0440\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u0437\u0430\u043a\u0443\u043f\u043a\u0438 \u0437\u0430\u043f\u0447\u0430\u0441\u0442\u0435\u0439');
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { id } = await params;
    const body = await req.json();
    const { vehicleId, supplierId, date, partName, quantity, unitPrice, notes } = body;
    const qty = Number(quantity) || 1;
    const price = Number(unitPrice) || 0;
    const total = qty * price;
    const item = await prisma.partPurchase.update({
      where: { id },
      data: {
        vehicleId, supplierId: supplierId || null,
        date: new Date(date), partName,
        quantity: qty, unitPrice: price, totalAmount: total,
        notes: notes || null,
      },
      include: {
        vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
        supplier: { select: { id: true, name: true } },
        payments: { orderBy: { paymentDate: 'desc' } },
        attachments: true,
      },
    });
    return NextResponse.json(item);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });
    const guard = assertRole(session, CRITICAL_PAYMENTS_ROLES, '\u0443\u0434\u0430\u043b\u0435\u043d\u0438\u0435 \u0437\u0430\u043a\u0443\u043f\u043a\u0438 \u0437\u0430\u043f\u0447\u0430\u0441\u0442\u0435\u0439');
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { id } = await params;
    await prisma.partPurchase.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0443\u0434\u0430\u043b\u0435\u043d\u0438\u044f' }, { status: 500 });
  }
}
