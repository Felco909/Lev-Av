export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get('vehicleId');
    const year = Number(searchParams.get('year') || new Date().getFullYear());
    const month = searchParams.get('month') ? Number(searchParams.get('month')) : null; // 1-12 or null for whole year

    // Build date range
    let dateFrom: Date;
    let dateTo: Date;
    if (month) {
      dateFrom = new Date(year, month - 1, 1);
      dateTo = new Date(year, month, 0, 23, 59, 59);
    } else {
      dateFrom = new Date(year, 0, 1);
      dateTo = new Date(year, 11, 31, 23, 59, 59);
    }

    const dateFilter = { gte: dateFrom, lte: dateTo };
    const vFilter = vehicleId ? { vehicleId } : {};

    // Fetch all 4 expense sources in parallel
    const [fuelRecords, maintenances, serviceRecords, partPurchases, vehicles] = await Promise.all([
      prisma.fuelRecord.findMany({
        where: { ...vFilter, date: dateFilter },
        select: { vehicleId: true, date: true, cost: true, liters: true },
      }),
      prisma.maintenance.findMany({
        where: { ...vFilter, date: dateFilter },
        select: { vehicleId: true, date: true, cost: true, type: true },
      }),
      prisma.serviceRecord.findMany({
        where: { ...vFilter, date: dateFilter },
        select: { vehicleId: true, date: true, cost: true },
      }),
      prisma.partPurchase.findMany({
        where: { ...vFilter, date: dateFilter },
        select: { vehicleId: true, date: true, totalAmount: true },
      }),
      prisma.vehicle.findMany({
        where: vehicleId ? { id: vehicleId } : { status: 'active' },
        select: { id: true, plateNumber: true, brand: true, model: true },
        orderBy: { brand: 'asc' },
      }),
    ]);

    // Build per-vehicle, per-month aggregation
    type MonthKey = string; // "YYYY-MM"
    interface VehicleData {
      vehicle: { id: string; plateNumber: string; brand: string; model: string };
      months: Record<MonthKey, { fuel: number; maintenance: number; service: number; parts: number; total: number; fuelLiters: number }>;
      totals: { fuel: number; maintenance: number; service: number; parts: number; total: number; fuelLiters: number };
    }

    const vehicleMap: Record<string, VehicleData> = {};
    for (const v of vehicles) {
      vehicleMap[v.id] = {
        vehicle: v,
        months: {},
        totals: { fuel: 0, maintenance: 0, service: 0, parts: 0, total: 0, fuelLiters: 0 },
      };
    }

    const ensureMonth = (vid: string, d: Date) => {
      if (!vehicleMap[vid]) return null;
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!vehicleMap[vid].months[mk]) {
        vehicleMap[vid].months[mk] = { fuel: 0, maintenance: 0, service: 0, parts: 0, total: 0, fuelLiters: 0 };
      }
      return vehicleMap[vid].months[mk];
    };

    // Fuel
    for (const r of fuelRecords) {
      const m = ensureMonth(r.vehicleId, new Date(r.date));
      if (!m) continue;
      const cost = Number(r.cost);
      const liters = Number(r.liters);
      m.fuel += cost;
      m.total += cost;
      m.fuelLiters += liters;
      vehicleMap[r.vehicleId].totals.fuel += cost;
      vehicleMap[r.vehicleId].totals.total += cost;
      vehicleMap[r.vehicleId].totals.fuelLiters += liters;
    }

    // Maintenance (old model)
    for (const r of maintenances) {
      const m = ensureMonth(r.vehicleId, new Date(r.date));
      if (!m) continue;
      const cost = Number(r.cost);
      m.maintenance += cost;
      m.total += cost;
      vehicleMap[r.vehicleId].totals.maintenance += cost;
      vehicleMap[r.vehicleId].totals.total += cost;
    }

    // Service records
    for (const r of serviceRecords) {
      const m = ensureMonth(r.vehicleId, new Date(r.date));
      if (!m) continue;
      const cost = Number(r.cost);
      m.service += cost;
      m.total += cost;
      vehicleMap[r.vehicleId].totals.service += cost;
      vehicleMap[r.vehicleId].totals.total += cost;
    }

    // Part purchases
    for (const r of partPurchases) {
      const m = ensureMonth(r.vehicleId, new Date(r.date));
      if (!m) continue;
      const cost = Number(r.totalAmount);
      m.parts += cost;
      m.total += cost;
      vehicleMap[r.vehicleId].totals.parts += cost;
      vehicleMap[r.vehicleId].totals.total += cost;
    }

    // Build response
    const data = Object.values(vehicleMap)
      .filter(v => v.totals.total > 0 || vehicleId)
      .sort((a, b) => b.totals.total - a.totals.total);

    // Grand totals
    const grandTotals = { fuel: 0, maintenance: 0, service: 0, parts: 0, total: 0, fuelLiters: 0 };
    for (const v of data) {
      grandTotals.fuel += v.totals.fuel;
      grandTotals.maintenance += v.totals.maintenance;
      grandTotals.service += v.totals.service;
      grandTotals.parts += v.totals.parts;
      grandTotals.total += v.totals.total;
      grandTotals.fuelLiters += v.totals.fuelLiters;
    }

    // Generate month keys for the period
    const monthKeys: string[] = [];
    if (month) {
      monthKeys.push(`${year}-${String(month).padStart(2, '0')}`);
    } else {
      for (let m = 1; m <= 12; m++) {
        monthKeys.push(`${year}-${String(m).padStart(2, '0')}`);
      }
    }

    return NextResponse.json({ vehicles: data, grandTotals, monthKeys, year, month });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430' }, { status: 500 });
  }
}
