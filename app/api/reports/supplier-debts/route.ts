export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { computeDebtAmd } from '@/lib/finance/formulas';
import { getSupplierDebtRows } from '@/lib/finance/debts-service';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const supplierId = searchParams.get('supplierId');
    const vehicleId = searchParams.get('vehicleId');
    const paymentStatus = searchParams.get('paymentStatus');

    const purchases = await getSupplierDebtRows(prisma, { supplierId, vehicleId, paymentStatus });

    // Aggregate per supplier
    const supplierMap: Record<string, { supplier: any; totalAmount: number; paidAmount: number; debtAmount: number; count: number }> = {};
    let grandTotal = 0;
    let grandPaid = 0;

    for (const p of purchases) {
      const total = Number(p.totalAmount);
      const paid = Number(p.paidAmount);
      grandTotal += total;
      grandPaid += paid;

      const sid = p.supplier?.id || '_none';
      if (!supplierMap[sid]) {
        supplierMap[sid] = {
          supplier: p.supplier || { id: '_none', name: '\u0411\u0435\u0437 \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0430' },
          totalAmount: 0, paidAmount: 0, debtAmount: 0, count: 0,
        };
      }
      supplierMap[sid].totalAmount += total;
      supplierMap[sid].paidAmount += paid;
      // computeDebtAmd \u2014 \u043d\u0435 \u0443\u0445\u043e\u0434\u0438\u0442 \u0432 \u043c\u0438\u043d\u0443\u0441 \u043d\u0430 \u043f\u0435\u0440\u0435\u043f\u043b\u0430\u0442\u0435 (\u0430\u0443\u0434\u0438\u0442 "\u041e\u0442\u0447\u0451\u0442\u044b": \u0440\u0430\u043d\u044c\u0448\u0435 \u0437\u0434\u0435\u0441\u044c \u0434\u043e\u043b\u0433
      // \u043c\u043e\u0433 \u0431\u044b\u0442\u044c \u043e\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u043c, \u0430 \u0432 /api/reports/company-debts \u0442\u0430 \u0436\u0435 \u043f\u0435\u0440\u0435\u043f\u043b\u0430\u0442\u0430 \u0432\u0441\u0435\u0433\u0434\u0430
      // \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u043b\u0430 0 \u2014 \u0434\u0432\u0430 \u044d\u043a\u0440\u0430\u043d\u0430 \u0440\u0430\u0441\u0445\u043e\u0434\u0438\u043b\u0438\u0441\u044c \u043d\u0430 \u043e\u0434\u043d\u043e\u0439 \u0438 \u0442\u043e\u0439 \u0436\u0435 \u0437\u0430\u043a\u0443\u043f\u043a\u0435).
      supplierMap[sid].debtAmount += computeDebtAmd(total, paid);
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
        debtAmount: computeDebtAmd(Number(p.totalAmount), Number(p.paidAmount)),
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
