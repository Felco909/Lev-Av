export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { assertRole, CRITICAL_PAYMENTS_ROLES } from '@/lib/auth/role-guard';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });
    const guard = assertRole(session, CRITICAL_PAYMENTS_ROLES, '\u0441\u043e\u0437\u0434\u0430\u043d\u0438\u0435 \u043f\u043b\u0430\u0442\u0435\u0436\u0430 \u0437\u0430 \u0437\u0430\u043f\u0447\u0430\u0441\u0442\u0438');
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { id } = await params;
    const body = await req.json();
    const { amount, paymentDate, notes } = body;
    if (!amount || !paymentDate) {
      return NextResponse.json({ error: '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0441\u0443\u043c\u043c\u0443 \u0438 \u0434\u0430\u0442\u0443' }, { status: 400 });
    }

    const purchase = await prisma.partPurchase.findUnique({ where: { id } });
    if (!purchase) return NextResponse.json({ error: '\u0417\u0430\u043f\u0438\u0441\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430' }, { status: 404 });

    const payment = await prisma.partPayment.create({
      data: {
        partPurchaseId: id,
        amount: Number(amount),
        paymentDate: new Date(paymentDate),
        notes: notes || null,
      },
    });

    // Recalculate paid amount
    const allPayments = await prisma.partPayment.findMany({ where: { partPurchaseId: id } });
    const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);
    const totalAmount = Number(purchase.totalAmount);
    let paymentStatus = 'unpaid';
    if (totalPaid >= totalAmount) paymentStatus = 'paid';
    else if (totalPaid > 0) paymentStatus = 'partial';

    await prisma.partPurchase.update({
      where: { id },
      data: { paidAmount: totalPaid, paymentStatus },
    });

    return NextResponse.json(payment);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });
    const guard = assertRole(session, CRITICAL_PAYMENTS_ROLES, '\u0443\u0434\u0430\u043b\u0435\u043d\u0438\u0435 \u043f\u043b\u0430\u0442\u0435\u0436\u0430 \u0437\u0430 \u0437\u0430\u043f\u0447\u0430\u0441\u0442\u0438');
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { id: purchaseId } = await params;
    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get('paymentId');
    if (!paymentId) return NextResponse.json({ error: '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 paymentId' }, { status: 400 });

    await prisma.partPayment.delete({ where: { id: paymentId } });

    // Recalculate
    const purchase = await prisma.partPurchase.findUnique({ where: { id: purchaseId } });
    if (purchase) {
      const allPayments = await prisma.partPayment.findMany({ where: { partPurchaseId: purchaseId } });
      const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);
      const totalAmount = Number(purchase.totalAmount);
      let paymentStatus = 'unpaid';
      if (totalPaid >= totalAmount) paymentStatus = 'paid';
      else if (totalPaid > 0) paymentStatus = 'partial';
      await prisma.partPurchase.update({
        where: { id: purchaseId },
        data: { paidAmount: totalPaid, paymentStatus },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0443\u0434\u0430\u043b\u0435\u043d\u0438\u044f' }, { status: 500 });
  }
}
