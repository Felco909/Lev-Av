export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { calculateMaintenanceStatus, type MaintenanceStatusLevel } from '@/lib/maintenance/calculateStatus';

/** 'ok'/'soon'/'overdue' (lib/maintenance/calculateStatus.ts) -> цвета, которые уже ждёт фронтенд. */
const STATUS_TO_COLOR: Record<MaintenanceStatusLevel, 'green' | 'yellow' | 'red'> = {
  ok: 'green',
  soon: 'yellow',
  overdue: 'red',
};

// Computes maintenance status for each vehicle+regulation pair (regulation scoped by
// vehicleModel — см. ServiceRegulation.vehicleModel; null = общий регламент для всех моделей).
// Расчёт вынесен в lib/maintenance/calculateStatus.ts (единый порог 15% на обеих осях).
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
    // Только плановые записи (isUnscheduled=false) участвуют в расчёте "когда следующее ТО" —
    // внеплановые ремонты (regulationId=null) физически не могут совпасть ни с одним reg.id.
    const records = await prisma.serviceRecord.findMany({
      orderBy: { date: 'desc' },
    });

    const result = vehicles.map(vehicle => {
      const vehicleRecords = records.filter(r => r.vehicleId === vehicle.id);
      const regsForVehicle = regulations.filter(
        reg => reg.vehicleModel === null || reg.vehicleModel === vehicle.model
      );

      const statuses = regsForVehicle.map(reg => {
        const recsForReg = vehicleRecords.filter(r => r.regulationId === reg.id);
        const lastRecord = recsForReg.length > 0 ? recsForReg[0] : null; // already sorted desc

        const calc = calculateMaintenanceStatus({
          currentMileage: vehicle.currentMileage,
          lastServiceMileage: lastRecord?.mileage ?? null,
          lastServiceDate: lastRecord?.date ?? null,
          mileageInterval: reg.mileageInterval,
          monthsInterval: reg.monthsInterval,
        });

        return {
          regulation: { id: reg.id, name: reg.name, vehicleModel: reg.vehicleModel, mileageInterval: reg.mileageInterval, monthsInterval: reg.monthsInterval },
          lastRecord: lastRecord ? { id: lastRecord.id, date: lastRecord.date, mileage: lastRecord.mileage, cost: lastRecord.cost } : null,
          nextMileage: calc.nextMileage,
          nextDate: calc.nextDate ? calc.nextDate.toISOString() : null,
          remainingKm: calc.remainingKm,
          remainingDays: calc.remainingDays,
          status: STATUS_TO_COLOR[calc.status],
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
