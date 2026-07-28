export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { computeDebtAmd } from '@/lib/finance/formulas';
import { getCarrierDebtRows, getSupplierDebtRows } from '@/lib/finance/debts-service';

function fmtDate(d: Date | string | null): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041D\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // --- CARRIER DEBTS ---
    // Отменённая заявка (Этап 4 аудита) — не в долги перевозчику, сделка не состоялась.
    const carrierRowsRaw = await getCarrierDebtRows(prisma, new Date(), { dateFrom, dateTo });

    // computeCarrierDueAmd/computeDebtAmd \u2014 \u0442\u0430 \u0436\u0435 \u0444\u043E\u0440\u043C\u0443\u043B\u0430, \u0447\u0442\u043E /api/debts \u0438 /api/dashboard
    // (\u0430\u0443\u0434\u0438\u0442 "\u041E\u0442\u0447\u0451\u0442\u044B": \u0440\u0430\u043D\u044C\u0448\u0435 \u0437\u0434\u0435\u0441\u044C \u0441\u0447\u0438\u0442\u0430\u043B\u0438 \u0433\u043E\u043B\u0443\u044E \u0441\u0442\u0430\u0432\u043A\u0443 \u0431\u0435\u0437 \u043F\u0435\u0440\u0435\u0432\u044B\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u043C\u044B\u0445 \u0440\u0430\u0441\u0445\u043E\u0434\u043E\u0432 \u0438 \u043D\u0435
    // \u043A\u043B\u044D\u043C\u043F\u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u043F\u043B\u0430\u0442\u0443 \u043A \u043D\u0443\u043B\u044E \u2014 \u0440\u0430\u0441\u0445\u043E\u0434\u0438\u043B\u043E\u0441\u044C \u0441 /api/debts \u0438 \u0441 /api/reports/supplier-debts).
    const carrierRows = carrierRowsRaw.map((r) => ({
      id: r.id,
      carrierName: r.entityName,
      carrierId: r.entityId,
      tripNumber: r.tripNumber,
      clientName: '',
      carrierRate: r.rateAmd,
      paidAmount: r.paidAmd,
      debt: r.remaining,
      date: fmtDate(r.tripDate),
      status: r.paidAmd > 0 ? 'partially_paid' : 'not_paid',
    }));

    const totalCarrierDebt = carrierRows.reduce((s, r) => s + r.debt, 0);

    // --- SUPPLIER DEBTS ---
    // \u0415\u0434\u0438\u043D\u044B\u0439 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0438 \u0434\u043B\u044F /api/reports/supplier-debts, \u0438 \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0440\u043E\u0443\u0442\u0430 \u2014 \u043E\u0434\u0438\u043D \u0437\u0430\u043F\u0440\u043E\u0441
    // \u043A PartPurchase \u0432\u043C\u0435\u0441\u0442\u043E \u0434\u0432\u0443\u0445 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u044B\u0445 (\u0430\u0443\u0434\u0438\u0442 "\u0414\u043E\u043B\u0433\u0438").
    const purchases = await getSupplierDebtRows(prisma, {});
    const inRange = (d: Date) => (!dateFrom || d >= new Date(dateFrom)) && (!dateTo || d <= new Date(dateTo));
    const supplierRowsRaw = purchases
      .filter((p) => (p.paymentStatus === 'unpaid' || p.paymentStatus === 'partial') && inRange(new Date(p.date)));

    const supplierRows = supplierRowsRaw.map((p) => ({
      id: p.id,
      supplierName: p.supplier?.name || '\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D',
      supplierId: p.supplier?.id || '',
      vehicle: p.vehicle ? `${p.vehicle.brand} ${p.vehicle.model} (${p.vehicle.plateNumber})` : '',
      partName: p.partName,
      totalAmount: p.totalAmount,
      paidAmount: p.paidAmount,
      debt: p.debtAmount,
      date: fmtDate(p.date),
      status: p.paymentStatus,
    }));

    const totalSupplierDebt = supplierRows.reduce((s, r) => s + r.debt, 0);

    // --- UNIQUE CARRIERS & SUPPLIERS for filters ---
    const carriers = await prisma.carrier.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const suppliers = await prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });

    return NextResponse.json({
      carrierRows,
      totalCarrierDebt,
      supplierRows,
      totalSupplierDebt,
      totalDebt: totalCarrierDebt + totalSupplierDebt,
      carriers,
      suppliers,
    });
  } catch (e: any) {
    console.error('Company debts error:', e);
    return NextResponse.json({ error: '\u041E\u0448\u0438\u0431\u043A\u0430' }, { status: 500 });
  }
}
