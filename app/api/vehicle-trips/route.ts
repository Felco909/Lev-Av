import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { maybeCalculateTotals, maybeSyncVehicleMileage, validateOdometerValues, validateNoOverlappingVehicleTripDates, validateUniqueTripNumberForVehicle } from '@/lib/vehicle-trips/close-trip';

export const dynamic = 'force-dynamic';

/*
 * Следующий номер рейса ДЛЯ ЭТОЙ МАШИНЫ — не глобальный счётчик. На практике номер рейса
 * всегда означает "рейс №N этой машины" (так вводили вручную во всех реальных записях —
 * простые "1", "2", "3" на машину), а не сквозной номер по всему парку. Раньше при пустом
 * поле подставлялся глобальный "VT-0001" — выбивался из этой конвенции, поэтому им никто не
 * пользовался и все номера вводили вручную, что и привело к дублю (см. 796DE61: два рейса
 * с номером "2" — один архивный, один активный).
 */
async function nextTripNumberForVehicle(vehicleId: string): Promise<string> {
  const rows = await prisma.vehicleTrip.findMany({ where: { vehicleId }, select: { tripNumber: true } });
  let max = 0;
  for (const r of rows) {
    const m = r.tripNumber?.match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return String(max + 1);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const vehicleId = sp.get('vehicleId') || undefined;
  const status = sp.get('status') || undefined;
  const dateFrom = sp.get('dateFrom') || undefined;
  const dateTo = sp.get('dateTo') || undefined;

  const showArchived = sp.get('showArchived') || undefined;
  const where: any = {};
  if (vehicleId) where.vehicleId = vehicleId;
  if (status) {
    where.status = status;
  } else if (showArchived !== '1') {
    where.status = { not: 'archived' };
  }
  if (dateFrom || dateTo) {
    where.departureDate = {};
    if (dateFrom) where.departureDate.gte = new Date(dateFrom);
    if (dateTo) where.departureDate.lte = new Date(dateTo + 'T23:59:59');
  }

  const rows = await prisma.vehicleTrip.findMany({
    where,
    include: {
      vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
      driver: { select: { id: true, fullName: true } },
      _count: { select: { trips: true, fleetExpenses: true } },
    },
    orderBy: { departureDate: 'desc' },
  });

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { vehicleId, driverId, departureDate, departureLat, departureLon, startMileage, startFuel,
    returnDate, returnLat, returnLon, endMileage, endFuel, notes,
    tripNumber: customTripNumber,
    salary, salaryCurrency, salaryRate,
    perDiem, perDiemCurrency, perDiemRate,
    perDiem2, perDiem2Currency, perDiem2Rate,
    perDiem3, perDiem3Currency, perDiem3Rate,
    otherExpenses, otherCurrency, otherRate,
    fuelLiters, fuelCost, fuelCurrency, fuelRate } = body;

  if (!vehicleId || !departureDate) {
    return NextResponse.json({ error: '\u041e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u043b\u044f: \u043c\u0430\u0448\u0438\u043d\u0430, \u0434\u0430\u0442\u0430 \u0432\u044b\u0435\u0437\u0434\u0430' }, { status: 400 });
  }

  const odometerError = await validateOdometerValues(
    vehicleId,
    startMileage ? parseInt(startMileage, 10) : null,
    endMileage ? parseInt(endMileage, 10) : null
  );
  if (odometerError) return NextResponse.json({ error: odometerError }, { status: 400 });

  const overlapError = await validateNoOverlappingVehicleTripDates(
    vehicleId,
    new Date(departureDate),
    returnDate ? new Date(returnDate) : null,
    undefined,
    returnDate ? 'completed' : 'active'
  );
  if (overlapError) return NextResponse.json({ error: overlapError }, { status: 400 });

  const tripNumber = customTripNumber?.trim() || await nextTripNumberForVehicle(vehicleId);

  const dupNumberError = await validateUniqueTripNumberForVehicle(vehicleId, tripNumber);
  if (dupNumberError) return NextResponse.json({ error: dupNumberError }, { status: 400 });

  // Per-expense AMD calculation
  const toAmd = (v: any, cur: string, rate: number) => {
    if (v == null || v === '') return null;
    const r = cur === 'AMD' ? 1 : rate;
    return Math.round(parseFloat(v) * r * 100) / 100;
  };
  const sCur = salaryCurrency || 'AMD'; const sRate = parseFloat(salaryRate) || 1;
  const pCur = perDiemCurrency || 'AMD'; const pRate = parseFloat(perDiemRate) || 1;
  const p2Cur = perDiem2Currency || 'AMD'; const p2Rate = parseFloat(perDiem2Rate) || 1;
  const p3Cur = perDiem3Currency || 'AMD'; const p3Rate = parseFloat(perDiem3Rate) || 1;
  const oCur = otherCurrency || 'AMD'; const oRate = parseFloat(otherRate) || 1;
  const fCur = fuelCurrency || 'AMD'; const fRate = parseFloat(fuelRate) || 1;

  const record = await prisma.vehicleTrip.create({
    data: {
      tripNumber,
      vehicleId,
      driverId: driverId || null,
      departureDate: new Date(departureDate),
      departureLat: departureLat != null && departureLat !== '' ? parseFloat(departureLat) : null,
      departureLon: departureLon != null && departureLon !== '' ? parseFloat(departureLon) : null,
      startMileage: startMileage ? parseInt(startMileage, 10) : null,
      startFuel: startFuel ? parseFloat(startFuel) : null,
      returnDate: returnDate ? new Date(returnDate) : null,
      returnLat: returnLat != null && returnLat !== '' ? parseFloat(returnLat) : null,
      returnLon: returnLon != null && returnLon !== '' ? parseFloat(returnLon) : null,
      endMileage: endMileage ? parseInt(endMileage, 10) : null,
      endFuel: endFuel ? parseFloat(endFuel) : null,
      status: returnDate ? 'completed' : 'active',
      notes: notes || null,
      salary: salary ? parseFloat(salary) : null, salaryCurrency: sCur, salaryRate: sRate,
      salaryAmd: toAmd(salary, sCur, sRate),
      perDiem: perDiem ? parseFloat(perDiem) : null, perDiemCurrency: pCur, perDiemRate: pRate,
      perDiemAmd: toAmd(perDiem, pCur, pRate),
      perDiem2: perDiem2 ? parseFloat(perDiem2) : null, perDiem2Currency: p2Cur, perDiem2Rate: p2Rate,
      perDiem2Amd: toAmd(perDiem2, p2Cur, p2Rate),
      perDiem3: perDiem3 ? parseFloat(perDiem3) : null, perDiem3Currency: p3Cur, perDiem3Rate: p3Rate,
      perDiem3Amd: toAmd(perDiem3, p3Cur, p3Rate),
      otherExpenses: otherExpenses ? parseFloat(otherExpenses) : null, otherCurrency: oCur, otherRate: oRate,
      otherExpensesAmd: toAmd(otherExpenses, oCur, oRate),
      fuelLiters: fuelLiters ? parseFloat(fuelLiters) : null,
      fuelCost: fuelCost ? parseFloat(fuelCost) : null, fuelCurrency: fCur, fuelRate: fRate,
      fuelCostAmd: toAmd(fuelCost, fCur, fRate),
    },
    include: {
      vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
      driver: { select: { id: true, fullName: true } },
    },
  });

  await maybeCalculateTotals(record.id, record.departureDate, record.returnDate);
  await maybeSyncVehicleMileage(record.vehicleId, record.endMileage);

  return NextResponse.json(record, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id as string | undefined;

  const body = await req.json();
  const { id, vehicleId, driverId, departureDate, departureLat, departureLon, startMileage, startFuel,
    returnDate, returnLat, returnLon, endMileage, endFuel, notes, status: st,
    tripNumber, finalRevenueAmd, finalExpensesAmd,
    salary, salaryCurrency, salaryRate,
    perDiem, perDiemCurrency, perDiemRate,
    perDiem2, perDiem2Currency, perDiem2Rate,
    perDiem3, perDiem3Currency, perDiem3Rate,
    otherExpenses, otherCurrency, otherRate,
    fuelLiters, fuelCost, fuelCurrency, fuelRate } = body;

  if (!id) return NextResponse.json({ error: 'ID \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u0435\u043d' }, { status: 400 });

  const before = await prisma.vehicleTrip.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: '\u0420\u0435\u0439\u0441 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' }, { status: 404 });
  const wasClosed = before.status === 'completed';

  if (startMileage !== undefined || endMileage !== undefined) {
    const effectiveStartMileage = startMileage !== undefined ? (startMileage ? parseInt(startMileage, 10) : null) : before.startMileage;
    const effectiveEndMileage = endMileage !== undefined ? (endMileage ? parseInt(endMileage, 10) : null) : before.endMileage;
    const odometerError = await validateOdometerValues(vehicleId ?? before.vehicleId, effectiveStartMileage, effectiveEndMileage);
    if (odometerError) return NextResponse.json({ error: odometerError }, { status: 400 });
  }

  {
    const effectiveVehicleId = vehicleId ?? before.vehicleId;
    const effectiveDepartureDate = departureDate !== undefined ? new Date(departureDate) : before.departureDate;
    const effectiveReturnDate = returnDate !== undefined ? (returnDate ? new Date(returnDate) : null) : before.returnDate;
    // Проверяем пересечение только если даты/машина РЕАЛЬНО меняются — иначе форма карточки
    // рейса (которая всегда шлёт даты в body, даже если их не трогали) заблокировала бы
    // сохранение любого не связанного с датами поля (расходы, заметки и т.п.) у СТАРЫХ
    // рейсов без returnDate, которые и так уже корректно обрабатываются при расчёте дохода
    // (см. resolveMatchRangeEnd) — это не тот же случай, что 521DF61 (там обе даты были
    // явно заданы и реально пересекались).
    const datesChanged = effectiveVehicleId !== before.vehicleId
      || effectiveDepartureDate.getTime() !== before.departureDate.getTime()
      || (effectiveReturnDate?.getTime() ?? null) !== (before.returnDate?.getTime() ?? null);
    if (datesChanged) {
      const effectiveStatus = st !== undefined ? st : before.status;
      const overlapError = await validateNoOverlappingVehicleTripDates(effectiveVehicleId, effectiveDepartureDate, effectiveReturnDate, id, effectiveStatus);
      if (overlapError) return NextResponse.json({ error: overlapError }, { status: 400 });
    }
  }

  if (tripNumber !== undefined || vehicleId !== undefined) {
    const effectiveVehicleId = vehicleId ?? before.vehicleId;
    const effectiveTripNumber = tripNumber !== undefined ? tripNumber.trim() : before.tripNumber;
    const dupNumberError = await validateUniqueTripNumberForVehicle(effectiveVehicleId, effectiveTripNumber, id);
    if (dupNumberError) return NextResponse.json({ error: dupNumberError }, { status: 400 });
  }

  const data: any = {};
  if (vehicleId !== undefined) data.vehicleId = vehicleId;
  if (driverId !== undefined) data.driverId = driverId || null;
  if (departureDate !== undefined) data.departureDate = new Date(departureDate);
  if (departureLat !== undefined) data.departureLat = departureLat != null && departureLat !== '' ? parseFloat(departureLat) : null;
  if (departureLon !== undefined) data.departureLon = departureLon != null && departureLon !== '' ? parseFloat(departureLon) : null;
  if (startMileage !== undefined) data.startMileage = startMileage ? parseInt(startMileage, 10) : null;
  if (startFuel !== undefined) data.startFuel = startFuel ? parseFloat(startFuel) : null;
  if (returnDate !== undefined) data.returnDate = returnDate ? new Date(returnDate) : null;
  if (returnLat !== undefined) data.returnLat = returnLat != null && returnLat !== '' ? parseFloat(returnLat) : null;
  if (returnLon !== undefined) data.returnLon = returnLon != null && returnLon !== '' ? parseFloat(returnLon) : null;
  if (endMileage !== undefined) data.endMileage = endMileage ? parseInt(endMileage, 10) : null;
  if (endFuel !== undefined) data.endFuel = endFuel ? parseFloat(endFuel) : null;
  if (notes !== undefined) data.notes = notes || null;
  // Автоматическое "returnDate задан -> status=completed" убрано ("Доработка логики рейсов" —
  // финальная архитектура): закрытие рейса теперь ТОЛЬКО через POST .../close (кнопка
  // "Закрыть рейс" — там же живой снимок Wialon и заморозка итогов). Обычный PUT может
  // менять статус явно (например, в архив), но не переводит сам в "completed".
  if (st !== undefined) data.status = st;
  if (tripNumber !== undefined) data.tripNumber = tripNumber.trim();

  // Доход/расходы редактируются напрямую ТОЛЬКО у уже закрытого рейса (заморожены при
  // закрытии) — правки логируются ниже. Для активного рейса эти поля live-считаются
  // (см. GET-роут), сохранять их незачем.
  if (wasClosed && finalRevenueAmd !== undefined) data.finalRevenueAmd = finalRevenueAmd === '' || finalRevenueAmd == null ? null : parseFloat(finalRevenueAmd);
  if (wasClosed && finalExpensesAmd !== undefined) data.finalExpensesAmd = finalExpensesAmd === '' || finalExpensesAmd == null ? null : parseFloat(finalExpensesAmd);

  // Per-expense AMD calc helper
  const toAmd = (v: any, cur: string, rate: number) => {
    if (v == null || v === '') return null;
    const r = cur === 'AMD' ? 1 : rate;
    return Math.round(parseFloat(v) * r * 100) / 100;
  };

  // Salary
  if (salary !== undefined) data.salary = salary ? parseFloat(salary) : null;
  if (salaryCurrency !== undefined) data.salaryCurrency = salaryCurrency;
  if (salaryRate !== undefined) data.salaryRate = parseFloat(salaryRate) || 1;
  if (salary !== undefined || salaryCurrency !== undefined || salaryRate !== undefined) {
    const c = salaryCurrency ?? 'AMD'; const r = parseFloat(salaryRate) || 1;
    data.salaryAmd = toAmd(salary, c, r);
  }

  // PerDiem (слот №1)
  if (perDiem !== undefined) data.perDiem = perDiem ? parseFloat(perDiem) : null;
  if (perDiemCurrency !== undefined) data.perDiemCurrency = perDiemCurrency;
  if (perDiemRate !== undefined) data.perDiemRate = parseFloat(perDiemRate) || 1;
  if (perDiem !== undefined || perDiemCurrency !== undefined || perDiemRate !== undefined) {
    const c = perDiemCurrency ?? 'AMD'; const r = parseFloat(perDiemRate) || 1;
    data.perDiemAmd = toAmd(perDiem, c, r);
  }

  // PerDiem №2
  if (perDiem2 !== undefined) data.perDiem2 = perDiem2 ? parseFloat(perDiem2) : null;
  if (perDiem2Currency !== undefined) data.perDiem2Currency = perDiem2Currency;
  if (perDiem2Rate !== undefined) data.perDiem2Rate = parseFloat(perDiem2Rate) || 1;
  if (perDiem2 !== undefined || perDiem2Currency !== undefined || perDiem2Rate !== undefined) {
    const c = perDiem2Currency ?? 'AMD'; const r = parseFloat(perDiem2Rate) || 1;
    data.perDiem2Amd = toAmd(perDiem2, c, r);
  }

  // PerDiem №3
  if (perDiem3 !== undefined) data.perDiem3 = perDiem3 ? parseFloat(perDiem3) : null;
  if (perDiem3Currency !== undefined) data.perDiem3Currency = perDiem3Currency;
  if (perDiem3Rate !== undefined) data.perDiem3Rate = parseFloat(perDiem3Rate) || 1;
  if (perDiem3 !== undefined || perDiem3Currency !== undefined || perDiem3Rate !== undefined) {
    const c = perDiem3Currency ?? 'AMD'; const r = parseFloat(perDiem3Rate) || 1;
    data.perDiem3Amd = toAmd(perDiem3, c, r);
  }

  // Other
  if (otherExpenses !== undefined) data.otherExpenses = otherExpenses ? parseFloat(otherExpenses) : null;
  if (otherCurrency !== undefined) data.otherCurrency = otherCurrency;
  if (otherRate !== undefined) data.otherRate = parseFloat(otherRate) || 1;
  if (otherExpenses !== undefined || otherCurrency !== undefined || otherRate !== undefined) {
    const c = otherCurrency ?? 'AMD'; const r = parseFloat(otherRate) || 1;
    data.otherExpensesAmd = toAmd(otherExpenses, c, r);
  }

  // Fuel
  if (fuelLiters !== undefined) data.fuelLiters = fuelLiters ? parseFloat(fuelLiters) : null;
  if (fuelCost !== undefined) data.fuelCost = fuelCost ? parseFloat(fuelCost) : null;
  if (fuelCurrency !== undefined) data.fuelCurrency = fuelCurrency;
  if (fuelRate !== undefined) data.fuelRate = parseFloat(fuelRate) || 1;
  if (fuelCost !== undefined || fuelCurrency !== undefined || fuelRate !== undefined) {
    const c = fuelCurrency ?? 'AMD'; const r = parseFloat(fuelRate) || 1;
    data.fuelCostAmd = toAmd(fuelCost, c, r);
  }

  const record = await prisma.vehicleTrip.update({
    where: { id },
    data,
    include: {
      vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
      driver: { select: { id: true, fullName: true } },
    },
  });

  // Заморозка: у уже закрытого рейса — никакого авто-пересчёта по Wialon (это ровно то,
  // что "Доработка логики рейсов" запрещает, п.5/п.6), только журнал ручных правок ниже.
  // Для активного рейса — прежнее поведение без изменений.
  if (!wasClosed) {
    await maybeCalculateTotals(record.id, record.departureDate, record.returnDate);
    await maybeSyncVehicleMileage(record.vehicleId, record.endMileage);
  } else {
    await logClosedTripEdits(id, userId, before, record);
  }

  return NextResponse.json(record);
}

/** Поля закрытого рейса, правки которых логируются (п.7 — журнал изменений). */
const LOGGED_FIELDS = [
  'departureDate', 'returnDate', 'finalRevenueAmd', 'finalExpensesAmd',
  'startMileage', 'endMileage', 'startFuel', 'endFuel', 'notes',
] as const;

function formatLogValue(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

async function logClosedTripEdits(vehicleTripId: string, userId: string | undefined, before: any, after: any) {
  const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  for (const field of LOGGED_FIELDS) {
    const oldValue = formatLogValue(before[field]);
    const newValue = formatLogValue(after[field]);
    if (oldValue !== newValue) changes.push({ field, oldValue, newValue });
  }
  if (changes.length === 0) return;
  await prisma.vehicleTripEvent.createMany({
    data: changes.map((c) => ({
      vehicleTripId, action: 'manual_edit', field: c.field, oldValue: c.oldValue, newValue: c.newValue, userId: userId ?? null,
    })),
  });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID обязателен' }, { status: 400 });

  await prisma.vehicleTrip.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
