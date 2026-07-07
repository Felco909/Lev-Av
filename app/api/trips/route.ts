export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { Decimal } from '@prisma/client/runtime/library';
import { recordTripHistory } from '@/lib/trip-history';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const tripType = searchParams.get('tripType');
    const clientId = searchParams.get('clientId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const search = searchParams.get('search');

    // --- Last rate hint (lightweight query) ---
    const lastRateFlag = searchParams.get('lastRate');
    const routeFromParam = searchParams.get('routeFrom');
    const routeToParam = searchParams.get('routeTo');
    if (lastRateFlag === '1' && clientId && routeFromParam && routeToParam) {
      const lastTrip = await prisma.trip.findFirst({
        where: {
          clientId,
          routeFrom: { equals: routeFromParam, mode: 'insensitive' },
          routeTo: { equals: routeToParam, mode: 'insensitive' },
        },
        orderBy: { tripDate: 'desc' },
        select: { clientRate: true, currency: true, tripDate: true },
      });
      if (lastTrip) {
        return NextResponse.json({
          lastRate: {
            rate: Number(lastTrip.clientRate),
            currency: lastTrip.currency,
            date: lastTrip.tripDate.toISOString().split('T')[0],
          },
        });
      }
      return NextResponse.json({ lastRate: null });
    }

    const paymentStatus = searchParams.get('paymentStatus');

    const showArchived = searchParams.get('showArchived');
    const where: any = {};
    if (status) {
      where.status = status;
    } else if (showArchived !== '1') {
      where.status = { not: 'archived' };
    }
    if (tripType) where.tripType = tripType;
    if (clientId) where.clientId = clientId;
    if (paymentStatus) where.clientPaymentStatus = paymentStatus;
    if (dateFrom || dateTo) {
      where.tripDate = {};
      if (dateFrom) where.tripDate.gte = new Date(dateFrom);
      if (dateTo) where.tripDate.lte = new Date(dateTo);
    }
    // Route exact filters (for duplicate check)
    if (routeFromParam && !lastRateFlag) where.routeFrom = { equals: routeFromParam, mode: 'insensitive' };
    if (routeToParam && !lastRateFlag) where.routeTo = { equals: routeToParam, mode: 'insensitive' };

    if (search) {
      where.OR = [
        { tripNumber: { contains: search, mode: 'insensitive' } },
        { routeFrom: { contains: search, mode: 'insensitive' } },
        { routeTo: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
        { contact: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // --- Sorting params ---
    const sortByRaw = searchParams.get('sortBy') || 'tripDate';
    const sortBy: 'tripDate' | 'createdAt' = sortByRaw === 'createdAt' ? 'createdAt' : 'tripDate';
    const sortDirRaw = searchParams.get('sortDir') || 'desc';
    const sortDir: 'asc' | 'desc' = sortDirRaw === 'asc' ? 'asc' : 'desc';
    const groupByStatus = searchParams.get('groupByStatus') === '1';

    // --- Server-side pagination ---
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '0', 10);
    const usePagination = pageSize > 0;

    // Status group priority for grouped mode
    const statusGroupRank = (status: string | null | undefined): number => {
      if (status === 'new') return 1;
      if (status === 'in_progress' || status === 'unloaded') return 2;
      if (status === 'archived') return 4;
      return 3; // completed, paid, other
    };

    let trips: any[] = [];
    let totalCount = 0;

    if (groupByStatus) {
      // Fetch all matching trips, sort by status group then by date, then paginate in-memory.
      const all = await prisma.trip.findMany({
        where,
        include: { client: true, contact: true, vehicle: true, driver: true, carrier: true, expenses: true },
      });
      all.sort((a: any, b: any) => {
        const ga = statusGroupRank(a?.status);
        const gb = statusGroupRank(b?.status);
        if (ga !== gb) return ga - gb;
        const ad = sortBy === 'createdAt' ? (a?.createdAt ? new Date(a.createdAt).getTime() : 0) : (a?.tripDate ? new Date(a.tripDate).getTime() : 0);
        const bd = sortBy === 'createdAt' ? (b?.createdAt ? new Date(b.createdAt).getTime() : 0) : (b?.tripDate ? new Date(b.tripDate).getTime() : 0);
        const diff = bd - ad; // default desc
        return sortDir === 'asc' ? -diff : diff;
      });
      totalCount = all.length;
      trips = usePagination ? all.slice((page - 1) * pageSize, page * pageSize) : all;
    } else {
      const orderBy: any = sortBy === 'createdAt'
        ? { createdAt: sortDir }
        : { tripDate: sortDir };
      const [items, count] = await Promise.all([
        prisma.trip.findMany({
          where,
          include: { client: true, contact: true, vehicle: true, driver: true, carrier: true, expenses: true },
          orderBy,
          ...(usePagination ? { take: pageSize, skip: (page - 1) * pageSize } : {}),
        }),
        usePagination ? prisma.trip.count({ where }) : Promise.resolve(0),
      ]);
      trips = items;
      totalCount = usePagination ? count : items.length;
    }

    const serialized = (trips ?? []).map((t: any) => ({
      ...t,
      clientRate: Number(t?.clientRate ?? 0),
      carrierRate: t?.carrierRate != null ? Number(t.carrierRate) : null,
      profit: Number(t?.profit ?? 0),
      exchangeRate: Number(t?.exchangeRate ?? 1),
      clientRateAmd: Number(t?.clientRateAmd ?? 0),
      carrierCurrency: t?.carrierCurrency ?? null,
      carrierExchangeRate: t?.carrierExchangeRate != null ? Number(t.carrierExchangeRate) : null,
      carrierRateAmd: t?.carrierRateAmd != null ? Number(t.carrierRateAmd) : null,
      profitAmd: Number(t?.profitAmd ?? 0),
      originalRate: Number(t?.originalRate ?? 1),
      exchangeDiff: Number(t?.exchangeDiff ?? 0),
      paymentDueDate: t?.paymentDueDate ? (t.paymentDueDate as Date).toISOString().split('T')[0] : null,
      clientPaymentStatus: t?.clientPaymentStatus ?? 'not_paid',
      clientPaidAmount: Number(t?.clientPaidAmount ?? 0),
      clientPaidAmountAmd: Number(t?.clientPaidAmountAmd ?? 0),
      carrierPaymentStatus: t?.carrierPaymentStatus ?? 'not_paid',
      carrierPaidAmount: Number(t?.carrierPaidAmount ?? 0),
      carrierPaidAmountAmd: Number(t?.carrierPaidAmountAmd ?? 0),
      carrierPaymentDate: t?.carrierPaymentDate ? (t.carrierPaymentDate as Date).toISOString().split('T')[0] : null,
      carrierPaymentNote: t?.carrierPaymentNote ?? null,
      expenses: (t?.expenses ?? []).map((e: any) => ({
        ...e,
        amount: Number(e?.amount ?? 0),
        amountAmd: Number(e?.amountAmd ?? e?.amount ?? 0),
        exchangeRate: Number(e?.exchangeRate ?? 1),
        currency: e?.currency ?? 'AMD',
      })),
    }));
    if (usePagination) {
      return NextResponse.json({ data: serialized, totalCount, page, pageSize });
    }
    return NextResponse.json(serialized);
  } catch (e: any) {
    console.error('GET /api/trips error:', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();

    // Generate trip number — find max existing number to avoid duplicates
    const year = new Date().getFullYear();
    const prefix = `TMS-${year}-`;
    const lastTrip = await prisma.trip.findFirst({
      where: { tripNumber: { startsWith: prefix } },
      orderBy: { tripNumber: 'desc' },
      select: { tripNumber: true },
    });
    let nextNum = 1;
    if (lastTrip?.tripNumber) {
      const parts = lastTrip.tripNumber.split('-');
      const parsed = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }
    let tripNumber = `${prefix}${String(nextNum).padStart(4, '0')}`;
    // Retry loop in case of race condition
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await prisma.trip.findUnique({ where: { tripNumber }, select: { id: true } });
      if (!exists) break;
      nextNum++;
      tripNumber = `${prefix}${String(nextNum).padStart(4, '0')}`;
    }

    // Calculate profit & AMD amounts
    let profit = 0;
    const clientRate = Number(body?.clientRate ?? 0);
    const currency = body?.currency || 'AMD';
    const exchangeRate = Number(body?.exchangeRate ?? 1);
    const incomeRate = currency === 'AMD' ? 1 : exchangeRate;

    // Carrier (expense) can have its own currency
    const carrierCurrency = body?.carrierCurrency || currency;
    const carrierExchangeRate = Number(body?.carrierExchangeRate ?? (carrierCurrency === 'AMD' ? 1 : exchangeRate));
    const expenseRate = carrierCurrency === 'AMD' ? 1 : carrierExchangeRate;

    const clientRateAmd = Math.round(clientRate * incomeRate * 100) / 100;
    const carrierRateVal = body?.carrierRate != null ? Number(body.carrierRate) : null;
    const carrierRateAmd = carrierRateVal != null ? Math.round(carrierRateVal * expenseRate * 100) / 100 : null;

    // Calculate amountAmd for each expense
    const expensesWithAmd = (body?.expenses ?? []).map((e: any) => {
      const amt = Number(e?.amount ?? 0);
      const eCur = e?.currency || 'AMD';
      const eRate = Number(e?.exchangeRate ?? 1);
      const amtAmd = eCur === 'AMD' ? amt : Math.round(amt * eRate * 100) / 100;
      return { ...e, amount: amt, currency: eCur, exchangeRate: eRate, amountAmd: amtAmd };
    });
    const totalExpensesAmd = expensesWithAmd.reduce((s: number, e: any) => s + e.amountAmd, 0);

    if (body?.tripType === 'expedition') {
      profit = clientRate - Number(body?.carrierRate ?? 0);
    } else {
      profit = clientRate - expensesWithAmd.reduce((s: number, e: any) => s + e.amount, 0);
    }

    let profitAmd: number;
    if (body?.tripType === 'expedition') {
      profitAmd = Math.round((clientRateAmd - (carrierRateAmd ?? 0) - totalExpensesAmd) * 100) / 100;
    } else {
      profitAmd = Math.round((clientRateAmd - totalExpensesAmd) * 100) / 100;
    }

    const trip = await prisma.trip.create({
      data: {
        tripNumber,
        clientId: body.clientId,
        contactId: body.contactId || null,
        routeFrom: body.routeFrom ?? '',
        routeTo: body.routeTo ?? '',
        distance: body.distance ? Number(body.distance) : null,
        cargoWeight: body.cargoWeight ? new Decimal(Number(body.cargoWeight)) : null,
        tripType: body.tripType ?? 'own_transport',
        clientRate: new Decimal(clientRate),
        vehicleId: body?.vehicleId || null,
        driverId: body?.driverId || null,
        carrierId: body?.carrierId || null,
        carrierRate: carrierRateVal != null ? new Decimal(carrierRateVal) : null,
        status: body?.status ?? 'new',
        tripDate: new Date(body?.tripDate ?? new Date()),
        paymentDueDate: body?.paymentDueDate ? new Date(body.paymentDueDate) : null,
        basisText: body?.basisText || null,
        clientInvoiceSeries: body?.clientInvoiceSeries || null,
        carrierInvoiceSeries: body?.carrierInvoiceSeries || null,
        notes: body?.notes || null,
        customsDeparture: body?.customsDeparture || null,
        customsDestination: body?.customsDestination || null,
        cargoName: body?.cargoName || null,
        cargoValue: body?.cargoValue != null ? new Decimal(Number(body.cargoValue)) : null,
        truckType: body?.truckType || null,
        loadingAddress: body?.loadingAddress || null,
        unloadingAddress: body?.unloadingAddress || null,
        trailerPlate: body?.trailerPlate || null,
        additionalTerms: body?.additionalTerms || null,
        profit: new Decimal(profit),
        currency,
        exchangeRate: incomeRate,
        clientRateAmd,
        carrierCurrency: body?.tripType === 'expedition' ? carrierCurrency : null,
        carrierExchangeRate: body?.tripType === 'expedition' ? expenseRate : null,
        carrierRateAmd,
        profitAmd,
        clientPaymentStatus: body?.clientPaymentStatus ?? 'not_paid',
        clientPaidAmount: body?.clientPaidAmount != null ? new Decimal(Number(body.clientPaidAmount)) : new Decimal(0),
        clientPaidAmountAmd: body?.clientPaidAmountAmd != null ? new Decimal(Number(body.clientPaidAmountAmd)) : new Decimal(0),
        carrierPaymentStatus: body?.carrierPaymentStatus ?? 'not_paid',
        carrierPaidAmount: body?.carrierPaidAmount != null ? new Decimal(Number(body.carrierPaidAmount)) : new Decimal(0),
        carrierPaidAmountAmd: body?.carrierPaidAmountAmd != null ? new Decimal(Number(body.carrierPaidAmountAmd)) : new Decimal(0),
        originalRate: incomeRate,
        exchangeDiff: 0,
        expenses: {
          create: expensesWithAmd.map((e: any) => ({
            expenseType: e?.expenseType ?? 'other',
            amount: new Decimal(e.amount),
            currency: e.currency,
            exchangeRate: new Decimal(e.exchangeRate),
            amountAmd: new Decimal(e.amountAmd),
            description: e?.description ?? '',
          })),
        },
      },
      include: { client: true, contact: true, vehicle: true, driver: true, carrier: true, expenses: true },
    });

    // Record history
    await recordTripHistory(trip.id, 'created', (session as any)?.user?.id ?? null, (session as any)?.user?.name ?? 'Система');
    return NextResponse.json({
      ...trip,
      clientRate: Number(trip?.clientRate ?? 0),
      carrierRate: trip?.carrierRate != null ? Number(trip.carrierRate) : null,
      profit: Number(trip?.profit ?? 0),
      cargoWeight: trip?.cargoWeight != null ? Number(trip.cargoWeight) : null,
      exchangeRate: Number(trip?.exchangeRate ?? 1),
      clientRateAmd: Number(trip?.clientRateAmd ?? 0),
      carrierCurrency: trip?.carrierCurrency ?? null,
      carrierExchangeRate: trip?.carrierExchangeRate != null ? Number(trip.carrierExchangeRate) : null,
      carrierRateAmd: trip?.carrierRateAmd != null ? Number(trip.carrierRateAmd) : null,
      profitAmd: Number(trip?.profitAmd ?? 0),
      originalRate: Number(trip?.originalRate ?? 1),
      exchangeDiff: Number(trip?.exchangeDiff ?? 0),
      paymentDueDate: trip?.paymentDueDate ? (trip.paymentDueDate as Date).toISOString().split('T')[0] : null,
      clientPaymentStatus: trip?.clientPaymentStatus ?? 'not_paid',
      clientPaidAmount: Number(trip?.clientPaidAmount ?? 0),
      clientPaidAmountAmd: Number(trip?.clientPaidAmountAmd ?? 0),
      carrierPaymentStatus: trip?.carrierPaymentStatus ?? 'not_paid',
      carrierPaidAmount: Number(trip?.carrierPaidAmount ?? 0),
      carrierPaidAmountAmd: Number(trip?.carrierPaidAmountAmd ?? 0),
      carrierPaymentDate: trip?.carrierPaymentDate ? (trip.carrierPaymentDate as Date).toISOString().split('T')[0] : null,
      carrierPaymentNote: trip?.carrierPaymentNote ?? null,
      expenses: (trip?.expenses ?? []).map((e: any) => ({
        ...e,
        amount: Number(e?.amount ?? 0),
        amountAmd: Number(e?.amountAmd ?? e?.amount ?? 0),
        exchangeRate: Number(e?.exchangeRate ?? 1),
        currency: e?.currency ?? 'AMD',
      })),
    });
  } catch (e: any) {
    console.error('POST /api/trips error:', e);
    return NextResponse.json({ error: 'Ошибка создания заявки' }, { status: 500 });
  }
}