import type { PrismaClient } from '@prisma/client';

/**
 * Алерты о простое машин в рейсе (аудит ТМС 05.09.2026, 🟠 "Wialon dwell-алерты") — только
 * чтение колонок, которые пишет lib/wialon/dwellCheck.ts; в Wialon при открытии страниц не
 * ходим. Единый источник для колокольчика (/api/trips/stats), Command Center (/api/dashboard)
 * и /problem-trips — пороги меняются только здесь.
 *
 * Пороги согласованы с пользователем 25.09.2026: ночной отдых водителя (9–11 ч) не должен
 * давать жёлтый алерт, поэтому 🟡 начинается с 12 ч.
 */
export const DWELL_THRESHOLDS_HOURS = { info: 4, warning: 12, critical: 24 } as const;
export const NO_SIGNAL_THRESHOLD_HOURS = 2;
export const DWELL_CHECK_HEARTBEAT_KEY = 'wialon_dwell_check_at';

/** Same as STALE_MS in lib/wialon/status.ts: older last message = "нет связи". */
const SIGNAL_STALE_MS = 30 * 60 * 1000;
/** Tracking job runs every 5 min; allow a few missed runs before suppressing alerts. */
const HEARTBEAT_STALE_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export type DwellSeverity = 'critical' | 'warning' | 'info';

export interface DwellClassification {
  kind: 'dwell' | 'no_signal';
  hours: number;
  since: Date;
  severity: DwellSeverity;
}

export interface DwellAlert {
  vehicleId: string;
  plateNumber: string;
  vehicleTripId: string;
  tripNumber: string;
  kind: 'dwell' | 'no_signal';
  hours: number;
  since: string;
  severity: DwellSeverity;
  href: string;
}

/** Pure classification for one vehicle already known to be in an active trip and away from base. */
export function classifyDwell(
  v: { lastMovingAt: Date | null; lastGpsMessageAt: Date | null },
  now: Date,
): DwellClassification | null {
  if (!v.lastGpsMessageAt) return null;

  const silentMs = now.getTime() - v.lastGpsMessageAt.getTime();
  if (silentMs > SIGNAL_STALE_MS) {
    const hours = Math.floor(silentMs / HOUR_MS);
    if (hours < NO_SIGNAL_THRESHOLD_HOURS) return null;
    return { kind: 'no_signal', hours, since: v.lastGpsMessageAt, severity: 'warning' };
  }

  if (!v.lastMovingAt) return null;
  const hours = Math.floor((now.getTime() - v.lastMovingAt.getTime()) / HOUR_MS);
  const severity: DwellSeverity | null =
    hours >= DWELL_THRESHOLDS_HOURS.critical ? 'critical'
    : hours >= DWELL_THRESHOLDS_HOURS.warning ? 'warning'
    : hours >= DWELL_THRESHOLDS_HOURS.info ? 'info'
    : null;
  return severity ? { kind: 'dwell', hours, since: v.lastMovingAt, severity } : null;
}

/** "6 ч", "1 дн. 3 ч" — for the bell / dashboard / problem-trips rows. */
export function formatDwellHours(hours: number): string {
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest > 0 ? `${days} дн. ${rest} ч` : `${days} дн.`;
}

export function dwellAlertLabel(a: Pick<DwellAlert, 'kind' | 'hours'>): string {
  return a.kind === 'no_signal' ? `нет связи ${formatDwellHours(a.hours)}` : `стоит ${formatDwellHours(a.hours)}`;
}

const SEVERITY_ORDER: Record<DwellSeverity, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Scope (согласовано 25.09.2026): только активные тягачи с активным рейсом машины и вне базы
 * компании. Стоянка на базе или без рейса — не простой в смысле этого алерта.
 */
export async function getDwellAlerts(prisma: PrismaClient, now: Date = new Date()): Promise<DwellAlert[]> {
  const heartbeat = await prisma.setting.findUnique({ where: { key: DWELL_CHECK_HEARTBEAT_KEY } });
  const heartbeatAt = heartbeat ? new Date(heartbeat.value) : null;
  if (!heartbeatAt || Number.isNaN(heartbeatAt.getTime()) || now.getTime() - heartbeatAt.getTime() > HEARTBEAT_STALE_MS) {
    return [];
  }

  const vehicles = await prisma.vehicle.findMany({
    where: {
      status: 'active',
      kind: 'tractor',
      atBase: false,
      wialonUnitId: { not: null },
      vehicleTrips: { some: { status: 'active' } },
    },
    select: {
      id: true, plateNumber: true, lastMovingAt: true, lastGpsMessageAt: true,
      vehicleTrips: { where: { status: 'active' }, orderBy: { departureDate: 'asc' }, take: 1, select: { id: true, tripNumber: true } },
    },
  });

  const alerts: DwellAlert[] = [];
  for (const v of vehicles) {
    const trip = v.vehicleTrips[0];
    const c = classifyDwell(v, now);
    if (!trip || !c) continue;
    alerts.push({
      vehicleId: v.id,
      plateNumber: v.plateNumber,
      vehicleTripId: trip.id,
      tripNumber: trip.tripNumber,
      kind: c.kind,
      hours: c.hours,
      since: c.since.toISOString(),
      severity: c.severity,
      href: `/vehicles/${v.id}?tab=telematics`,
    });
  }
  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.hours - a.hours);
}
