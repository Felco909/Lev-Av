export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { Decimal } from '@prisma/client/runtime/library';
import { recordTripHistory, diffFields } from '@/lib/trip-history';
import { computeTripProfitAmd, computeClientDueAmd, computeCarrierDueAmd, computePaymentStatus } from '@/lib/finance/formulas';
import { logTripWriteDrift } from '@/lib/finance/finance-metrics-service';
import { assertRole, getTouchedDenormalizedPaymentFields, TRIP_DENORMALIZED_PAYMENT_ROLES } from '@/lib/auth/role-guard';
import { assertDirectWorkflowStatusChange } from '@/lib/trip-workflow-guards';

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

export async function GET(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
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

export async function PUT(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();

    // Денормализованные поля оплаты (clientPaidAmount*/carrierPaidAmount*/статусы) —
    // только admin/owner/director/accountant (см. CLAUDE.md, lib/auth/role-guard.ts).
    // Ставки/расходы/статус маршрута — обычная работа, этой проверкой не затрагиваются.
    const touchedPaymentFields = getTouchedDenormalizedPaymentFields(body);
    if (touchedPaymentFields.length > 0) {
      const guard = assertRole(session, TRIP_DENORMALIZED_PAYMENT_ROLES, 'изменение оплаты по заявке');
      if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const clientRate = Number(body?.clientRate ?? 0);

    // Get old trip for diff
    const oldTrip = await prisma.trip.findUnique({ where: { id: params?.id } });

    // ПРИМЕЧАНИЕ: строгую проверку соседнего шага воркфлоу (assertDirectWorkflowStatusChange)
    // сюда намеренно НЕ добавляем — форма (trip-form.tsx) позволяет локально прокликать
    // несколько шагов подряд перед одним Save, и тогда body.status может законно отличаться
    // от oldTrip.status больше чем на 1 шаг. Строгая проверка стоит в PATCH, где смена
    // статуса — всегда одно явное действие (например «Завершить»), а не результат
    // накопленных локальных кликов.

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
    // Единая формула прибыли (lib/finance/formulas.ts) — одна и та же для
    // own_transport и expedition, расходы разбираются по маркеру __carrier__.
    const profitAmd = computeTripProfitAmd({
      clientRateAmd,
      carrierRateAmd: body?.tripType === 'expedition' ? carrierRateAmd : null,
      expenses: expensesWithAmd,
    });
    // profit — та же величина в валюте клиента (обратный пересчёт по курсу).
    profit = Math.round((profitAmd / incomeRate) * 100) / 100;

    const origRate = Number(oldTrip?.originalRate ?? incomeRate);
    const origClientRateAmd = Math.round(clientRate * origRate * 100) / 100;
    const origProfitAmd = body?.tripType === 'expedition'
      ? computeTripProfitAmd({ clientRateAmd: origClientRateAmd, carrierRateAmd, expenses: expensesWithAmd })
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
        taxCode: body?.taxCode !== undefined ? (body.taxCode || null) : undefined,
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

    logTripWriteDrift({
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      tripType: trip.tripType,
      clientRateAmd: Number(trip.clientRateAmd ?? 0),
      carrierRateAmd: trip.carrierRateAmd != null ? Number(trip.carrierRateAmd) : null,
      expenses: trip.expenses ?? [],
      clientPaidAmountAmd: Number(trip.clientPaidAmountAmd ?? 0),
      carrierPaidAmountAmd: Number(trip.carrierPaidAmountAmd ?? 0),
      savedProfitAmd: Number(trip.profitAmd ?? 0),
      savedClientPaymentStatus: String(trip.clientPaymentStatus ?? 'not_paid'),
      savedCarrierPaymentStatus: String(trip.carrierPaymentStatus ?? 'not_paid'),
    }, 'trips:PUT');

    return NextResponse.json(serializeTrip(trip));
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}

// PATCH — update only specific fields (status, inline finance, etc.)
export async function PATCH(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();

    // Денормализованные поля оплаты — только admin/owner/director/accountant.
    const touchedPaymentFields = getTouchedDenormalizedPaymentFields(body);
    if (touchedPaymentFields.length > 0) {
      const guard = assertRole(session, TRIP_DENORMALIZED_PAYMENT_ROLES, 'изменение оплаты по заявке');
      if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    // Get old trip for history (include expenses — profit recalculation below needs them)
    const oldTrip = await prisma.trip.findUnique({ where: { id: params?.id }, include: { expenses: true } });

    // Запрет «перепрыгивания» через шаги воркфлоу — та же проверка, что в PUT.
    if (body.status) {
      const workflowCheck = assertDirectWorkflowStatusChange(oldTrip?.status, body.status);
      if (!workflowCheck.ok) {
        return NextResponse.json({ error: workflowCheck.message }, { status: 400 });
      }
    }

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
    if (body.taxCode !== undefined) {
      data.taxCode = body.taxCode || null;
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
    // Auto-calculate client payment status — сумма к оплате включает
    // перевыставляемые клиентские расходы (см. computeTripProfitAmd/CLAUDE.md).
    if (body.clientRate !== undefined || body.clientPaidAmount !== undefined) {
      const crAmd = data.clientRateAmd != null ? Number(data.clientRateAmd) : Number(oldTrip?.clientRateAmd ?? 0);
      const cPaidAmd = data.clientPaidAmountAmd != null ? Number(data.clientPaidAmountAmd) : Number(oldTrip?.clientPaidAmountAmd ?? 0);
      const clientDueAmd = computeClientDueAmd(crAmd, oldTrip?.expenses ?? []);
      data.clientPaymentStatus = computePaymentStatus(clientDueAmd, cPaidAmd);
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
    // Auto-calculate carrier payment status — сумма к оплате включает
    // расходы перевозчика (маркер __carrier__, см. CLAUDE.md).
    if (body.carrierRate !== undefined || body.carrierPaidAmount !== undefined) {
      const caAmd = data.carrierRateAmd != null ? Number(data.carrierRateAmd) : Number(oldTrip?.carrierRateAmd ?? 0);
      const cPaidAmd = data.carrierPaidAmountAmd != null ? Number(data.carrierPaidAmountAmd) : Number(oldTrip?.carrierPaidAmountAmd ?? 0);
      const carrierDueAmd = computeCarrierDueAmd(caAmd, oldTrip?.expenses ?? []);
      data.carrierPaymentStatus = computePaymentStatus(carrierDueAmd, cPaidAmd);
    }
    if (body.carrierPaymentStatus !== undefined && body.carrierRate === undefined && body.carrierPaidAmount === undefined) {
      data.carrierPaymentStatus = body.carrierPaymentStatus;
    }
    if (body.carrierPaymentDate !== undefined) data.carrierPaymentDate = body.carrierPaymentDate ? new Date(body.carrierPaymentDate) : null;
    if (body.carrierPaymentNote !== undefined) data.carrierPaymentNote = body.carrierPaymentNote || null;

    // Recalculate profit if rate changed — единая формула (lib/finance/formulas.ts),
    // с учётом расходов заявки (раньше здесь расходы терялись, а own_transport
    // вообще не пересчитывался).
    if (body.clientRate !== undefined || body.carrierRate !== undefined) {
      const isExp = oldTrip?.tripType === 'expedition';
      const crAmd = data.clientRateAmd != null ? Number(data.clientRateAmd) : Number(oldTrip?.clientRateAmd ?? 0);
      const caAmd = data.carrierRateAmd != null ? Number(data.carrierRateAmd) : Number(oldTrip?.carrierRateAmd ?? 0);
      const incomeRateForProfit = Number(oldTrip?.exchangeRate ?? 1) || 1;
      const profitAmd = computeTripProfitAmd({
        clientRateAmd: crAmd,
        carrierRateAmd: isExp ? caAmd : null,
        expenses: oldTrip?.expenses ?? [],
      });
      data.profitAmd = new Decimal(profitAmd);
      data.profit = new Decimal(Math.round((profitAmd / incomeRateForProfit) * 100) / 100);
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

    logTripWriteDrift({
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      tripType: trip.tripType,
      clientRateAmd: Number(trip.clientRateAmd ?? 0),
      carrierRateAmd: trip.carrierRateAmd != null ? Number(trip.carrierRateAmd) : null,
      expenses: trip.expenses ?? [],
      clientPaidAmountAmd: Number(trip.clientPaidAmountAmd ?? 0),
      carrierPaidAmountAmd: Number(trip.carrierPaidAmountAmd ?? 0),
      savedProfitAmd: Number(trip.profitAmd ?? 0),
      savedClientPaymentStatus: String(trip.clientPaymentStatus ?? 'not_paid'),
      savedCarrierPaymentStatus: String(trip.carrierPaymentStatus ?? 'not_paid'),
    }, 'trips:PATCH');

    return NextResponse.json(serializeTrip(trip));
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
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
