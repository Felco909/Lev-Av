export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { roundMoney } from '@/lib/finance/formulas';
import { getTripSplitExpenseTotalsAmd } from '@/lib/finance/finance-metrics-service';
import { computeVehicleTripExpensesAmd } from '@/lib/vehicle-trips/close-trip';
import { getVehicleTripsIncomeAmdBulk } from '@/lib/finance/own-fleet-income';
import { getClientDebtRows, getCarrierDebtRows, sumDebt } from '@/lib/finance/debts-service';
import { dedupeCashGapTotal } from '@/lib/finance/cash-gap-dedup';
import { getOperationalSummary, getIdleVehicles, getStuckVehicleTrips } from '@/lib/dashboard/operational-summary';
import { getVehicleActivityStatus } from '@/lib/wialon/status';

/**
 * GET /api/day-tasks — единый агрегатор для «Лист дня» (Daily Workspace). Заменяет прежние
 * 4 клиентских fetch (dashboard/debts/finance-audit/trips) одним серверным проходом. Ни одна
 * финансовая формула не переизобретается — везде вызываются уже существующие канонические
 * функции (formulas.ts, debts-service.ts, own-fleet-income.ts, close-trip.ts,
 * operational-summary.ts, wialon/status.ts), как и на Dashboard/Долгах/Отчётах. Задачи —
 * ВЫЧИСЛЯЕМЫЕ на лету из текущего состояния Trip/VehicleTrip (см. аудит §8, вариант A):
 * ничего не хранится отдельно, "выполнено" по факту означает, что реальные данные заявки
 * изменились и условие категории перестало выполняться.
 */

type Priority = 'normal' | 'attention' | 'urgent' | 'overdue';

interface TripTask {
  id: string;
  tripId: string;
  tripNumber: string;
  route: string;
  clientName: string | null;
  carrierName: string | null;
  vehiclePlate: string | null;
  driverName: string | null;
  status: string;
  nextAction: string;
  dueAt: string | null;
  priority: Priority;
  gpsStatus: 'moving' | 'stopped' | 'no_signal' | null;
  clientPhone: string | null;
  driverPhone: string | null;
  amountAmd: number | null;
}

function ymd(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function todayYmd(): string {
  return ymd(new Date())!;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim().toLowerCase();

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const today = todayYmd();

    // ── Один проход по активным/открытым заявкам со всеми связями, нужными карточке ──
    const trips = await prisma.trip.findMany({
      where: { status: { in: ['new', 'in_progress', 'unloaded', 'awaiting_payment', 'sverka'] } },
      select: {
        id: true, tripNumber: true, tripType: true, status: true,
        routeFrom: true, routeTo: true, tripDate: true, unloadDate: true,
        paymentDueDate: true, carrierPaymentDate: true,
        clientRateAmd: true, clientRate: true, carrierRateAmd: true, carrierRate: true,
        clientPaymentStatus: true, carrierPaymentStatus: true,
        clientPaidAmountAmd: true, carrierPaidAmountAmd: true,
        invoiceDocNumber: true, actDocNumber: true,
        client: { select: { id: true, name: true, phone: true } },
        carrier: { select: { id: true, name: true } },
        vehicle: { select: { id: true, plateNumber: true } },
        driver: { select: { id: true, fullName: true, phone: true } },
        vehicleTrip: { select: { id: true, geofenceStatusAt: true, status: true } },
        expenses: { select: { amountAmd: true, amount: true, description: true } },
        attachments: { select: { id: true }, take: 1 },
        history: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, action: true } },
      },
      orderBy: { tripDate: 'desc' },
    });

    const searchMatch = (t: (typeof trips)[number]): boolean => {
      if (!q) return true;
      const haystack = [
        t.tripNumber, t.routeFrom, t.routeTo,
        t.client?.name, t.carrier?.name, t.vehicle?.plateNumber, t.driver?.fullName,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    };

    // ── GPS-статус по последнему известному "сердцебиению" Wialon (geofenceStatusAt,
    // обновляется фоновой задачей раз в 5 мин) — без живого обращения к Wialon API на
    // каждый заход на страницу (см. аудит §5: "не дублировать запросы"). ──
    const gpsStatusByTripId = new Map<string, 'moving' | 'stopped' | 'no_signal'>();
    for (const t of trips) {
      if (t.vehicleTrip?.status === 'active') {
        gpsStatusByTripId.set(t.id, getVehicleActivityStatus(null, t.vehicleTrip.geofenceStatusAt));
      }
    }

    function buildTask(t: (typeof trips)[number], nextAction: string, priority: Priority, dueAt: string | null, amountAmd: number | null = null): TripTask {
      const split = getTripSplitExpenseTotalsAmd(t as any);
      const clientRateAmd = Number(t.clientRateAmd ?? t.clientRate ?? 0) + split.clientExtraAmd;
      return {
        id: `${t.id}-${nextAction}`,
        tripId: t.id,
        tripNumber: t.tripNumber,
        route: `${t.routeFrom ?? ''} → ${t.routeTo ?? ''}`,
        clientName: t.client?.name ?? null,
        carrierName: t.carrier?.name ?? null,
        vehiclePlate: t.vehicle?.plateNumber ?? null,
        driverName: t.driver?.fullName ?? null,
        status: t.status,
        nextAction,
        dueAt,
        priority,
        gpsStatus: gpsStatusByTripId.get(t.id) ?? null,
        clientPhone: t.client?.phone ?? null,
        driverPhone: t.driver?.phone ?? null,
        amountAmd: amountAmd ?? (nextAction.startsWith('Выставить') || nextAction.startsWith('Ожидается') ? roundMoney(clientRateAmd) : null),
      };
    }

    // ═══════════════════════ ЛОГИСТ ═══════════════════════
    const filtered = trips.filter(searchMatch);

    const urgentProblems: TripTask[] = [];
    const loadingsToday: TripTask[] = [];
    const unloadingsToday: TripTask[] = [];
    const needCall: TripTask[] = [];
    const needStatusUpdate: TripTask[] = [];
    const overdueActions: TripTask[] = [];
    const missingDocs: TripTask[] = [];
    const gpsAttention: TripTask[] = [];

    for (const t of filtered) {
      const tripDateYmd = ymd(t.tripDate);
      const unloadDateYmd = ymd(t.unloadDate);
      const gps = gpsStatusByTripId.get(t.id);
      const lastHistoryAt = t.history[0]?.createdAt ?? null;
      const hoursSinceHistory = lastHistoryAt ? (now.getTime() - new Date(lastHistoryAt).getTime()) / 3_600_000 : Infinity;

      const isOverdueDeparture = t.status === 'new' && tripDateYmd !== null && tripDateYmd < today;
      const isOverdueUnload = t.status === 'in_progress' && unloadDateYmd !== null && unloadDateYmd < today;
      const isGpsDown = gps === 'no_signal';

      if (isOverdueDeparture || isOverdueUnload) {
        overdueActions.push(buildTask(
          t,
          isOverdueDeparture ? 'Просрочено отправление' : 'Просрочена разгрузка',
          'overdue',
          isOverdueDeparture ? tripDateYmd : unloadDateYmd
        ));
      }
      if (isOverdueDeparture || isOverdueUnload || isGpsDown) {
        urgentProblems.push(buildTask(
          t,
          isGpsDown ? 'Нет связи с машиной' : (isOverdueDeparture ? 'Просрочено отправление' : 'Просрочена разгрузка'),
          'overdue',
          isGpsDown ? null : (isOverdueDeparture ? tripDateYmd : unloadDateYmd)
        ));
      }
      if (isGpsDown) {
        gpsAttention.push(buildTask(t, 'Нет сигнала GPS', 'urgent', null));
      }
      if (tripDateYmd === today && (t.status === 'new' || t.status === 'in_progress')) {
        loadingsToday.push(buildTask(t, 'Подтвердить загрузку', 'urgent', tripDateYmd));
      }
      if (unloadDateYmd === today) {
        unloadingsToday.push(buildTask(t, 'Подтвердить разгрузку', 'urgent', unloadDateYmd));
      }
      if (t.status === 'in_progress' && hoursSinceHistory > 24) {
        needCall.push(buildTask(t, 'Связаться с водителем', 'attention', null));
      }
      if (t.status === 'new' && tripDateYmd !== null && tripDateYmd <= today) {
        needStatusUpdate.push(buildTask(t, 'Обновить статус — пора выезжать', 'attention', tripDateYmd));
      }
      if (t.status === 'unloaded' && (!t.invoiceDocNumber || !t.actDocNumber || t.attachments.length === 0)) {
        missingDocs.push(buildTask(t, 'Собрать документы', 'attention', null));
      }
    }

    const logist = [
      { category: 'Срочные проблемы', icon: 'alert-triangle', count: urgentProblems.length, items: urgentProblems },
      { category: 'Загрузки сегодня', icon: 'truck', count: loadingsToday.length, items: loadingsToday },
      { category: 'Разгрузки сегодня', icon: 'package', count: unloadingsToday.length, items: unloadingsToday },
      { category: 'Требуется связаться', icon: 'phone', count: needCall.length, items: needCall },
      { category: 'Требуется обновить статус', icon: 'map-pin', count: needStatusUpdate.length, items: needStatusUpdate },
      { category: 'Просроченные действия', icon: 'alert-circle', count: overdueActions.length, items: overdueActions },
      { category: 'Отсутствуют документы', icon: 'file-x', count: missingDocs.length, items: missingDocs },
      { category: 'GPS/Wialon требует внимания', icon: 'satellite', count: gpsAttention.length, items: gpsAttention },
    ];

    // ═══════════════════════ БУХГАЛТЕР ═══════════════════════
    const [clientDebtRows, carrierDebtRows] = await Promise.all([
      getClientDebtRows(prisma, todayStart),
      getCarrierDebtRows(prisma, todayStart),
    ]);
    const clientDebtByTripId = new Map(clientDebtRows.map((r) => [r.id, r]));
    const carrierDebtByTripId = new Map(carrierDebtRows.map((r) => [r.id, r]));

    const getDocs: TripTask[] = [];
    const checkDocs: TripTask[] = [];
    const issueInvoice: TripTask[] = [];
    const awaitingPayment: TripTask[] = [];
    const overduePayments: TripTask[] = [];
    const noInvoice: TripTask[] = [];
    const noAct: TripTask[] = [];
    const noClosingDocs: TripTask[] = [];
    const financialErrors: TripTask[] = [];

    for (const t of filtered) {
      const hasAttachments = t.attachments.length > 0;
      const hasInvoice = !!t.invoiceDocNumber;
      const hasAct = !!t.actDocNumber;
      const clientDebt = clientDebtByTripId.get(t.id);
      const carrierDebt = carrierDebtByTripId.get(t.id);

      if (t.status === 'unloaded' && !hasAttachments) {
        getDocs.push(buildTask(t, 'Получить документы от водителя', 'attention', null));
      }
      if (t.status === 'unloaded' && hasAttachments && (!hasInvoice || !hasAct)) {
        checkDocs.push(buildTask(t, 'Проверить полученные документы', 'attention', null));
      }
      if ((t.status === 'unloaded' || t.status === 'awaiting_payment') && !hasInvoice) {
        issueInvoice.push(buildTask(t, 'Выставить счёт клиенту', 'urgent', null, clientDebt?.remaining ?? null));
      }
      if (clientDebt && !clientDebt.isOverdue) {
        awaitingPayment.push(buildTask(t, 'Ожидается оплата от клиента', clientDebt.isUrgent ? 'urgent' : 'normal', clientDebt.paymentDueDate, clientDebt.remaining));
      }
      if (clientDebt?.isOverdue) {
        overduePayments.push(buildTask(t, 'Просрочена оплата клиента', 'overdue', clientDebt.paymentDueDate, clientDebt.remaining));
      }
      if (carrierDebt?.isOverdue) {
        overduePayments.push(buildTask(t, 'Просрочена оплата перевозчику', 'overdue', carrierDebt.paymentDueDate, carrierDebt.remaining));
      }
      if (!hasInvoice && t.status !== 'new') {
        noInvoice.push(buildTask(t, 'Нет счёта', 'attention', null));
      }
      if (!hasAct && t.status !== 'new') {
        noAct.push(buildTask(t, 'Нет акта', 'attention', null));
      }
      if (!hasInvoice && !hasAct && ['unloaded', 'awaiting_payment', 'sverka'].includes(t.status)) {
        noClosingDocs.push(buildTask(t, 'Нет закрывающих документов', 'urgent', null));
      }
    }

    const accountant = [
      { stage: 'Получить документы', count: getDocs.length, items: getDocs },
      { stage: 'Проверить документы', count: checkDocs.length, items: checkDocs },
      { stage: 'Выставить счёт', count: issueInvoice.length, items: issueInvoice },
      { stage: 'Ожидается оплата', count: awaitingPayment.length, items: awaitingPayment },
      { stage: 'Просроченные оплаты', count: overduePayments.length, items: overduePayments },
      { stage: 'Нет счёта', count: noInvoice.length, items: noInvoice },
      { stage: 'Нет акта', count: noAct.length, items: noAct },
      { stage: 'Нет закрывающих документов', count: noClosingDocs.length, items: noClosingDocs },
      { stage: 'Финансовые ошибки', count: financialErrors.length, items: financialErrors },
    ];

    // ═══════════════════════ ДИРЕКТОР ═══════════════════════
    // Доход/расход/прибыль — за текущий месяц (та же граница периода, что Dashboard
    // применяет по умолчанию); долги/кассовый разрыв — текущий остаток без ограничения
    // периода (та же логика, что /debts — долг не привязан к дате рейса).
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [operational, idleVehicles, stuckVehicleTrips, allExpeditionTrips, allVehicleTrips] = await Promise.all([
      getOperationalSummary(prisma, todayStart),
      getIdleVehicles(prisma, 5),
      getStuckVehicleTrips(prisma, 14),
      prisma.trip.findMany({
        where: { tripType: 'expedition', NOT: { status: 'cancelled' }, tripDate: { gte: monthStart, lte: monthEnd } },
        select: { clientRateAmd: true, clientRate: true, carrierRateAmd: true, carrierRate: true, expenses: { select: { amountAmd: true, amount: true, description: true } } },
      }),
      prisma.vehicleTrip.findMany({
        where: { departureDate: { gte: monthStart, lte: monthEnd } },
        select: {
          id: true, salaryAmd: true, perDiemAmd: true, perDiem2Amd: true, perDiem3Amd: true, perDiem4Amd: true,
          otherExpensesAmd: true, fuelCostAmd: true, fleetExpenses: { select: { amountAmd: true } },
        },
      }),
    ]);

    const ownFleetIncomeByVt = await getVehicleTripsIncomeAmdBulk(allVehicleTrips.map((vt) => vt.id));
    const ownFleetIncomeAmd = allVehicleTrips.reduce((s, vt) => s + (ownFleetIncomeByVt.get(vt.id) ?? 0), 0);
    const ownFleetExpenseAmd = allVehicleTrips.reduce((s, vt) => s + computeVehicleTripExpensesAmd(vt), 0);

    let expeditionIncomeAmd = 0;
    let expeditionExpenseAmd = 0;
    for (const t of allExpeditionTrips) {
      const split = getTripSplitExpenseTotalsAmd(t as any);
      expeditionIncomeAmd += Number(t.clientRateAmd ?? t.clientRate ?? 0) + split.clientExtraAmd;
      expeditionExpenseAmd += Number(t.carrierRateAmd ?? t.carrierRate ?? 0) + split.carrierExtraAmd;
    }

    const totalClientDebtAmd = sumDebt(clientDebtRows);
    const totalCarrierDebtAmd = sumDebt(carrierDebtRows);
    // Единая дедуп-функция (lib/finance/cash-gap-dedup.ts, покрыта тестами) — та же,
    // что теперь и в /api/dashboard, и в /api/trips/stats (колокольчик). Раньше здесь
    // была локальная копия этого цикла (аудит 01.08.2026, п.4).
    const totalCashGapAmd = dedupeCashGapTotal([...clientDebtRows, ...carrierDebtRows]);

    const lossyTrips = filtered.filter((t) => {
      const split = getTripSplitExpenseTotalsAmd(t as any);
      const clientAmd = Number(t.clientRateAmd ?? t.clientRate ?? 0) + split.clientExtraAmd;
      const carrierAmd = Number(t.carrierRateAmd ?? t.carrierRate ?? 0) + split.carrierExtraAmd;
      return clientAmd - carrierAmd < 0;
    });

    const criticalEventsCount = urgentProblems.length + overdueActions.length + gpsAttention.length + stuckVehicleTrips.length;

    const attention: { key: string; label: string; count: number; amountAmd: number | null; href: string }[] = [
      { key: 'overduePayments', label: 'Просроченные оплаты', count: overduePayments.length, amountAmd: roundMoney(overduePayments.reduce((s, i) => s + (i.amountAmd ?? 0), 0)), href: '/debts' },
      { key: 'lossyTrips', label: 'Убыточные рейсы', count: lossyTrips.length, amountAmd: null, href: '/reports' },
      { key: 'gps', label: 'Проблемы с GPS', count: gpsAttention.length, amountAmd: null, href: '/telematics' },
      { key: 'stuck', label: 'Задержки (рейсы открыты > 14 дней)', count: stuckVehicleTrips.length, amountAmd: null, href: '/vehicle-trips' },
      { key: 'idle', label: 'Машины простаивают > 5 дней', count: idleVehicles.length, amountAmd: null, href: '/vehicles' },
      { key: 'cashGap', label: 'Кассовый разрыв', count: totalCashGapAmd > 0 ? 1 : 0, amountAmd: totalCashGapAmd, href: '/debts' },
    ].filter((a) => a.count > 0);

    const director = {
      kpi: {
        incomeAmd: roundMoney(ownFleetIncomeAmd + expeditionIncomeAmd),
        expenseAmd: roundMoney(ownFleetExpenseAmd + expeditionExpenseAmd),
        profitAmd: roundMoney(ownFleetIncomeAmd - ownFleetExpenseAmd + (expeditionIncomeAmd - expeditionExpenseAmd)),
        clientDebtAmd: totalClientDebtAmd,
        carrierDebtAmd: totalCarrierDebtAmd,
        cashGapAmd: totalCashGapAmd,
        vehiclesOnTrip: operational.vehiclesInTrip,
        vehiclesFree: operational.vehiclesFree,
        totalActiveVehicles: operational.totalActiveVehicles,
        criticalEventsCount,
      },
      attention,
    };

    // ═══════════════════════ SUMMARY ═══════════════════════
    const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(now);
    const tasksTodayCount = loadingsToday.length + unloadingsToday.length;
    const overdueTasksCount = overdueActions.length + overduePayments.length;

    return NextResponse.json({
      summary: {
        date: today,
        weekday,
        activeTripsCount: operational.tripsInProgress,
        tasksTodayCount,
        overdueTasksCount,
        criticalEventsCount,
        lastUpdated: now.toISOString(),
      },
      logist,
      accountant,
      director,
    });
  } catch (error) {
    console.error('Day tasks API error:', error);
    return NextResponse.json({ error: 'Ошибка загрузки листа дня' }, { status: 500 });
  }
}
