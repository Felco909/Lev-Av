import { prisma } from '@/lib/prisma';
import { computeVehicleTripExpensesAmd } from '@/lib/vehicle-trips/close-trip';

export interface MatchedTrip {
  id: string;
  tripNumber: string;
  routeFrom: string;
  routeTo: string;
  tripDate: Date;
  clientRateAmd: number;
  clientName: string | null;
}

/** Сырая заявка для пакетного (in-memory) сопоставления — см. matchTripsInRange. */
export interface TripSourceRow {
  id: string;
  tripNumber: string;
  routeFrom: string;
  routeTo: string;
  tripDate: Date;
  clientRateAmd: unknown;
  clientRate: unknown;
  vehicleId: string | null;
  client: { name: string } | null;
}

function toMatchedTrip(t: TripSourceRow): MatchedTrip {
  return {
    id: t.id, tripNumber: t.tripNumber, routeFrom: t.routeFrom, routeTo: t.routeTo, tripDate: t.tripDate,
    clientRateAmd: Number(t.clientRateAmd || t.clientRate || 0),
    clientName: t.client?.name ?? null,
  };
}

/**
 * Живой подбор заявок этого автомобиля, чья дата попадает в диапазон рейса
 * [from, to] — НЕ использует Trip.vehicleTripId (это поле нигде не заполнялось, см. чат).
 * Пока рейс активен — вызывается с to=сейчас, доход всегда актуален. При закрытии рейса
 * (lib/vehicle-trips/close-trip.ts) этот же набор "фиксируется" простановкой vehicleTripId
 * на найденных заявках — дальше для закрытого рейса используются уже сохранённые
 * finalRevenueAmd/finalExpensesAmd, а не повторный live-подбор.
 *
 * Один DB-запрос на вызов — годится для одиночного рейса (карточка/close/recalculate-income).
 * Для массовых расчётов (экономика машины, аналитика по всему парку) грузите заявки один раз
 * через prisma.trip.findMany и используйте matchTripsInRange (in-memory, без N+1 запросов).
 */
export async function findMatchingTrips(vehicleId: string, from: Date, to: Date): Promise<MatchedTrip[]> {
  const trips = await prisma.trip.findMany({
    where: { vehicleId, tripDate: { gte: from, lte: to } },
    select: {
      id: true, tripNumber: true, routeFrom: true, routeTo: true, tripDate: true,
      clientRateAmd: true, clientRate: true, vehicleId: true,
      client: { select: { name: true } },
    },
    orderBy: { tripDate: 'asc' },
  });
  return trips.map(toMatchedTrip);
}

/** То же сопоставление, что и findMatchingTrips, но по уже загруженному в память списку заявок
 *  (без похода в БД) — для расчётов по многим рейсам/машинам сразу. */
export function matchTripsInRange(allTrips: TripSourceRow[], vehicleId: string, from: Date, to: Date): MatchedTrip[] {
  return allTrips
    .filter((t) => t.vehicleId === vehicleId && t.tripDate >= from && t.tripDate <= to)
    .sort((a, b) => a.tripDate.getTime() - b.tripDate.getTime())
    .map(toMatchedTrip);
}

export function sumRevenueAmd(matched: MatchedTrip[]): number {
  return matched.reduce((s, t) => s + t.clientRateAmd, 0);
}

export interface VehicleTripFinancials {
  revenue: number;
  totalExpenses: number;
  profit: number;
  isFrozen: boolean;
}

interface VehicleTripLike {
  finalRevenueAmd: unknown;
  finalExpensesAmd: unknown;
  salaryAmd: unknown;
  perDiemAmd: unknown;
  perDiem2Amd: unknown;
  perDiem3Amd: unknown;
  otherExpensesAmd: unknown;
  fuelCostAmd: unknown;
  fleetExpenses: Array<{ amountAmd: unknown }>;
}

/**
 * ЕДИНЫЙ источник дохода/расходов/прибыли рейса машины — используется карточкой рейса
 * (app/api/vehicle-trips/[id]), экономикой машины (app/api/vehicles/[id]/economics) и
 * аналитикой (app/api/vehicle-analytics). Раньше каждое из этих мест считало доход своей
 * копией одной и той же (сломанной — vt.trips всегда пуст) формулы — отсюда расхождения
 * "аналитика не видит доход". Закрытый рейс — замороженные finalRevenueAmd/finalExpensesAmd,
 * НЕ пересчитываются даже если matchedTrips изменился бы. Активный — live по matchedTrips.
 */
export function computeVehicleTripFinancials(vt: VehicleTripLike, matchedTrips: MatchedTrip[]): VehicleTripFinancials {
  const isFrozen = vt.finalRevenueAmd != null;
  const revenue = isFrozen ? Number(vt.finalRevenueAmd) : sumRevenueAmd(matchedTrips);
  const totalExpenses = isFrozen ? Number(vt.finalExpensesAmd) : computeVehicleTripExpensesAmd(vt);
  return { revenue, totalExpenses, profit: revenue - totalExpenses, isFrozen };
}
