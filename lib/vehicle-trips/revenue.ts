import { prisma } from '@/lib/prisma';

export interface MatchedTrip {
  id: string;
  tripNumber: string;
  routeFrom: string;
  routeTo: string;
  tripDate: Date;
  clientRateAmd: number;
  clientName: string | null;
}

/**
 * Живой подбор заявок этого автомобиля, чья дата попадает в диапазон рейса
 * [from, to] — НЕ использует Trip.vehicleTripId (это поле нигде не заполнялось, см. чат).
 * Пока рейс активен — вызывается с to=сейчас, доход всегда актуален. При закрытии рейса
 * (lib/vehicle-trips/close-trip.ts) этот же набор "фиксируется" простановкой vehicleTripId
 * на найденных заявках — дальше для закрытого рейса используются уже сохранённые
 * finalRevenueAmd/finalExpensesAmd, а не повторный live-подбор.
 */
export async function findMatchingTrips(vehicleId: string, from: Date, to: Date): Promise<MatchedTrip[]> {
  const trips = await prisma.trip.findMany({
    where: { vehicleId, tripDate: { gte: from, lte: to } },
    select: {
      id: true, tripNumber: true, routeFrom: true, routeTo: true, tripDate: true,
      clientRateAmd: true, clientRate: true,
      client: { select: { name: true } },
    },
    orderBy: { tripDate: 'asc' },
  });
  return trips.map((t) => ({
    id: t.id,
    tripNumber: t.tripNumber,
    routeFrom: t.routeFrom,
    routeTo: t.routeTo,
    tripDate: t.tripDate,
    clientRateAmd: Number(t.clientRateAmd || t.clientRate || 0),
    clientName: t.client?.name ?? null,
  }));
}

export function sumRevenueAmd(matched: MatchedTrip[]): number {
  return matched.reduce((s, t) => s + t.clientRateAmd, 0);
}
