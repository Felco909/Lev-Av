export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

// Computes maintenance status for each vehicle+regulation pair
// Returns: { vehicles: [{ vehicle, statuses: [{ regulation, lastRecord, nextMileage, nextDate, status }], overallStatus }] }
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const vehicles = await prisma.vehicle.findMany({
      where: { status: 'active' },
      orderBy: { brand: 'asc' },
    });
    const regulations = await prisma.serviceRegulation.findMany({ orderBy: { name: 'asc' } });
    const records = await prisma.serviceRecord.findMany({
      orderBy: { date: 'desc' },
    });

    const today = new Date();

    const result = vehicles.map(vehicle => {
      const vehicleRecords = records.filter(r => r.vehicleId === vehicle.id);
      const statuses = regulations.map(reg => {
        const recsForReg = vehicleRecords.filter(r => r.regulationId === reg.id);
        const lastRecord = recsForReg.length > 0 ? recsForReg[0] : null; // already sorted desc

        let nextMileage: number | null = null;
        let nextDate: string | null = null;
        let status: 'green' | 'yellow' | 'red' = 'green';

        if (!lastRecord) {
          // Never serviced - red if vehicle has mileage
          status = vehicle.currentMileage ? 'red' : 'yellow';
        } else {
          if (reg.mileageInterval && lastRecord.mileage) {
            nextMileage = lastRecord.mileage + reg.mileageInterval;
          }
          if (reg.monthsInterval && lastRecord.date) {
            const d = new Date(lastRecord.date);
            d.setMonth(d.getMonth() + reg.monthsInterval);
            nextDate = d.toISOString();
          }

          // Check mileage status
          if (nextMileage !== null && vehicle.currentMileage) {
            const remaining = nextMileage - vehicle.currentMileage;
            const threshold = reg.mileageInterval ? reg.mileageInterval * 0.1 : 1000;
            if (remaining <= 0) status = 'red';
            else if (remaining <= threshold) status = 'yellow';
          }

          // Check date status
          if (nextDate) {
            const nd = new Date(nextDate);
            const daysUntil = Math.floor((nd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntil <= 0 && status !== 'red') status = 'red';
            else if (daysUntil <= 30 && status === 'green') status = 'yellow';
          }
        }

        return {
          regulation: { id: reg.id, name: reg.name, mileageInterval: reg.mileageInterval, monthsInterval: reg.monthsInterval },
          lastRecord: lastRecord ? { id: lastRecord.id, date: lastRecord.date, mileage: lastRecord.mileage, cost: lastRecord.cost } : null,
          nextMileage,
          nextDate,
          status,
        };
      });

      // Overall status = worst status among all regulations
      let overallStatus: 'green' | 'yellow' | 'red' = 'green';
      for (const s of statuses) {
        if (s.status === 'red') { overallStatus = 'red'; break; }
        if (s.status === 'yellow') overallStatus = 'yellow';
      }

      return {
        vehicle: { id: vehicle.id, plateNumber: vehicle.plateNumber, brand: vehicle.brand, model: vehicle.model, currentMileage: vehicle.currentMileage },
        statuses,
        overallStatus,
      };
    });

    return NextResponse.json({ vehicles: result, regulations });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
