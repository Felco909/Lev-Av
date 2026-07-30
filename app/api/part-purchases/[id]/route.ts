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

    // Пересчёт статуса оплаты после правки суммы (аудит, средний приоритет) — раньше
    // paidAmount/paymentStatus не трогались при PUT, поэтому правка цены/количества после
    // отметки "оплачено" могла оставить закупку помеченной оплаченной, хотя фактически
    // образовался новый долг. Та же логика, что и в payments/route.ts (POST/DELETE платежа).
    const existingPayments = await prisma.partPayment.findMany({ where: { partPurchaseId: id } });
    const totalPaid = existingPayments.reduce((s, p) => s + Number(p.amount), 0);
    let paymentStatus = 'unpaid';
    if (totalPaid >= total && total > 0) paymentStatus = 'paid';
    else if (totalPaid > 0) paymentStatus = 'partial';

    const item = await prisma.partPurchase.update({
      where: { id },
      data: {
        vehicleId, supplierId: supplierId || null,
        date: new Date(date), partName,
        quantity: qty, unitPrice: price, totalAmount: total,
        paidAmount: totalPaid, paymentStatus,
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
    // Безопасная блокировка (аудит, п.6) — PartPayment.partPurchase каскадно удаляется
    // вместе с закупкой (ON DELETE CASCADE), т.е. физическое удаление закупки с уже
    // записанными платежами молча стирает и историю этих платежей.
    const paymentsCount = await prisma.partPayment.count({ where: { partPurchaseId: id } });
    if (paymentsCount > 0) {
      return NextResponse.json(
        { error: `Невозможно удалить — по закупке уже записано платежей: ${paymentsCount}. Сначала удалите платежи.` },
        { status: 409 }
      );
    }
    await prisma.partPurchase.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0443\u0434\u0430\u043b\u0435\u043d\u0438\u044f' }, { status: 500 });
  }
}
