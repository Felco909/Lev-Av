export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { computeClientDueAmd, computeCarrierDueAmd, computeCashGapAmd, splitExpensesAmd } from '@/lib/finance/formulas';
import { computeVehicleTripExpensesAmd } from '@/lib/vehicle-trips/close-trip';
import { getVehicleTripsIncomeAmdBulk } from '@/lib/finance/own-fleet-income';
import { getClientDebtRows, getCarrierDebtRows, sumDebt, getPaymentReminders } from '@/lib/finance/debts-service';
import { getOperationalSummary, getIdleVehicles, getStuckVehicleTrips } from '@/lib/dashboard/operational-summary';
import { dedupeCashGapTotal } from '@/lib/finance/cash-gap-dedup';

/**
 * Доход/расход/прибыль собственного транспорта за период VehicleTrip.departureDate — единая
 * методология (getVehicleTripsIncomeAmdBulk + computeVehicleTripExpensesAmd, та же, что и
 * /api/vehicle-analytics, /api/vehicles/[id]/economics). Вынесено в
 * функцию, т.к. нужно дважды — для текущего периода (детальный breakdown) и для предыдущего
 * (только для сравнения тренда прибыли, см. аудит п.6). Ни одна формула здесь не меняется —
 * это тот же расчёт, что уже был в разделе "Свой транспорт" ниже, просто переиспользуемый.
 */
async function computeOwnFleetTotals(vtWhere: any) {
  const vehicleTrips = await prisma.vehicleTrip.findMany({
    where: vtWhere,
    select: {
      id: true,
      salaryAmd: true, perDiemAmd: true, perDiem2Amd: true, perDiem3Amd: true, perDiem4Amd: true,
      otherExpensesAmd: true, fuelCostAmd: true,
      fleetExpenses: { select: { amountAmd: true } },
    },
  });
  const incomeByVt = await getVehicleTripsIncomeAmdBulk(vehicleTrips.map((vt) => vt.id));
  const revenue = vehicleTrips.reduce((sum, vt) => sum + (incomeByVt.get(vt.id) ?? 0), 0);
  const expenses = vehicleTrips.reduce((sum, vt) => sum + computeVehicleTripExpensesAmd(vt), 0);
  return { vehicleTrips, revenue, expenses, profit: revenue - expenses };
}

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
    const where: any = {
      // Отменённая заявка (Этап 4 аудита) — не в доход/прибыль/долги/аналитику, сделка не
      // состоялась. Применяется здесь один раз — clientDebtWhere/carrierDebtWhere/allTrips/
      // problemTrips ниже все спредят этот же объект (...where).
      NOT: { status: 'cancelled' },
    };
    if (dateFrom || dateTo) {
      where.tripDate = {};
      if (dateFrom) where.tripDate.gte = new Date(dateFrom);
      if (dateTo) where.tripDate.lte = new Date(dateTo);
    }
    if (clientId) where.clientId = clientId;
    if (tripType) where.tripType = tripType;

    // \u2500\u2500 1-4. \u041d\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043c\u044b\u0435 \u0437\u0430\u043f\u0440\u043e\u0441\u044b \u043f\u043e \u0437\u0430\u044f\u0432\u043a\u0430\u043c (\u0434\u043e\u043b\u0433\u0438 \u043a\u043b\u0438\u0435\u043d\u0442\u0430/\u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0430, \u043f\u0440\u0438\u0431\u044b\u043b\u044c,
    // \u043f\u0440\u043e\u0431\u043b\u0435\u043c\u043d\u044b\u0435/\u043a\u0430\u0441\u0441\u043e\u0432\u044b\u0439 \u0440\u0430\u0437\u0440\u044b\u0432) \u2014 \u043e\u0434\u0438\u043d Promise.all \u0432\u043c\u0435\u0441\u0442\u043e 4 \u043f\u043e\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0445 await
    // \u043f\u043e\u0434\u0440\u044f\u0434 (\u0430\u0443\u0434\u0438\u0442 "\u0414\u0430\u0448\u0431\u043e\u0440\u0434": \u044d\u0442\u043e \u0441\u0430\u043c\u0430\u044f \u043d\u0430\u0433\u0440\u0443\u0436\u0435\u043d\u043d\u0430\u044f \u043f\u043e \u0447\u0438\u0441\u043b\u0443 \u043f\u043e\u0445\u043e\u0434\u043e\u0432 \u0432 \u0411\u0414 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0430
    // \u0441\u0438\u0441\u0442\u0435\u043c\u044b, \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u0442\u0441\u044f \u043f\u0440\u0438 \u043a\u0430\u0436\u0434\u043e\u043c \u0432\u0445\u043e\u0434\u0435).
    const debtFilters = { dateFrom, dateTo, clientId, tripType };

    const [clientRows, carrierRows, allTrips, problemTrips] = await Promise.all([
      getClientDebtRows(prisma, new Date(), debtFilters),
      getCarrierDebtRows(prisma, new Date(), debtFilters),
      prisma.trip.findMany({
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
      }),
      prisma.trip.findMany({
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
      }),
    ]);

    // \u2500\u2500 1. CLIENT DEBTS \u2500\u2500
    const clientDebts = clientRows.map(r => ({
      id: r.id, tripNumber: r.tripNumber,
      clientName: r.entityName, clientId: r.entityId,
      rate: r.rateAmd, paid: r.paidAmd, remaining: r.remaining,
    }));

    const totalClientDebt = sumDebt(clientRows);

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
    const carrierDebts = carrierRows.map(r => ({
      id: r.id, tripNumber: r.tripNumber, carrierName: r.entityName,
      rate: r.rateAmd, paid: r.paidAmd, remaining: r.remaining,
    }));

    const totalCarrierDebt = sumDebt(carrierRows);

    // \u2500\u2500 3. PROFIT \u2500\u2500
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

    // totalProfit/totalIncome/totalExpense (верхние KPI) считаются ниже, после блока
    // "Свой транспорт" — см. аудит п.6: для own_transport Trip.profitAmd фактически равен
    // выручке (расходы парка не хранятся на Trip), поэтому верхний KPI не может просто
    // суммировать profitAmd по всем заявкам без разбора типа.

    // \u2500\u2500 4. PROBLEM TRIPS (cash gap) \u2500\u2500
    const problemRows = problemTrips
      .map(t => {
        const clientPaid = Number(t.clientPaidAmountAmd ?? t.clientPaidAmount ?? 0);
        const carrierPaid = Number(t.carrierPaidAmountAmd ?? t.carrierPaidAmount ?? 0);
        const diff = computeCashGapAmd(clientPaid, carrierPaid);
        return {
          id: t.id, tripNumber: t.tripNumber,
          clientName: t.client?.name ?? '', carrierName: t.carrier?.name ?? '',
          clientPaid, carrierPaid, diff,
        };
      })
      .filter(r => r.diff > 0)
      .sort((a, b) => b.diff - a.diff);

    // KPI totalCashGap — дедуп по tripId через уже полученные clientRows/carrierRows
    // (те же canonical getClientDebtRows/getCarrierDebtRows, что /api/debts и /api/day-tasks),
    // а НЕ problemRows.reduce(...) — заявка может быть и в клиентских, и в перевозчицких
    // долгах одновременно, а более широкий скан problemTrips (все expedition-заявки,
    // а не только с непогашенным долгом) давал число, которое технически совпадало с
    // Долгами на текущих данных, но не гарантированно (аудит 01.08.2026, п.4 — единая
    // логика кассового разрыва теперь в трёх местах: /debts, /dashboard, /day-tasks,
    // /api/trips/stats). problemRows ниже — отдельная detail-таблица «топ рискованных
    // экспедиционных заявок», её охват сознательно шире и не меняется.
    const totalCashGap = dedupeCashGapTotal([...clientRows, ...carrierRows]);

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
        NOT: { status: 'cancelled' },
      };
      if (clientId) prevWhere.clientId = clientId;
      if (tripType) prevWhere.tripType = tripType;

      // Предыдущий период — те же независимые запросы, одним Promise.all
      // (аудит "Дашборд"), а не последовательно.
      const prevCarrierWhere: any = { ...prevWhere, tripType: prevWhere.tripType ?? 'expedition', carrierPaymentStatus: { in: ['not_paid', 'partially_paid'] } };
      if (tripType === 'own_transport') prevCarrierWhere.tripType = 'own_transport';

      // Прибыль экспедиции за прошлый период — отдельно от собственного транспорта (см. п.6:
      // единая методология для тренда "Прибыль выросла/упала на X%" — иначе сравнивали бы
      // текущий период по новой формуле с прошлым по старой profitAmd-по-всем-заявкам).
      // Если явно запрошен фильтр tripType='own_transport' — экспедиции в этом представлении
      // нет вообще, вклад даёт только "Свой транспорт" ниже.
      const skipPrevExpedition = tripType === 'own_transport';
      const prevVtWhere: any = { departureDate: { gte: prevFrom, lte: prevTo } };

      const [prevClientDebtTrips, prevCarrierDebtTrips, prevExpeditionProfitAgg, prevProblemTrips, prevOwnFleetTotals] = await Promise.all([
        prisma.trip.findMany({
          where: { ...prevWhere, clientPaymentStatus: { in: ['not_paid', 'partially_paid'] } },
          select: { clientRateAmd: true, clientRate: true, clientPaidAmountAmd: true, clientPaidAmount: true, expenses: { select: { amountAmd: true, description: true } } },
        }),
        prisma.trip.findMany({
          where: prevCarrierWhere,
          select: { carrierRateAmd: true, carrierRate: true, carrierPaidAmountAmd: true, carrierPaidAmount: true, expenses: { select: { amountAmd: true, description: true } } },
        }),
        prisma.trip.aggregate({
          where: { ...prevWhere, tripType: 'expedition' },
          _sum: { profitAmd: true },
        }),
        prisma.trip.findMany({
          where: { ...prevWhere, tripType: prevWhere.tripType ?? 'expedition' },
          select: { clientPaidAmountAmd: true, clientPaidAmount: true, carrierPaidAmountAmd: true, carrierPaidAmount: true },
        }),
        computeOwnFleetTotals(prevVtWhere),
      ]);

      const prevTotalClientDebt = prevClientDebtTrips.reduce((s, t) => {
        const r = computeClientDueAmd(Number(t.clientRateAmd ?? t.clientRate ?? 0), t.expenses) - Number(t.clientPaidAmountAmd ?? t.clientPaidAmount ?? 0);
        return s + (r > 0 ? r : 0);
      }, 0);

      const prevTotalCarrierDebt = prevCarrierDebtTrips.reduce((s, t) => {
        const r = computeCarrierDueAmd(Number(t.carrierRateAmd ?? t.carrierRate ?? 0), t.expenses) - Number(t.carrierPaidAmountAmd ?? t.carrierPaidAmount ?? 0);
        return s + (r > 0 ? r : 0);
      }, 0);

      const prevExpeditionProfit = skipPrevExpedition ? 0 : Number(prevExpeditionProfitAgg._sum?.profitAmd ?? 0);
      const prevTotalProfit = prevExpeditionProfit + prevOwnFleetTotals.profit;

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

    // Единый источник ожидаемых/просроченных платежей — lib/dashboard-payment-reminders.ts
    // (buildClientPaymentReminderBuckets/buildCarrierPaymentReminderBuckets). Этот модуль уже
    // существовал (журнал-first, тот же canonical-правило, что и в client-overdue-logic.ts),
    // но нигде не вызывался — здесь была собственная копия, ограниченная только status='completed'
    // (аудит раздела "Долги": заявка на "Сверке"/"Ожидает оплаты" тоже может быть просрочена,
    // не только "Завершённая" — старая версия такие случаи пропускала).
    const paymentReminders = await getPaymentReminders(prisma, todayStart);
    const reminders = {
      overduePayments: paymentReminders.clientOverdue.slice(0, 10),
      paymentDueTrips: paymentReminders.clientDueSoon.slice(0, 15),
      carrierOverduePayments: paymentReminders.carrierOverdue.slice(0, 10),
      carrierPaymentDueTrips: paymentReminders.carrierDueSoon.slice(0, 15),
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
        // docType \u0443\u0436\u0435 \u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0438\u0440\u043e\u0432\u0430\u043d \u0432 \u0411\u0414 (osago|kasko|techosmotr|license|permit|other) \u2014
        // \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u0442\u0441\u044f Command Center v3, \u0447\u0442\u043e\u0431\u044b \u0440\u0430\u0437\u043b\u043e\u0436\u0438\u0442\u044c \u043e\u0434\u0438\u043d \u0438 \u0442\u043e\u0442 \u0436\u0435 \u0441\u043f\u0438\u0441\u043e\u043a \u043d\u0430 3 \u0440\u0430\u0437\u043d\u044b\u0435
        // \u0441\u0442\u0440\u043e\u043a\u0438 \u0440\u0438\u0441\u043a\u0430 (\u0441\u0442\u0440\u0430\u0445\u043e\u0432\u043a\u0438/\u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u0438\u044f/\u0442\u0435\u0445\u043e\u0441\u043c\u043e\u0442\u0440\u044b) \u0431\u0435\u0437 \u043f\u043e\u0432\u0442\u043e\u0440\u043d\u043e\u0433\u043e \u0437\u0430\u043f\u0440\u043e\u0441\u0430.
        docType: (i as any).docType ?? 'other',
      };
    });

    // \u2500\u2500 8. OWN FLEET SUMMARY \u2500\u2500
    // Этап 3 миграции на архитектуру "заявка → рейс": доход и расход считаются по ОДНОМУ
    // И ТОМУ ЖЕ набору рейсов машин (та же формула, что и /api/vehicle-analytics,
    // /api/vehicles/[id]/economics) — раньше доход считался
    // напрямую по заявкам own_transport, а расход отдельно по VehicleTrip за период
    // (и даже без FleetExpense) — две независимые, слегка разные суммы.
    const ownFleetTripCount = allTrips.filter((t: any) => t.tripType === 'own_transport').length;

    const vtWhere: any = {};
    if (dateFrom || dateTo) {
      vtWhere.departureDate = {};
      if (dateFrom) vtWhere.departureDate.gte = new Date(dateFrom);
      if (dateTo) vtWhere.departureDate.lte = new Date(dateTo + 'T23:59:59');
    }
    const { vehicleTrips: ownFleetVehicleTrips, revenue: ownFleetRevenue, expenses: ownFleetExpenses, profit: ownFleetProfit } = await computeOwnFleetTotals(vtWhere);
    const ownFleetSalary = ownFleetVehicleTrips.reduce((s, v) => s + (Number(v.salaryAmd) || 0), 0);
    // Суточные — сумма всех трёх слотов (разные страны маршрута считаются отдельно).
    const ownFleetPerDiem = ownFleetVehicleTrips.reduce(
      (s, v) => s + (Number(v.perDiemAmd) || 0) + (Number(v.perDiem2Amd) || 0) + (Number(v.perDiem3Amd) || 0) + (Number(v.perDiem4Amd) || 0),
      0
    );
    const ownFleetOther = ownFleetVehicleTrips.reduce((s, v) => s + (Number(v.otherExpensesAmd) || 0), 0);
    const ownFleetFuel = ownFleetVehicleTrips.reduce((s, v) => s + (Number(v.fuelCostAmd) || 0), 0);

    const ownFleet = {
      revenue: ownFleetRevenue,
      expenses: ownFleetExpenses,
      profit: ownFleetProfit,
      breakdown: { salary: ownFleetSalary, perDiem: ownFleetPerDiem, fuel: ownFleetFuel, other: ownFleetOther },
      tripCount: ownFleetTripCount,
      vtCount: ownFleetVehicleTrips.length,
    };

    // ── ЕДИНАЯ МЕТОДОЛОГИЯ ДЛЯ ВЕРХНИХ KPI (аудит, п.6) ──
    // Раньше totalProfit суммировал Trip.profitAmd по ВСЕМ заявкам без разбора типа. Для
    // own_transport это поле фактически равно выручке (расходы парка — зарплата/суточные/
    // топливо/FleetExpense — хранятся на VehicleTrip, а не на Trip, и в profitAmd не входят),
    // поэтому верхний KPI "Прибыль" незаметно смешивал выручку и прибыль. Теперь: экспедиция —
    // как раньше (profitAmd/clientRateAmd/carrierRateAmd построчно из allTrips), собственный
    // транспорт — ТЕ ЖЕ revenue/expenses/profit, что и в блоке "Свой транспорт" выше (единая
    // методология getVehicleTripsIncomeAmdBulk/computeVehicleTripExpensesAmd, та же, что
    // /api/vehicle-analytics). Формулы не менялись — это только
    // правильная точка сборки уже существующих чисел.
    const expeditionIncome = allTrips.reduce((s: number, t: any) => {
      if (t.tripType !== 'expedition') return s;
      const { clientExpensesAmd } = splitExpensesAmd(t.expenses);
      return s + Number(t.clientRateAmd ?? t.clientRate ?? 0) + clientExpensesAmd;
    }, 0);
    const expeditionExpense = allTrips.reduce((s: number, t: any) => {
      if (t.tripType !== 'expedition') return s;
      const { carrierExpensesAmd } = splitExpensesAmd(t.expenses);
      return s + Number(t.carrierRateAmd ?? t.carrierRate ?? 0) + carrierExpensesAmd;
    }, 0);
    const expeditionProfit = allTrips.reduce((s: number, t: any) => (
      t.tripType === 'expedition' ? s + Number(t.profitAmd ?? t.profit ?? 0) : s
    ), 0);

    const totalIncome = expeditionIncome + ownFleetRevenue;
    const totalExpense = expeditionExpense + ownFleetExpenses;
    const totalProfit = expeditionProfit + ownFleetProfit;

    // \u2500\u2500 9. CLIENTS LIST for filter \u2500\u2500
    const clients = await prisma.client.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    // \u2500\u2500 10. COMMAND CENTER: ATTENTION (\u043d\u0435\u0442 \u0441\u0447\u0451\u0442\u0430/\u0430\u043a\u0442\u0430 / \u043d\u0435\u0442 \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u0439) \u2500\u2500
    // \u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b \u0438\u043c\u0435\u044e\u0442 \u0441\u043c\u044b\u0441\u043b \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043e\u0441\u043b\u0435 \u0432\u044b\u0433\u0440\u0443\u0437\u043a\u0438 \u2014 \u043d\u0435 \u0444\u043b\u0430\u0433\u0430\u0435\u043c 'new'/'in_progress'
    // (\u0435\u0449\u0451 \u0440\u0430\u043d\u043e) \u0438 'sverka'/'completed'/'archived' (\u0431\u0443\u0445\u0433\u0430\u043b\u0442\u0435\u0440 \u0443\u0436\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u043b \u043d\u0430 \u0441\u0432\u0435\u0440\u043a\u0443,
    // \u044d\u0442\u043e \u0431\u043e\u043b\u044c\u0448\u0435 \u043d\u0435 \u0437\u0430\u0434\u0430\u0447\u0430 "\u041b\u0438\u0441\u0442\u0430 \u0434\u043d\u044f").
    const DOCS_DUE_STATUSES = ['unloaded', 'awaiting_payment'];
    const docsDueTrips = await prisma.trip.findMany({
      where: { status: { in: DOCS_DUE_STATUSES } },
      select: {
        id: true,
        tripNumber: true,
        status: true,
        invoiceDocNumber: true,
        actDocNumber: true,
        client: { select: { name: true } },
        _count: { select: { attachments: true } },
      },
      orderBy: { tripDate: 'desc' },
    });

    // \u0421\u0447\u0451\u0442/\u0430\u043a\u0442 \u043f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u043f\u043e \u043f\u043e\u043b\u044e \u0432 \u0411\u0414 \u0422\u041e\u041b\u042c\u041a\u041e \u0434\u043b\u044f \u0441\u0442\u0430\u0442\u0443\u0441\u0430 'unloaded' (\u0432\u044b\u0433\u0440\u0443\u0436\u0435\u043d\u043e,
    // \u043d\u043e \u0435\u0449\u0451 \u043d\u0435 \u043f\u0435\u0440\u0435\u0432\u0435\u0434\u0435\u043d\u043e \u043d\u0430 \u043e\u043f\u043b\u0430\u0442\u0443). \u041a\u0430\u043a \u0442\u043e\u043b\u044c\u043a\u043e \u0437\u0430\u044f\u0432\u043a\u0430 \u0434\u043e\u0448\u043b\u0430 \u0434\u043e 'awaiting_payment'
    // ("\u041d\u0430 \u043e\u043f\u043b\u0430\u0442\u0443") \u0438 \u0434\u0430\u043b\u044c\u0448\u0435 \u2014 \u043f\u043e \u0440\u0435\u0433\u043b\u0430\u043c\u0435\u043d\u0442\u0443 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438 \u0441\u0447\u0451\u0442 \u0438 \u0430\u043a\u0442 \u0443\u0436\u0435 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e
    // \u0432\u044b\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u044b, \u0441\u0430\u043c \u043f\u0435\u0440\u0435\u0445\u043e\u0434 \u0441\u0442\u0430\u0442\u0443\u0441\u0430 \u044d\u0442\u043e \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442; \u043f\u043e\u043b\u0435 invoiceDocNumber/
    // actDocNumber \u0438\u0441\u0442\u043e\u0440\u0438\u0447\u0435\u0441\u043a\u0438 \u043d\u0435 \u0432\u0441\u0435\u0433\u0434\u0430 \u0437\u0430\u043f\u043e\u043b\u043d\u044f\u043b\u043e\u0441\u044c (\u0441\u043c. \u0444\u0438\u043a\u0441 generate-docs),
    // \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u0434\u043e\u0432\u0435\u0440\u044f\u0442\u044c \u0435\u0433\u043e \u043e\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u044e \u043d\u0430 \u044d\u0442\u0438\u0445 \u0441\u0442\u0430\u0434\u0438\u044f\u0445 \u043d\u0435\u043b\u044c\u0437\u044f \u2014 \u0434\u0430\u0451\u0442 \u043b\u043e\u0436\u043d\u044b\u0435 \u0441\u0440\u0430\u0431\u0430\u0442\u044b\u0432\u0430\u043d\u0438\u044f.
    const noInvoiceActTrips = docsDueTrips
      .filter((t) => t.status === 'unloaded' && (!t.invoiceDocNumber || !t.actDocNumber))
      .slice(0, 10)
      .map((t) => ({ id: t.id, tripNumber: t.tripNumber, clientName: t.client?.name ?? '\u2014' }));

    const noAttachmentTrips = docsDueTrips
      .filter((t) => t._count.attachments === 0)
      .slice(0, 10)
      .map((t) => ({ id: t.id, tripNumber: t.tripNumber, clientName: t.client?.name ?? '\u2014' }));

    // ── 11. ENTERPRISE COMMAND CENTER v3: operational/idle/stuck/wialon ──
    // Единый первый запрос Dashboard (Phase 3 спецификации v3) — тот же getOperationalSummary,
    // что и /api/reports/overview (не второй запрос той же сводки), плюс два лёгких сравнения
    // уже хранимых дат (простаивающие машины / аномально долгие рейсы), плюс свежесть Wialon.
    // Раньше свежесть бралась как MAX(geofenceStatusAt) — это поле пишется ТОЛЬКО в момент
    // GPS-подтверждённого выезда конкретного рейса, а не как heartbeat синхронизации, поэтому
    // индикатор был всегда null (аудит 01.08.2026, п.6). Теперь — из Setting('wialon_last_sync_at'),
    // которую lib/company-base/baseCheck.ts обновляет при каждом успешном снимке Wialon.
    const todayStartCC = new Date(); todayStartCC.setHours(0, 0, 0, 0);
    const [operational, idleVehicles, stuckVehicleTrips, lastWialonSyncSetting] = await Promise.all([
      getOperationalSummary(prisma, todayStartCC),
      getIdleVehicles(prisma, 5),
      getStuckVehicleTrips(prisma, 14),
      prisma.setting.findUnique({ where: { key: 'wialon_last_sync_at' } }),
    ]);

    const commandCenter = {
      attention: { noInvoiceActTrips, noAttachmentTrips },
      idleVehicles,
      stuckVehicleTrips,
    };

    return NextResponse.json({
      operational,
      lastWialonSyncAt: lastWialonSyncSetting?.value ?? null,
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
      commandCenter,
    });
  } catch (e: any) {
    console.error('Dashboard API error:', e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430' }, { status: 500 });
  }
}