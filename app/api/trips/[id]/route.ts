export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { Decimal } from '@prisma/client/runtime/library';
import { recordTripHistory, diffFields } from '@/lib/trip-history';

function serializeTrip(trip: any) {
  return {
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
  };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const trip = await prisma.trip.findUnique({
      where: { id: params?.id },
      include: { client: true, contact: true, vehicle: true, driver: true, carrier: true, expenses: true },
    });
    if (!trip) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
    return NextResponse.json(serializeTrip(trip));
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();
    const clientRate = Number(body?.clientRate ?? 0);

    // Get old trip for diff
    const oldTrip = await prisma.trip.findUnique({ where: { id: params?.id } });

    // Delete old expenses and recalculate
    await prisma.expense.deleteMany({ where: { tripId: params?.id } });

    let profit = 0;
    const currency = body?.currency || oldTrip?.currency || 'AMD';
    const exchangeRate = Number(body?.exchangeRate ?? oldTrip?.exchangeRate ?? 1);
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

    const clientExpensesAmd = expensesWithAmd.filter((e: any) => e.description !== '__carrier__').reduce((s: number, e: any) => s + e.amountAmd, 0);
    const carrierExpensesAmd = expensesWithAmd.filter((e: any) => e.description === '__carrier__').reduce((s: number, e: any) => s + e.amountAmd, 0);
    const totalClientAmd = Math.round((clientRateAmd + clientExpensesAmd) * 100) / 100;
    const totalCarrierAmd = Math.round(((carrierRateAmd ?? 0) + carrierExpensesAmd) * 100) / 100;
    const profitAmd = Math.round((totalClientAmd - totalCarrierAmd) * 100) / 100;
    const origRate = Number(oldTrip?.originalRate ?? incomeRate);
    const origClientRateAmd = Math.round(clientRate * origRate * 100) / 100;
    const origProfitAmd = body?.tripType === 'expedition'
      ? Math.round((origClientRateAmd - (carrierRateAmd ?? 0)) * 100) / 100
      : profitAmd;
    const exchangeDiff = Math.round((profitAmd - origProfitAmd) * 100) / 100;

    const trip = await prisma.trip.update({
      where: { id: params?.id },
      data: {
        clientId: body.clientId,
        contactId: body.contactId !== undefined ? (body.contactId || null) : undefined,
        routeFrom: body?.routeFrom ?? '',
        routeTo: body?.routeTo ?? '',
        distance: body.distance ? Number(body.distance) : null,
        cargoWeight: body.cargoWeight ? new Decimal(Number(body.cargoWeight)) : null,
        tripType: body?.tripType ?? 'own_transport',
        clientRate: new Decimal(clientRate),
        vehicleId: body?.vehicleId || null,
        driverId: body?.driverId || null,
        carrierId: body?.carrierId || null,
        carrierRate: carrierRateVal != null ? new Decimal(carrierRateVal) : null,
        status: body?.status ?? 'new',
        tripDate: new Date(body?.tripDate ?? new Date()),
        paymentDueDate: body?.paymentDueDate ? new Date(body.paymentDueDate) : (body?.paymentDueDate === null ? null : undefined),
        basisText: body?.basisText !== undefined ? (body.basisText || null) : undefined,
        clientInvoiceSeries: body?.clientInvoiceSeries !== undefined ? (body.clientInvoiceSeries || null) : undefined,
        carrierInvoiceSeries: body?.carrierInvoiceSeries !== undefined ? (body.carrierInvoiceSeries || null) : undefined,
        notes: body?.notes !== undefined ? (body.notes || null) : undefined,
        customsDeparture: body?.customsDeparture !== undefined ? (body.customsDeparture || null) : undefined,
        customsDestination: body?.customsDestination !== undefined ? (body.customsDestination || null) : undefined,
        cargoName: body?.cargoName !== undefined ? (body.cargoName || null) : undefined,
        cargoValue: body?.cargoValue != null ? new Decimal(Number(body.cargoValue)) : (body?.cargoValue === null ? null : undefined),
        truckType: body?.truckType !== undefined ? (body.truckType || null) : undefined,
        loadingAddress: body?.loadingAddress !== undefined ? (body.loadingAddress || null) : undefined,
        unloadingAddress: body?.unloadingAddress !== undefined ? (body.unloadingAddress || null) : undefined,
        trailerPlate: body?.trailerPlate !== undefined ? (body.trailerPlate || null) : undefined,
        additionalTerms: body?.additionalTerms !== undefined ? (body.additionalTerms || null) : undefined,
        profit: new Decimal(profit),
        currency,
        exchangeRate: incomeRate,
        clientRateAmd,
        carrierCurrency: body?.tripType === 'expedition' ? carrierCurrency : null,
        carrierExchangeRate: body?.tripType === 'expedition' ? expenseRate : null,
        carrierRateAmd,
        profitAmd,
        exchangeDiff,
        clientPaymentStatus: body?.clientPaymentStatus ?? undefined,
        clientPaidAmount: body?.clientPaidAmount != null ? new Decimal(Number(body.clientPaidAmount)) : undefined,
        clientPaidAmountAmd: body?.clientPaidAmountAmd != null ? new Decimal(Number(body.clientPaidAmountAmd)) : undefined,
        carrierPaymentStatus: body?.carrierPaymentStatus ?? undefined,
        carrierPaidAmount: body?.carrierPaidAmount != null ? new Decimal(Number(body.carrierPaidAmount)) : undefined,
        carrierPaidAmountAmd: body?.carrierPaidAmountAmd != null ? new Decimal(Number(body.carrierPaidAmountAmd)) : undefined,
        carrierPaymentDate: body?.carrierPaymentDate ? new Date(body.carrierPaymentDate) : (body?.carrierPaymentDate === null ? null : undefined),
        carrierPaymentNote: body?.carrierPaymentNote !== undefined ? (body.carrierPaymentNote || null) : undefined,
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
    if (oldTrip) {
      const changes = diffFields(
        { ...oldTrip, clientRate: Number(oldTrip.clientRate), carrierRate: oldTrip.carrierRate != null ? Number(oldTrip.carrierRate) : '', cargoWeight: oldTrip.cargoWeight != null ? Number(oldTrip.cargoWeight) : '' },
        { ...body, clientRate, carrierRate: body.carrierRate ?? '' },
        ['clientId', 'routeFrom', 'routeTo', 'tripType', 'clientRate', 'vehicleId', 'driverId', 'carrierId', 'carrierRate', 'status', 'tripDate', 'distance', 'cargoWeight']
      );
      if (changes.length > 0) {
        await recordTripHistory(trip.id, 'updated', (session as any)?.user?.id ?? null, (session as any)?.user?.name ?? 'Система', changes);
      }
    }

    return NextResponse.json(serializeTrip(trip));
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}

// PATCH — update only specific fields (status, inline finance, etc.)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();

    // Get old trip for history
    const oldTrip = await prisma.trip.findUnique({ where: { id: params?.id } });

    const data: any = {};
    if (body.status) data.status = body.status;
    if (body.paymentDueDate !== undefined) {
      data.paymentDueDate = body.paymentDueDate ? new Date(body.paymentDueDate) : null;
    }
    if (body.basisText !== undefined) {
      data.basisText = body.basisText || null;
    }
    if (body.clientInvoiceSeries !== undefined) {
      data.clientInvoiceSeries = body.clientInvoiceSeries || null;
    }
    if (body.carrierInvoiceSeries !== undefined) {
      data.carrierInvoiceSeries = body.carrierInvoiceSeries || null;
    }

    // --- Inline financial field editing ---
    // Client rate
    if (body.clientRate !== undefined) {
      const cr = Number(body.clientRate) || 0;
      data.clientRate = new Decimal(cr);
      const cur = oldTrip?.currency || 'AMD';
      const rate = cur === 'AMD' ? 1 : Number(oldTrip?.exchangeRate ?? 1);
      data.clientRateAmd = new Decimal(Math.round(cr * rate * 100) / 100);
    }
    // Client paid amount (simple manual field)
    if (body.clientPaidAmount !== undefined) {
      const paid = Number(body.clientPaidAmount) || 0;
      data.clientPaidAmount = new Decimal(paid);
      data.clientPaidAmountAmd = new Decimal(paid); // stored as AMD
    }
    // Auto-calculate client payment status
    if (body.clientRate !== undefined || body.clientPaidAmount !== undefined) {
      const cRate = body.clientRate !== undefined ? Number(body.clientRate) || 0 : Number(oldTrip?.clientRate ?? 0);
      const cPaid = body.clientPaidAmount !== undefined ? Number(body.clientPaidAmount) || 0 : Number(oldTrip?.clientPaidAmount ?? 0);
      if (cPaid <= 0) data.clientPaymentStatus = 'not_paid';
      else if (cPaid >= cRate) data.clientPaymentStatus = 'paid';
      else data.clientPaymentStatus = 'partially_paid';
    }
    if (body.clientPaymentStatus !== undefined) data.clientPaymentStatus = body.clientPaymentStatus;

    // Carrier rate
    if (body.carrierRate !== undefined) {
      const cr = body.carrierRate != null ? Number(body.carrierRate) : null;
      data.carrierRate = cr != null ? new Decimal(cr) : null;
      if (cr != null) {
        const cCur = oldTrip?.carrierCurrency || oldTrip?.currency || 'AMD';
        const cRate = cCur === 'AMD' ? 1 : Number(oldTrip?.carrierExchangeRate ?? oldTrip?.exchangeRate ?? 1);
        data.carrierRateAmd = new Decimal(Math.round(cr * cRate * 100) / 100);
      }
    }
    // Carrier paid amount
    if (body.carrierPaidAmount !== undefined) {
      const paid = Number(body.carrierPaidAmount) || 0;
      data.carrierPaidAmount = new Decimal(paid);
      data.carrierPaidAmountAmd = new Decimal(paid);
    }
    // Auto-calculate carrier payment status
    if (body.carrierRate !== undefined || body.carrierPaidAmount !== undefined) {
      const cRate = body.carrierRate !== undefined ? Number(body.carrierRate) || 0 : Number(oldTrip?.carrierRate ?? 0);
      const cPaid = body.carrierPaidAmount !== undefined ? Number(body.carrierPaidAmount) || 0 : Number(oldTrip?.carrierPaidAmount ?? 0);
      if (cPaid <= 0) data.carrierPaymentStatus = 'not_paid';
      else if (cPaid >= cRate) data.carrierPaymentStatus = 'paid';
      else data.carrierPaymentStatus = 'partially_paid';
    }
    if (body.carrierPaymentStatus !== undefined && body.carrierRate === undefined && body.carrierPaidAmount === undefined) {
      data.carrierPaymentStatus = body.carrierPaymentStatus;
    }
    if (body.carrierPaymentDate !== undefined) data.carrierPaymentDate = body.carrierPaymentDate ? new Date(body.carrierPaymentDate) : null;
    if (body.carrierPaymentNote !== undefined) data.carrierPaymentNote = body.carrierPaymentNote || null;

    // Recalculate profit if rate changed
    if (body.clientRate !== undefined || body.carrierRate !== undefined) {
      const clientRateVal = body.clientRate !== undefined ? Number(body.clientRate) || 0 : Number(oldTrip?.clientRate ?? 0);
      const carrierRateVal = body.carrierRate !== undefined ? (body.carrierRate != null ? Number(body.carrierRate) : 0) : Number(oldTrip?.carrierRate ?? 0);
      const isExp = oldTrip?.tripType === 'expedition';
      if (isExp) {
        data.profit = new Decimal(Math.round((clientRateVal - carrierRateVal) * 100) / 100);
      }
      const crAmd = data.clientRateAmd != null ? Number(data.clientRateAmd) : Number(oldTrip?.clientRateAmd ?? 0);
      const caAmd = data.carrierRateAmd != null ? Number(data.carrierRateAmd) : Number(oldTrip?.carrierRateAmd ?? 0);
      if (isExp) {
        data.profitAmd = new Decimal(Math.round((crAmd - caAmd) * 100) / 100);
      }
    }

    const trip = await prisma.trip.update({
      where: { id: params?.id },
      data,
      include: { client: true, contact: true, vehicle: true, driver: true, carrier: true, expenses: true },
    });

    // Record status change
    if (body.status && oldTrip && oldTrip.status !== body.status) {
      await recordTripHistory(trip.id, 'status_changed', (session as any)?.user?.id ?? null, (session as any)?.user?.name ?? 'Система', [
        { field: 'status', oldValue: oldTrip.status, newValue: body.status },
      ]);
    }

    return NextResponse.json(serializeTrip(trip));
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const tripId = params?.id;
    if (!tripId) return NextResponse.json({ error: 'Неверный идентификатор' }, { status: 400 });

    // Minimum safety check: prevent deletion if trip has expenses, payments, or linked vehicle trip
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        vehicleTripId: true,
        _count: { select: { expenses: true, payments: true } },
      },
    });
    if (!trip) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });

    const hasExpenses = (trip._count?.expenses ?? 0) > 0;
    const hasPayments = (trip._count?.payments ?? 0) > 0;
    const hasVehicleTrip = !!trip.vehicleTripId;
    if (hasExpenses || hasPayments || hasVehicleTrip) {
      return NextResponse.json(
        { error: 'Нельзя удалить заявку, в ней есть данные' },
        { status: 400 }
      );
    }

    await prisma.trip.delete({ where: { id: tripId } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка удаления' }, { status: 500 });
  }
}
