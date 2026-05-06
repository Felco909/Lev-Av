export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const items = await prisma.documentExpiry.findMany({ orderBy: { expiryDate: 'asc' } });
    // Enrich with entity names
    const vehicleIds = [...new Set(items.filter(i => i.entityType === 'vehicle').map(i => i.entityId))];
    const driverIds = [...new Set(items.filter(i => i.entityType === 'driver').map(i => i.entityId))];
    const carrierIds = [...new Set(items.filter(i => i.entityType === 'carrier').map(i => i.entityId))];
    const [vehicles, drivers, carriers] = await Promise.all([
      vehicleIds.length ? prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, plateNumber: true, brand: true, model: true } }) : [],
      driverIds.length ? prisma.driver.findMany({ where: { id: { in: driverIds } }, select: { id: true, fullName: true } }) : [],
      carrierIds.length ? prisma.carrier.findMany({ where: { id: { in: carrierIds } }, select: { id: true, name: true } }) : [],
    ]);
    const nameMap: Record<string, string> = {};
    vehicles.forEach(v => { nameMap[v.id] = `${v.brand} ${v.model} (${v.plateNumber})`; });
    drivers.forEach(d => { nameMap[d.id] = d.fullName; });
    carriers.forEach(c => { nameMap[c.id] = c.name; });
    const enriched = items.map(i => ({ ...i, entityName: nameMap[i.entityId] || 'Неизвестно' }));
    return NextResponse.json(enriched);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();
    const { entityType, entityId, docType, docName, expiryDate, description } = body;
    if (!entityType || !entityId || !docType || !docName || !expiryDate) {
      return NextResponse.json({ error: 'Заполните обязательные поля' }, { status: 400 });
    }
    const item = await prisma.documentExpiry.create({
      data: { entityType, entityId, docType, docName, expiryDate: new Date(expiryDate), description: description || null },
    });
    return NextResponse.json(item);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка создания' }, { status: 500 });
  }
}
