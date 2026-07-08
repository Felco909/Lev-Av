export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { computeClientDueAmd, computeCarrierDueAmd, splitExpensesAmd } from '@/lib/finance/formulas';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const clientId = searchParams.get('clientId');
    const tripType = searchParams.get('tripType');

    // Build base filter
    const where: any = {};
    if (dateFrom || dateTo) {
      where.tripDate = {};
      if (dateFrom) where.tripDate.gte = new Date(dateFrom);
      if (dateTo) where.tripDate.lte = new Date(dateTo);
    }
    if (clientId) where.clientId = clientId;
    if (tripType) where.tripType = tripType;

    // \u2500\u2500 1. CLIENT DEBTS \u2500\u2500
    const clientDebtWhere = {
      ...where,
      clientPaymentStatus: { in: ['not_paid', 'partially_paid'] },
    };
    const clientDebtTrips = await prisma.trip.findMany({
      where: clientDebtWhere,
      select: {
        id: true, tripNumber: true, clientRateAmd: true, clientRate: true,
        clientPaidAmountAmd: true, clientPaidAmount: true,
        clientId: true,
        client: { select: { name: true } },
        expenses: { select: { amountAmd: true, description: true } },
      },
      orderBy: { tripDate: 'desc' },
    });

    const clientDebts = clientDebtTrips.map(t => {
      // Сумма к оплате = ставка + перевыставляемые клиентские расходы (см. CLAUDE.md).
      const rate = computeClientDueAmd(Number(t.clientRateAmd ?? t.clientRate ?? 0), t.expenses);
      const paid = Number(t.clientPaidAmountAmd ?? t.clientPaidAmount ?? 0);
      return {
        id: t.id, tripNumber: t.tripNumber,
        clientName: t.client?.name ?? '', clientId: t.clientId,
        rate, paid, remaining: rate - paid,
      };
    }).filter(r => r.remaining > 0);

    const totalClientDebt = clientDebts.reduce((s, r) => s + r.remaining, 0);

    // \u2500\u2500 TOP-5 DEBTORS \u2500\u2500
    const debtorMap: Record<string, { clientId: string; clientName: string; totalDebt: number; tripCount: number }> = {};
    for (const d of clientDebts) {
      if (!debtorMap[d.clientId]) {
        debtorMap[d.clientId] = { clientId: d.clientId, clientName: d.clientName, totalDebt: 0, tripCount: 0 };
      }
      debtorMap[d.clientId].totalDebt += d.remaining;
      debtorMap[d.clientId].tripCount += 1;
    }
    const topDebtors = Object.values(debtorMap)
      .sort((a, b) => b.totalDebt - a.totalDebt)
      .slice(0, 5);

    // \u2500\u2500 2. CARRIER DEBTS \u2500\u2500
    const carrierDebtWhere: any = {
      ...where,
      tripType: where.tripType ?? 'expedition',
      carrierPaymentStatus: { in: ['not_paid', 'partially_paid'] },
    };
    if (tripType === 'own_transport') {
      carrierDebtWhere.tripType = 'own_transport';
    }
    const carrierDebtTrips = await prisma.trip.findMany({
      where: carrierDebtWhere,
      select: {
        id: true, tripNumber: true, carrierRateAmd: true, carrierRate: true,
        carrierPaidAmountAmd: true, carrierPaidAmount: true,
        carrier: { select: { name: true } },
        expenses: { select: { amountAmd: true, description: true } },
      },
      orderBy: { tripDate: 'desc' },
    });

    const carrierDebts = carrierDebtTrips.map(t => {
      const rate = computeCarrierDueAmd(Number(t.carrierRateAmd ?? t.carrierRate ?? 0), t.expenses);
      const paid = Number(t.carrierPaidAmountAmd ?? t.carrierPaidAmount ?? 0);
      return {
        id: t.id, tripNumber: t.tripNumber, carrierName: t.carrier?.name ?? '',
        rate, paid, remaining: rate - paid,
      };
    }).filter(r => r.remaining > 0);

    const totalCarrierDebt = carrierDebts.reduce((s, r) => s + r.remaining, 0);

    // \u2500\u2500 3. PROFIT \u2500\u2500
    const allTrips = await prisma.trip.findMany({
      where,
      select: {
        id: true, tripNumber: true, tripType: true,
        clientRateAmd: true, clientRate: true,
        carrierRateAmd: true, carrierRate: true,
        profitAmd: true, profit: true,
        client: { select: { name: true } },
        expenses: { select: { amountAmd: true, description: true } },
      },
      orderBy: { profitAmd: 'desc' },
    });

    const profitRows = allTrips.map(t => {
      // Клиентские расходы — доход (перевыставляются), перевозчицкие — расход.
      // Для own_transport вообще нет расходной части (см. computeTripProfitAmd/CLAUDE.md).
      const { clientExpensesAmd, carrierExpensesAmd } = splitExpensesAmd(t.expenses);
      const income = Number(t.clientRateAmd ?? t.clientRate ?? 0) + clientExpensesAmd;
      const carrierCost = Number(t.carrierRateAmd ?? t.carrierRate ?? 0);
      const expense = t.tripType === 'expedition' ? carrierCost + carrierExpensesAmd : 0;
      const profitVal = Number(t.profitAmd ?? t.profit ?? 0);
      return {
        id: t.id, tripNumber: t.tripNumber, clientName: t.client?.name ?? '',
        income, expense, profit: profitVal,
      };
    });

    const totalProfit = profitRows.reduce((s, r) => s + r.profit, 0);
    const totalIncome = profitRows.reduce((s, r) => s + r.income, 0);
    const totalExpense = profitRows.reduce((s, r) => s + r.expense, 0);

    // \u2500\u2500 4. PROBLEM TRIPS (cash gap) \u2500\u2500
    const problemTrips = await prisma.trip.findMany({
      where: {
        ...where,
        tripType: where.tripType ?? 'expedition',
      },
      select: {
        id: true, tripNumber: true,
        clientPaidAmountAmd: true, clientPaidAmount: true,
        carrierPaidAmountAmd: true, carrierPaidAmount: true,
        client: { select: { name: true } },
        carrier: { select: { name: true } },
      },
      orderBy: { tripDate: 'desc' },
    });

    const problemRows = problemTrips
      .map(t => {
        const clientPaid = Number(t.clientPaidAmountAmd ?? t.clientPaidAmount ?? 0);
        const carrierPaid = Number(t.carrierPaidAmountAmd ?? t.carrierPaidAmount ?? 0);
        const diff = carrierPaid - clientPaid;
        return {
          id: t.id, tripNumber: t.tripNumber,
          clientName: t.client?.name ?? '', carrierName: t.carrier?.name ?? '',
          clientPaid, carrierPaid, diff,
        };
      })
      .filter(r => r.diff > 0)
      .sort((a, b) => b.diff - a.diff);

    const totalCashGap = problemRows.reduce((s, r) => s + r.diff, 0);

    // \u2500\u2500 5. PERIOD COMPARISON \u2500\u2500
    // Calculate previous period of same length for comparison
    let prevKpi: { totalClientDebt: number; totalCarrierDebt: number; totalProfit: number; totalCashGap: number } | null = null;
    if (dateFrom && dateTo) {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      const durationMs = to.getTime() - from.getTime();
      const prevTo = new Date(from.getTime() - 1); // day before current period
      const prevFrom = new Date(prevTo.getTime() - durationMs);

      const prevWhere: any = {
        tripDate: { gte: prevFrom, lte: prevTo },
      };
      if (clientId) prevWhere.clientId = clientId;
      if (tripType) prevWhere.tripType = tripType;

      // Previous client debts
      const prevClientDebtTrips = await prisma.trip.findMany({
        where: { ...prevWhere, clientPaymentStatus: { in: ['not_paid', 'partially_paid'] } },
        select: { clientRateAmd: true, clientRate: true, clientPaidAmountAmd: true, clientPaidAmount: true, expenses: { select: { amountAmd: true, description: true } } },
      });
      const prevTotalClientDebt = prevClientDebtTrips.reduce((s, t) => {
        const r = computeClientDueAmd(Number(t.clientRateAmd ?? t.clientRate ?? 0), t.expenses) - Number(t.clientPaidAmountAmd ?? t.clientPaidAmount ?? 0);
        return s + (r > 0 ? r : 0);
      }, 0);

      // Previous carrier debts
      const prevCarrierWhere: any = { ...prevWhere, tripType: prevWhere.tripType ?? 'expedition', carrierPaymentStatus: { in: ['not_paid', 'partially_paid'] } };
      if (tripType === 'own_transport') prevCarrierWhere.tripType = 'own_transport';
      const prevCarrierDebtTrips = await prisma.trip.findMany({
        where: prevCarrierWhere,
        select: { carrierRateAmd: true, carrierRate: true, carrierPaidAmountAmd: true, carrierPaidAmount: true, expenses: { select: { amountAmd: true, description: true } } },
      });
      const prevTotalCarrierDebt = prevCarrierDebtTrips.reduce((s, t) => {
        const r = computeCarrierDueAmd(Number(t.carrierRateAmd ?? t.carrierRate ?? 0), t.expenses) - Number(t.carrierPaidAmountAmd ?? t.carrierPaidAmount ?? 0);
        return s + (r > 0 ? r : 0);
      }, 0);

      // Previous profit
      const prevProfitAgg = await prisma.trip.aggregate({
        where: prevWhere,
        _sum: { profitAmd: true },
      });
      const prevTotalProfit = Number(prevProfitAgg._sum?.profitAmd ?? 0);

      // Previous cash gap
      const prevProblemTrips = await prisma.trip.findMany({
        where: { ...prevWhere, tripType: prevWhere.tripType ?? 'expedition' },
        select: { clientPaidAmountAmd: true, clientPaidAmount: true, carrierPaidAmountAmd: true, carrierPaidAmount: true },
      });
      const prevTotalCashGap = prevProblemTrips.reduce((s, t) => {
        const cp = Number(t.clientPaidAmountAmd ?? t.clientPaidAmount ?? 0);
        const crp = Number(t.carrierPaidAmountAmd ?? t.carrierPaidAmount ?? 0);
        const d = crp - cp;
        return s + (d > 0 ? d : 0);
      }, 0);

      prevKpi = { totalClientDebt: prevTotalClientDebt, totalCarrierDebt: prevTotalCarrierDebt, totalProfit: prevTotalProfit, totalCashGap: prevTotalCashGap };
    }

    // \u2500\u2500 6. REMINDERS \u2500\u2500
    // Overdue/due applies ONLY to completed trips that have a payment date set AND remaining debt > 0.
    // Never flag a trip as overdue if it is still in-progress/new/unloaded, or if the due date is not set.
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const [clientPaymentTrips, carrierPaymentTrips] = await Promise.all([
      prisma.trip.findMany({
        where: {
          status: 'completed',
          paymentDueDate: { not: null },
          clientPaymentStatus: { in: ['not_paid', 'partially_paid'] },
        },
        select: {
          id: true, tripNumber: true, paymentDueDate: true,
          clientRateAmd: true, clientRate: true,
          clientPaidAmountAmd: true, clientPaidAmount: true,
          client: { select: { name: true } },
          expenses: { select: { amountAmd: true, description: true } },
        },
        orderBy: { paymentDueDate: 'asc' },
      }),
      prisma.trip.findMany({
        where: {
          status: 'completed',
          carrierPaymentDate: { not: null },
          carrierPaymentStatus: { in: ['not_paid', 'partially_paid'] },
        },
        select: {
          id: true, tripNumber: true, carrierPaymentDate: true,
          carrierRateAmd: true, carrierRate: true,
          carrierPaidAmountAmd: true, carrierPaidAmount: true,
          carrier: { select: { name: true } },
          expenses: { select: { amountAmd: true, description: true } },
        },
        orderBy: { carrierPaymentDate: 'asc' },
      }),
    ]);

    const clientOverdueArr: any[] = [];
    const clientDueArr: any[] = [];
    for (const t of clientPaymentTrips) {
      const rate = computeClientDueAmd(Number(t.clientRateAmd ?? t.clientRate ?? 0), t.expenses);
      const paid = Number(t.clientPaidAmountAmd ?? t.clientPaidAmount ?? 0);
      const remaining = rate - paid;
      if (remaining <= 0) continue;
      const due = new Date(t.paymentDueDate!); due.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((due.getTime() - todayStart.getTime()) / 86400000);
      const row = {
        id: t.id, tripNumber: t.tripNumber, clientName: t.client?.name ?? '',
        amount: remaining,
        paymentDueDate: due.toISOString().split('T')[0],
        daysLeft,
      };
      if (daysLeft < 0) clientOverdueArr.push(row); else clientDueArr.push(row);
    }

    const carrierOverdueArr: any[] = [];
    const carrierDueArr: any[] = [];
    for (const t of carrierPaymentTrips) {
      const rate = computeCarrierDueAmd(Number(t.carrierRateAmd ?? t.carrierRate ?? 0), t.expenses);
      const paid = Number(t.carrierPaidAmountAmd ?? t.carrierPaidAmount ?? 0);
      const remaining = rate - paid;
      if (remaining <= 0) continue;
      const due = new Date(t.carrierPaymentDate!); due.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((due.getTime() - todayStart.getTime()) / 86400000);
      const row = {
        id: t.id, tripNumber: t.tripNumber, carrierName: t.carrier?.name ?? '',
        amount: remaining,
        paymentDueDate: due.toISOString().split('T')[0],
        daysLeft,
      };
      if (daysLeft < 0) carrierOverdueArr.push(row); else carrierDueArr.push(row);
    }

    const reminders = {
      overduePayments: clientOverdueArr.slice(0, 10),
      paymentDueTrips: clientDueArr.slice(0, 15),
      carrierOverduePayments: carrierOverdueArr.slice(0, 10),
      carrierPaymentDueTrips: carrierDueArr.slice(0, 15),
    };

    // \u2500\u2500 7. EXPIRING DOCUMENTS \u2500\u2500
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringDocs = await prisma.documentExpiry.findMany({
      where: { expiryDate: { lte: thirtyDaysFromNow } },
      orderBy: { expiryDate: 'asc' },
      take: 10,
    });

    // Enrich with entity names
    const vehicleIds = [...new Set(expiringDocs.filter(i => i.entityType === 'vehicle').map(i => i.entityId))];
    const driverIds = [...new Set(expiringDocs.filter(i => i.entityType === 'driver').map(i => i.entityId))];
    const carrierIds = [...new Set(expiringDocs.filter(i => i.entityType === 'carrier').map(i => i.entityId))];
    const [vehicles, drivers, carriers] = await Promise.all([
      vehicleIds.length ? prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, plateNumber: true, brand: true, model: true } }) : [],
      driverIds.length ? prisma.driver.findMany({ where: { id: { in: driverIds } }, select: { id: true, fullName: true } }) : [],
      carrierIds.length ? prisma.carrier.findMany({ where: { id: { in: carrierIds } }, select: { id: true, name: true } }) : [],
    ]);
    const nameMap: Record<string, string> = {};
    vehicles.forEach(v => { nameMap[v.id] = `${v.brand} ${v.model} (${v.plateNumber})`; });
    drivers.forEach(d => { nameMap[d.id] = d.fullName; });
    carriers.forEach(c => { nameMap[c.id] = c.name; });

    const expiringDocsEnriched = expiringDocs.map(i => {
      const days = Math.floor((new Date(i.expiryDate).getTime() - new Date().getTime()) / 86400000);
      return {
        id: i.id, docName: i.docName, entityName: nameMap[i.entityId] || '\u041d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u043e',
        expiryDate: i.expiryDate, daysLeft: days,
      };
    });

    // \u2500\u2500 8. OWN FLEET SUMMARY \u2500\u2500
    const ownFleetTrips = allTrips.filter(t => t.tripType === 'own_transport');
    const ownFleetRevenue = ownFleetTrips.reduce((s, t) => s + Number(t.clientRateAmd ?? t.clientRate ?? 0), 0);

    const vtWhere: any = {};
    if (dateFrom || dateTo) {
      vtWhere.departureDate = {};
      if (dateFrom) vtWhere.departureDate.gte = new Date(dateFrom);
      if (dateTo) vtWhere.departureDate.lte = new Date(dateTo + 'T23:59:59');
    }
    const vehicleTripExpenses = await prisma.vehicleTrip.findMany({
      where: vtWhere,
      select: { salaryAmd: true, perDiemAmd: true, otherExpensesAmd: true, fuelCostAmd: true },
    });
    const ownFleetSalary = vehicleTripExpenses.reduce((s, v) => s + (Number(v.salaryAmd) || 0), 0);
    const ownFleetPerDiem = vehicleTripExpenses.reduce((s, v) => s + (Number(v.perDiemAmd) || 0), 0);
    const ownFleetOther = vehicleTripExpenses.reduce((s, v) => s + (Number(v.otherExpensesAmd) || 0), 0);
    const ownFleetFuel = vehicleTripExpenses.reduce((s, v) => s + (Number(v.fuelCostAmd) || 0), 0);
    const ownFleetExpenses = ownFleetSalary + ownFleetPerDiem + ownFleetOther + ownFleetFuel;
    const ownFleetProfit = ownFleetRevenue - ownFleetExpenses;

    const ownFleet = {
      revenue: ownFleetRevenue,
      expenses: ownFleetExpenses,
      profit: ownFleetProfit,
      breakdown: { salary: ownFleetSalary, perDiem: ownFleetPerDiem, fuel: ownFleetFuel, other: ownFleetOther },
      tripCount: ownFleetTrips.length,
      vtCount: vehicleTripExpenses.length,
    };

    // \u2500\u2500 9. CLIENTS LIST for filter \u2500\u2500
    const clients = await prisma.client.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      kpi: { totalClientDebt, totalCarrierDebt, totalProfit, totalCashGap },
      prevKpi,
      totals: { totalIncome, totalExpense },
      topDebtors,
      clientDebts,
      carrierDebts,
      profitRows,
      problemRows,
      reminders,
      expiringDocs: expiringDocsEnriched,
      clients,
      ownFleet,
    });
  } catch (e: any) {
    console.error('Dashboard API error:', e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430' }, { status: 500 });
  }
}