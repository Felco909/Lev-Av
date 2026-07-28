export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { computeCarrierDueAmd, computeDebtAmd } from '@/lib/finance/formulas';

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
    const carrierWhere: any = {
      tripType: 'expedition',
      carrierPaymentStatus: { in: ['not_paid', 'partially_paid'] },
      NOT: { status: 'cancelled' },
    };
    if (dateFrom || dateTo) {
      carrierWhere.tripDate = {};
      if (dateFrom) carrierWhere.tripDate.gte = new Date(dateFrom);
      if (dateTo) carrierWhere.tripDate.lte = new Date(dateTo);
    }
    const carrierTrips = await prisma.trip.findMany({
      where: carrierWhere,
      include: {
        carrier: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        expenses: { select: { amountAmd: true, description: true } },
      },
      orderBy: { tripDate: 'desc' },
    });

    // computeCarrierDueAmd/computeDebtAmd \u2014 \u0442\u0430 \u0436\u0435 \u0444\u043E\u0440\u043C\u0443\u043B\u0430, \u0447\u0442\u043E /api/debts \u0438 /api/dashboard
    // (\u0430\u0443\u0434\u0438\u0442 "\u041E\u0442\u0447\u0451\u0442\u044B": \u0440\u0430\u043D\u044C\u0448\u0435 \u0437\u0434\u0435\u0441\u044C \u0441\u0447\u0438\u0442\u0430\u043B\u0438 \u0433\u043E\u043B\u0443\u044E \u0441\u0442\u0430\u0432\u043A\u0443 \u0431\u0435\u0437 \u043F\u0435\u0440\u0435\u0432\u044B\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u043C\u044B\u0445 \u0440\u0430\u0441\u0445\u043E\u0434\u043E\u0432 \u0438 \u043D\u0435
    // \u043A\u043B\u044D\u043C\u043F\u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u043F\u043B\u0430\u0442\u0443 \u043A \u043D\u0443\u043B\u044E \u2014 \u0440\u0430\u0441\u0445\u043E\u0434\u0438\u043B\u043E\u0441\u044C \u0441 /api/debts \u0438 \u0441 /api/reports/supplier-debts).
    const carrierRows = carrierTrips.map((t) => {
      const carrierRate = computeCarrierDueAmd(Number(t.carrierRateAmd ?? t.carrierRate ?? 0), t.expenses ?? []);
      const paidAmount = Number(t.carrierPaidAmountAmd ?? t.carrierPaidAmount ?? 0);
      return {
        id: t.id,
        carrierName: t.carrier?.name || '\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D',
        carrierId: t.carrierId || '',
        tripNumber: t.tripNumber,
        clientName: t.client?.name || '',
        carrierRate,
        paidAmount,
        debt: computeDebtAmd(carrierRate, paidAmount),
        date: fmtDate(t.tripDate),
        status: t.carrierPaymentStatus || 'not_paid',
      };
    });

    const totalCarrierDebt = carrierRows.reduce((s, r) => s + r.debt, 0);

    // --- SUPPLIER DEBTS ---
    const supplierWhere: any = {
      paymentStatus: { in: ['unpaid', 'partial'] },
    };
    if (dateFrom || dateTo) {
      supplierWhere.date = {};
      if (dateFrom) supplierWhere.date.gte = new Date(dateFrom);
      if (dateTo) supplierWhere.date.lte = new Date(dateTo);
    }
    const purchases = await prisma.partPurchase.findMany({
      where: supplierWhere,
      include: {
        supplier: { select: { id: true, name: true } },
        vehicle: { select: { id: true, brand: true, model: true, plateNumber: true } },
      },
      orderBy: { date: 'desc' },
    });

    const supplierRows = purchases.map((p) => {
      const totalAmount = Number(p.totalAmount ?? 0);
      const paidAmount = Number(p.paidAmount ?? 0);
      return {
        id: p.id,
        supplierName: p.supplier?.name || '\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D',
        supplierId: p.supplierId || '',
        vehicle: p.vehicle ? `${p.vehicle.brand} ${p.vehicle.model} (${p.vehicle.plateNumber})` : '',
        partName: p.partName,
        totalAmount,
        paidAmount,
        debt: computeDebtAmd(totalAmount, paidAmount),
        date: fmtDate(p.date),
        status: p.paymentStatus,
      };
    });

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
