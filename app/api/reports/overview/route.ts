export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

function round1(value: number): number {
  return Math.round((Number(value) || 0) * 10) / 10;
}

/**
 * GET /api/reports/overview — данные для вкладки "Обзор" в /reports, которых нет ни в одном
 * существующем API: операционная сводка (текущее состояние машин/заявок, не привязано к
 * периоду отчёта), счётчики "Что изменилось" (простые count() по уже существующим таблицам),
 * перерасход топлива (единственное новое сравнение, см. CLAUDE.md/задачу — factual > avg×1.15)
 * и лента "Последние события" (слияние TripHistory + Payment + VehicleTripEvent, без новой
 * бизнес-логики). Долги/топ-должников/KPI/тренд/автопарк-кратко здесь НЕ дублируются —
 * страница получает их из уже существующих /api/debts, /api/reports/trips, /api/reports/own-fleet.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const changePeriod = searchParams.get('changePeriod') || 'week'; // today | week | month
    const eventsLimit = Math.min(Number(searchParams.get('eventsLimit')) || 15, 50);

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    let periodStart = new Date(todayStart);
    if (changePeriod === 'week') { periodStart = new Date(todayStart); periodStart.setDate(periodStart.getDate() - 7); }
    else if (changePeriod === 'month') { periodStart = new Date(now.getFullYear(), now.getMonth(), 1); }
    // 'today' — periodStart = todayStart (по умолчанию выше)

    // ── Операционная сводка (состояние ПРЯМО СЕЙЧАС, не зависит от фильтра периода отчёта) ──
    const [activeVehicleTrips, totalActiveVehicles, statusGroups, completedToday] = await Promise.all([
      prisma.vehicleTrip.findMany({ where: { status: 'active' }, select: { vehicleId: true }, distinct: ['vehicleId'] }),
      prisma.vehicle.count({ where: { status: 'active' } }),
      prisma.trip.groupBy({ by: ['status'], _count: { _all: true }, where: { NOT: { status: 'cancelled' } } }),
      prisma.trip.count({ where: { status: 'completed', updatedAt: { gte: todayStart } } }),
    ]);
    const vehiclesInTrip = activeVehicleTrips.length;
    const vehiclesFree = Math.max(0, totalActiveVehicles - vehiclesInTrip);
    const tripsByStatus: Record<string, number> = {};
    for (const g of statusGroups) tripsByStatus[g.status] = g._count._all;
    const tripsInProgress = (tripsByStatus['new'] || 0) + (tripsByStatus['in_progress'] || 0) + (tripsByStatus['unloaded'] || 0);

    const operational = {
      vehiclesInTrip,
      vehiclesFree,
      totalActiveVehicles,
      tripsInProgress,
      tripsSverka: tripsByStatus['sverka'] || 0,
      tripsAwaitingPayment: tripsByStatus['awaiting_payment'] || 0,
      completedToday,
    };

    // ── "Что изменилось" — только count(), без новой логики ──
    const [newTrips, completedVehicleTrips, newPayments] = await Promise.all([
      prisma.trip.count({ where: { createdAt: { gte: periodStart } } }),
      prisma.vehicleTripEvent.count({ where: { action: 'closed', createdAt: { gte: periodStart } } }),
      prisma.payment.count({ where: { createdAt: { gte: periodStart } } }),
    ]);
    const changes = { period: changePeriod, newTrips, completedVehicleTrips, newPayments };

    // ── Перерасход топлива — единственное новое вычисление: факт рейса > среднее ПО ЭТОЙ
    // МАШИНЕ × 1.15. "Среднее машины" не хранится отдельным полем — это среднее л/100км по
    // собственной истории рейсов машины (calculatedFuelConsumedL/calculatedKm, уже хранятся
    // и уже используются в Excel-экспорте app/api/reports/trips/xlsx). wialonAvgFuelConsumptionPer100Km
    // на VehicleTrip — метрика ОДНОГО рейса из отчёта Wialon, а не средняя по машине, поэтому
    // для сравнения "рейс vs своя машина" не подходит — считаем агрегат сами, без нового
    // источника данных. Ограничено последними 300 рейсами (across all vehicles) — сигнал
    // "требует внимания сейчас", а не полный исторический аудит топлива (для истории — /fuel
    // и Excel-экспорт).
    const recentVehicleTrips = await prisma.vehicleTrip.findMany({
      where: { calculatedKm: { gt: 0 }, calculatedFuelConsumedL: { not: null } },
      select: {
        id: true, tripNumber: true, vehicleId: true, departureDate: true, calculatedKm: true, calculatedFuelConsumedL: true,
        vehicle: { select: { plateNumber: true } },
      },
      orderBy: { departureDate: 'desc' },
      take: 300,
    });
    const byVehicle = new Map<string, { liters: number; km: number }>();
    for (const vt of recentVehicleTrips) {
      const cur = byVehicle.get(vt.vehicleId) ?? { liters: 0, km: 0 };
      cur.liters += vt.calculatedFuelConsumedL ?? 0;
      cur.km += vt.calculatedKm ?? 0;
      byVehicle.set(vt.vehicleId, cur);
    }
    const vehicleAvgPer100Km = new Map<string, number>();
    for (const [vid, agg] of byVehicle) {
      if (agg.km > 0) vehicleAvgPer100Km.set(vid, (agg.liters / agg.km) * 100);
    }
    const fuelOverconsumption = recentVehicleTrips
      .map((vt) => {
        const avg = vehicleAvgPer100Km.get(vt.vehicleId);
        const km = vt.calculatedKm;
        const liters = vt.calculatedFuelConsumedL;
        if (!avg || avg <= 0 || !km || liters == null) return null;
        const actual = (liters / km) * 100;
        if (actual <= avg * 1.15) return null;
        return {
          vehicleTripId: vt.id, tripNumber: vt.tripNumber, vehiclePlate: vt.vehicle.plateNumber,
          departureDate: vt.departureDate, actualPer100Km: round1(actual), avgPer100Km: round1(avg),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .slice(0, 20);

    // ── Последние события — слияние 3 уже существующих источников, без искусственных событий ──
    const [historyEvents, paymentEvents, closedVtEvents] = await Promise.all([
      prisma.tripHistory.findMany({
        where: { action: { in: ['created', 'status_changed'] } },
        orderBy: { createdAt: 'desc' },
        take: eventsLimit,
        select: {
          id: true, tripId: true, action: true, field: true, oldValue: true, newValue: true, userName: true, createdAt: true,
          trip: { select: { tripNumber: true } },
        },
      }),
      prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: eventsLimit,
        select: { id: true, tripId: true, amountAmd: true, type: true, createdAt: true, trip: { select: { tripNumber: true } } },
      }),
      prisma.vehicleTripEvent.findMany({
        where: { action: 'closed' },
        orderBy: { createdAt: 'desc' },
        take: eventsLimit,
        select: {
          id: true, vehicleTripId: true, createdAt: true,
          vehicleTrip: { select: { tripNumber: true, vehicle: { select: { plateNumber: true } }, driver: { select: { fullName: true } } } },
        },
      }),
    ]);

    const STATUS_LABELS_RU: Record<string, string> = {
      new: 'Новая', in_progress: 'В пути', unloaded: 'Разгружен', awaiting_payment: 'На оплату',
      sverka: 'Сверка', completed: 'Завершён', archived: 'Архив', cancelled: 'Отменена',
    };

    type FeedEvent = { id: string; type: string; at: string; label: string; tripId?: string | null };

    const events: FeedEvent[] = [];
    for (const h of historyEvents) {
      if (h.action === 'created') {
        events.push({ id: `th-${h.id}`, type: 'trip_created', at: h.createdAt.toISOString(), tripId: h.tripId, label: `Заявка создана — ${h.trip?.tripNumber ?? ''}` });
      } else if (h.action === 'status_changed' && h.field === 'status') {
        const from = STATUS_LABELS_RU[h.oldValue ?? ''] ?? h.oldValue ?? '—';
        const to = STATUS_LABELS_RU[h.newValue ?? ''] ?? h.newValue ?? '—';
        events.push({ id: `th-${h.id}`, type: 'status_changed', at: h.createdAt.toISOString(), tripId: h.tripId, label: `Статус изменён: «${from}» → «${to}» — ${h.trip?.tripNumber ?? ''}` });
      }
    }
    for (const p of paymentEvents) {
      const side = p.type === 'carrier' ? 'от перевозчика' : 'от клиента';
      events.push({
        id: `pay-${p.id}`, type: 'payment', at: p.createdAt.toISOString(), tripId: p.tripId,
        label: `Оплата получена (${side}) — ${p.trip?.tripNumber ?? ''}, ${Math.round(Number(p.amountAmd)).toLocaleString('ru-RU')} ֏`,
      });
    }
    for (const c of closedVtEvents) {
      const who = c.vehicleTrip?.driver?.fullName ? `, водитель ${c.vehicleTrip.driver.fullName}` : '';
      events.push({
        id: `vte-${c.id}`, type: 'vehicle_trip_closed', at: c.createdAt.toISOString(),
        label: `Рейс завершён — ${c.vehicleTrip?.vehicle?.plateNumber ?? ''}${who}`,
      });
    }
    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return NextResponse.json({
      operational,
      changes,
      fuelOverconsumption,
      events: events.slice(0, eventsLimit),
      updatedAt: now.toISOString(),
    });
  } catch (e) {
    console.error('Reports overview API error:', e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
