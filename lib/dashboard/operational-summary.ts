import type { PrismaClient } from '@prisma/client';

/**
 * Операционная сводка "прямо сейчас" (не зависит от фильтра периода отчёта) — единственный
 * источник для statusbar/Dashboard и вкладки "Обзор" в /reports. Раньше этот же набор
 * запросов был инлайн только внутри app/api/reports/overview/route.ts; вынесено сюда, чтобы
 * Dashboard (Enterprise Command Center v3) не заводил вторую независимую копию тех же
 * простых count()/groupBy() запросов — единственный источник истины по этим цифрам.
 */
export interface OperationalSummary {
  vehiclesInTrip: number;
  vehiclesFree: number;
  totalActiveVehicles: number;
  tripsInProgress: number;
  tripsSverka: number;
  tripsAwaitingPayment: number;
  completedToday: number;
}

export async function getOperationalSummary(prisma: PrismaClient, todayStart: Date): Promise<OperationalSummary> {
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

  return {
    vehiclesInTrip,
    vehiclesFree,
    totalActiveVehicles,
    tripsInProgress,
    tripsSverka: tripsByStatus['sverka'] || 0,
    tripsAwaitingPayment: tripsByStatus['awaiting_payment'] || 0,
    completedToday,
  };
}

/**
 * Машины, простаивающие без рейса дольше порога (по умолчанию 5 дней) — сравнение уже
 * хранимых дат (последний VehicleTrip.departureDate по машине vs "сейчас"), не новая формула.
 */
export interface IdleVehicle {
  vehicleId: string;
  plateNumber: string;
  daysIdle: number;
}

export async function getIdleVehicles(prisma: PrismaClient, thresholdDays = 5): Promise<IdleVehicle[]> {
  const vehicles = await prisma.vehicle.findMany({
    where: { status: 'active' },
    select: {
      id: true, plateNumber: true,
      vehicleTrips: { orderBy: { departureDate: 'desc' }, take: 1, select: { departureDate: true, status: true } },
    },
  });
  const now = Date.now();
  const out: IdleVehicle[] = [];
  for (const v of vehicles) {
    const last = v.vehicleTrips[0];
    if (last?.status === 'active') continue; // машина сейчас в рейсе — не простой
    const lastDate = last?.departureDate ?? null;
    const daysIdle = lastDate ? Math.floor((now - new Date(lastDate).getTime()) / 86400000) : null;
    if (daysIdle != null && daysIdle >= thresholdDays) {
      out.push({ vehicleId: v.id, plateNumber: v.plateNumber, daysIdle });
    }
  }
  return out.sort((a, b) => b.daysIdle - a.daysIdle);
}

/**
 * Рейсы машин, открытые (status='active') аномально долго — сравнение уже хранимой даты
 * выезда с порогом (по умолчанию 14 дней), не новая формула расчёта рейса.
 */
export interface StuckVehicleTrip {
  vehicleTripId: string;
  plateNumber: string;
  tripNumber: string;
  daysOpen: number;
}

export async function getStuckVehicleTrips(prisma: PrismaClient, thresholdDays = 14): Promise<StuckVehicleTrip[]> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - thresholdDays);
  const stuck = await prisma.vehicleTrip.findMany({
    where: { status: 'active', departureDate: { lte: threshold } },
    select: { id: true, tripNumber: true, departureDate: true, vehicle: { select: { plateNumber: true } } },
    orderBy: { departureDate: 'asc' },
  });
  const now = Date.now();
  return stuck.map((vt) => ({
    vehicleTripId: vt.id,
    plateNumber: vt.vehicle.plateNumber,
    tripNumber: vt.tripNumber,
    daysOpen: Math.floor((now - new Date(vt.departureDate).getTime()) / 86400000),
  }));
}
