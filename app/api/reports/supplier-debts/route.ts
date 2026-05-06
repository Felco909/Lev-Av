export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const supplierId = searchParams.get('supplierId');
    const vehicleId = searchParams.get('vehicleId');
    const paymentStatus = searchParams.get('paymentStatus');

    const where: any = {};
    if (supplierId) where.supplierId = supplierId;
    if (vehicleId) where.vehicleId = vehicleId;
    if (paymentStatus) where.paymentStatus = paymentStatus;

    const purchases = await prisma.partPurchase.findMany({
      where,
      include: {
        vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
        supplier: { select: { id: true, name: true, contactPerson: true, phone: true } },
      },
      orderBy: { date: 'desc' },
    });

    // Aggregate per supplier
    const supplierMap: Record<string, { supplier: any; totalAmount: number; paidAmount: number; debtAmount: number; count: number }> = {};
    let grandTotal = 0;
    let grandPaid = 0;

    for (const p of purchases) {
      const total = Number(p.totalAmount);
      const paid = Number(p.paidAmount);
      grandTotal += total;
      grandPaid += paid;

      const sid = p.supplierId || '_none';
      if (!supplierMap[sid]) {
        supplierMap[sid] = {
          supplier: p.supplier || { id: '_none', name: '\u0411\u0435\u0437 \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0430' },
          totalAmount: 0, paidAmount: 0, debtAmount: 0, count: 0,
        };
      }
      supplierMap[sid].totalAmount += total;
      supplierMap[sid].paidAmount += paid;
      supplierMap[sid].debtAmount += (total - paid);
      supplierMap[sid].count += 1;
    }

    return NextResponse.json({
      rows: purchases.map(p => ({
        id: p.id,
        date: p.date,
        partName: p.partName,
        quantity: p.quantity,
        totalAmount: p.totalAmount,
        paidAmount: p.paidAmount,
        debtAmount: Number(p.totalAmount) - Number(p.paidAmount),
        paymentStatus: p.paymentStatus,
        vehicle: p.vehicle,
        supplier: p.supplier,
      })),
      suppliers: Object.values(supplierMap).sort((a, b) => b.debtAmount - a.debtAmount),
      totals: { grandTotal, grandPaid, grandDebt: grandTotal - grandPaid },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430' }, { status: 500 });
  }
}
