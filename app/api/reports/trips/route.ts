export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const tripType = searchParams.get('tripType');
    const clientId = searchParams.get('clientId');
    const routeFilter = searchParams.get('route');
    const format = searchParams.get('format') || 'json';

    const where: any = {};
    if (dateFrom || dateTo) {
      where.tripDate = {};
      if (dateFrom) where.tripDate.gte = new Date(dateFrom);
      if (dateTo) where.tripDate.lte = new Date(dateTo);
    }
    if (tripType && tripType !== 'all') where.tripType = tripType;
    if (clientId && clientId !== 'all') where.clientId = clientId;
    if (routeFilter && routeFilter !== 'all') {
      const [rf, rt] = routeFilter.split('→').map(s => s.trim());
      if (rf) where.routeFrom = { contains: rf, mode: 'insensitive' };
      if (rt) where.routeTo = { contains: rt, mode: 'insensitive' };
    }

    const trips = await prisma.trip.findMany({
      where,
      include: { client: true, vehicle: true, driver: true, carrier: true, expenses: true },
      orderBy: { tripDate: 'desc' },
    });

    const rows = trips.map((t) => {
      const totalExpenses = t.expenses.reduce((s, e) => s + Number(e.amountAmd || e.amount), 0);
      // Per-category expense breakdown (amountAmd)
      const expByType: Record<string, number> = {};
      for (const e of t.expenses) {
        const et = e.expenseType || 'other';
        expByType[et] = (expByType[et] || 0) + Number(e.amountAmd || e.amount);
      }
      return {
        id: t.id,
        tripNumber: t.tripNumber,
        date: t.tripDate.toISOString().split('T')[0],
        client: t.client?.name || '',
        clientId: t.clientId,
        routeFrom: t.routeFrom,
        routeTo: t.routeTo,
        tripType: t.tripType === 'own_transport' ? 'Собственный' : 'Экспедиция',
        tripTypeRaw: t.tripType,
        status: t.status,
        clientRate: Number(t.clientRate),
        carrierRate: t.carrierRate ? Number(t.carrierRate) : 0,
        expenses: totalExpenses,
        expensesByType: expByType,
        profit: Number(t.profit),
        currency: t.currency || 'AMD',
        carrierCurrency: (t as any).carrierCurrency || t.currency || 'AMD',
        exchangeRate: Number(t.exchangeRate ?? 1),
        carrierExchangeRate: Number((t as any).carrierExchangeRate ?? t.exchangeRate ?? 1),
        clientRateAmd: Number(t.clientRateAmd ?? 0),
        carrierRateAmd: t.carrierRateAmd != null ? Number(t.carrierRateAmd) : 0,
        profitAmd: Number(t.profitAmd ?? 0),
        exchangeDiff: Number(t.exchangeDiff ?? 0),
        vehicle: t.vehicle ? `${t.vehicle.brand} ${t.vehicle.model} (${t.vehicle.plateNumber})` : '',
        vehicleId: t.vehicleId,
        driver: t.driver?.fullName || '',
        carrier: t.carrier?.name || '',
        distance: t.distance,
        cargoWeight: t.cargoWeight ? Number(t.cargoWeight) : null,
        // Client payment tracking
        clientPaymentStatus: (t as any).clientPaymentStatus || 'not_paid',
        clientPaidAmount: Number((t as any).clientPaidAmount ?? 0),
        clientPaidAmountAmd: Number((t as any).clientPaidAmountAmd ?? 0),
        // Carrier payment tracking
        carrierPaymentStatus: (t as any).carrierPaymentStatus || 'not_paid',
        carrierPaidAmount: Number((t as any).carrierPaidAmount ?? 0),
        carrierPaidAmountAmd: Number((t as any).carrierPaidAmountAmd ?? 0),
        carrierPaymentDate: (t as any).carrierPaymentDate ? ((t as any).carrierPaymentDate as Date).toISOString().split('T')[0] : null,
        // Invoice series
        clientInvoiceSeries: (t as any).clientInvoiceSeries || '',
        carrierInvoiceSeries: (t as any).carrierInvoiceSeries || '',
      };
    });

    // --- Totals ---
    const ownRows = rows.filter(r => r.tripTypeRaw === 'own_transport');
    const expRows = rows.filter(r => r.tripTypeRaw === 'expedition');
    const totalRevenue = rows.reduce((s, r) => s + r.clientRate, 0);
    const totalCosts = rows.reduce((s, r) => s + r.expenses + r.carrierRate, 0);
    const totalProfit = rows.reduce((s, r) => s + r.profit, 0);

    // AMD totals
    const totalRevenueAmd = rows.reduce((s, r) => s + (r.clientRateAmd || r.clientRate), 0);
    const totalCostsAmd = rows.reduce((s, r) => s + (r.carrierRateAmd || r.carrierRate) + r.expenses, 0);
    const totalProfitAmd = rows.reduce((s, r) => s + (r.profitAmd || r.profit), 0);
    const totalExchangeDiff = rows.reduce((s, r) => s + (r.exchangeDiff || 0), 0);

    // Currency breakdown
    const currencyBreakdown: Record<string, { trips: number; revenue: number; revenueAmd: number; profit: number; profitAmd: number }> = {};
    rows.forEach(r => {
      const cur = r.currency || 'AMD';
      if (!currencyBreakdown[cur]) currencyBreakdown[cur] = { trips: 0, revenue: 0, revenueAmd: 0, profit: 0, profitAmd: 0 };
      currencyBreakdown[cur].trips++;
      currencyBreakdown[cur].revenue += r.clientRate;
      currencyBreakdown[cur].revenueAmd += r.clientRateAmd || r.clientRate;
      currencyBreakdown[cur].profit += r.profit;
      currencyBreakdown[cur].profitAmd += r.profitAmd || r.profit;
    });

    const totals = {
      totalTrips: rows.length,
      totalRevenue,
      totalExpenses: totalCosts,
      totalProfit,
      totalRevenueAmd,
      totalExpensesAmd: totalCostsAmd,
      totalProfitAmd,
      totalExchangeDiff,
      currencyBreakdown,
      ownTrips: ownRows.length,
      ownRevenue: ownRows.reduce((s, r) => s + r.clientRate, 0),
      ownRevenueAmd: ownRows.reduce((s, r) => s + (r.clientRateAmd || r.clientRate), 0),
      ownExpenses: ownRows.reduce((s, r) => s + r.expenses, 0),
      ownExpensesAmd: ownRows.reduce((s, r) => s + r.expenses * (r.currency === 'AMD' ? 1 : r.exchangeRate), 0),
      ownProfit: ownRows.reduce((s, r) => s + r.profit, 0),
      ownProfitAmd: ownRows.reduce((s, r) => s + (r.profitAmd || r.profit), 0),
      // Per-category expense totals for own_transport
      ownExpenseBreakdown: (() => {
        const bd: Record<string, number> = {};
        for (const r of ownRows) {
          for (const [et, amt] of Object.entries(r.expensesByType || {})) {
            bd[et] = (bd[et] || 0) + (amt as number);
          }
        }
        return bd;
      })(),
      expTrips: expRows.length,
      expRevenue: expRows.reduce((s, r) => s + r.clientRate, 0),
      expRevenueAmd: expRows.reduce((s, r) => s + (r.clientRateAmd || r.clientRate), 0),
      expCosts: expRows.reduce((s, r) => s + r.carrierRate, 0),
      expCostsAmd: expRows.reduce((s, r) => s + (r.carrierRateAmd || r.carrierRate), 0),
      expProfit: expRows.reduce((s, r) => s + r.profit, 0),
      expProfitAmd: expRows.reduce((s, r) => s + (r.profitAmd || r.profit), 0),
    };

    // --- Status breakdown ---
    const statusCounts: Record<string, number> = {};
    rows.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });

    // --- Monthly profit data for chart ---
    const monthlyMap: Record<string, { own: number; exp: number; revenue: number; costs: number }> = {};
    rows.forEach(r => {
      const key = r.date.substring(0, 7);
      if (!monthlyMap[key]) monthlyMap[key] = { own: 0, exp: 0, revenue: 0, costs: 0 };
      monthlyMap[key].revenue += r.clientRateAmd || r.clientRate;
      monthlyMap[key].costs += (r.carrierRateAmd || r.carrierRate) + r.expenses;
      if (r.tripTypeRaw === 'own_transport') monthlyMap[key].own += r.profitAmd || r.profit;
      else monthlyMap[key].exp += r.profitAmd || r.profit;
    });
    const monthlyData = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({ month, ...d }));

    // --- Vehicle utilization ---
    const vehicleMap: Record<string, { name: string; trips: number; profit: number; revenue: number }> = {};
    rows.forEach(r => {
      if (!r.vehicleId || !r.vehicle) return;
      if (!vehicleMap[r.vehicleId]) vehicleMap[r.vehicleId] = { name: r.vehicle, trips: 0, profit: 0, revenue: 0 };
      vehicleMap[r.vehicleId].trips++;
      vehicleMap[r.vehicleId].profit += r.profitAmd || r.profit;
      vehicleMap[r.vehicleId].revenue += r.clientRateAmd || r.clientRate;
    });
    const vehicleStats = Object.values(vehicleMap).sort((a, b) => b.trips - a.trips);
    const totalActiveVehicles = await prisma.vehicle.count({ where: { status: 'active' } });
    const idleVehicles = totalActiveVehicles - Object.keys(vehicleMap).length;

    // --- Top clients ---
    const clientMap: Record<string, { name: string; trips: number; profit: number; revenue: number }> = {};
    rows.forEach(r => {
      if (!r.clientId || !r.client) return;
      if (!clientMap[r.clientId]) clientMap[r.clientId] = { name: r.client, trips: 0, profit: 0, revenue: 0 };
      clientMap[r.clientId].trips++;
      clientMap[r.clientId].profit += r.profitAmd || r.profit;
      clientMap[r.clientId].revenue += r.clientRateAmd || r.clientRate;
    });
    const topClients = Object.values(clientMap).sort((a, b) => b.profit - a.profit);

    // --- Payment stats ---
    // "completed" = deal closed & paid; "paid" = payment received but not yet closed
    const paidTrips = rows.filter(r => r.status === 'paid' || r.status === 'completed' || r.status === 'archived');
    const paidTotal = paidTrips.reduce((s, r) => s + (r.clientRateAmd || r.clientRate), 0);
    // "Сверка" = сверка в процессе — отдельная группа
    const sverkaTrips = rows.filter(r => r.status === 'sverka');
    const sverkaTotal = sverkaTrips.reduce((s, r) => s + (r.clientRateAmd || r.clientRate), 0);

    // --- Problems ---
    const lossTrips = rows.filter(r => (r.profitAmd || r.profit) < 0).sort((a, b) => (a.profitAmd || a.profit) - (b.profitAmd || b.profit));
    // Unpaid = unloaded or in_progress trips (delivered/in transit but not yet paid/completed)
    const unpaidTrips = rows.filter(r => r.status === 'unloaded' || r.status === 'in_progress' || r.status === 'new');
    const unpaidTotal = unpaidTrips.reduce((s, r) => s + (r.clientRateAmd || r.clientRate), 0);

    // --- Unique routes for filter ---
    const routeSet = new Set<string>();
    rows.forEach(r => routeSet.add(`${r.routeFrom}→${r.routeTo}`));
    const uniqueRoutes = Array.from(routeSet).sort();

    // --- All clients for filter ---
    const allClients = await prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });

    if (format === 'csv') {
      const BOM = '\uFEFF';
      const header = '№ заявки;Дата;Клиент;Откуда;Куда;Тип;Статус;Валюта;Курс;Ставка клиента;Ставка AMD;Ставка перевозчика;Расходы;Прибыль;Прибыль AMD;Курс. разница;Машина;Водитель;Перевозчик';
      const csvRows = rows.map(r =>
        `${r.tripNumber};${r.date};${r.client};${r.routeFrom};${r.routeTo};${r.tripType};${r.status};${r.currency || 'AMD'};${r.exchangeRate || 1};${r.clientRate};${r.clientRateAmd || r.clientRate};${r.carrierRate};${r.expenses};${r.profit};${r.profitAmd || r.profit};${r.exchangeDiff || 0};${r.vehicle};${r.driver};${r.carrier}`
      );
      csvRows.push('');
      csvRows.push(`Итого;;;;;;;;;${totals.totalRevenue};${totals.totalRevenueAmd};;${totals.totalExpenses};${totals.totalProfit};${totals.totalProfitAmd};${totals.totalExchangeDiff};;;`);
      const csv = BOM + header + '\n' + csvRows.join('\n');
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="report_trips.csv"`,
        },
      });
    }

    return NextResponse.json({
      rows,
      totals,
      statusCounts,
      monthlyData,
      vehicleStats,
      totalActiveVehicles,
      idleVehicles,
      sverkaTotal,
      sverkaCount: sverkaTrips.length,
      topClients,
      payment: {
        paidCount: paidTrips.length,
        paidTotal,
        unpaidCount: unpaidTrips.length,
        unpaidTotal,
      },
      problems: {
        lossTrips: lossTrips.slice(0, 10),
        unpaidCount: unpaidTrips.length,
        unpaidTotal,
        idleVehicles,
      },
      uniqueRoutes,
      allClients,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
