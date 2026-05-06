export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getFileUrl } from '@/lib/s3';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get('vehicleId');
    const supplierId = searchParams.get('supplierId');
    const paymentStatus = searchParams.get('paymentStatus');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const where: any = {};
    if (vehicleId) where.vehicleId = vehicleId;
    if (supplierId) where.supplierId = supplierId;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const items = await prisma.partPurchase.findMany({
      where,
      include: {
        vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
        supplier: { select: { id: true, name: true } },
        payments: { orderBy: { paymentDate: 'desc' } },
        attachments: true,
      },
      orderBy: { date: 'desc' },
    });

    // Generate signed URLs for attachments
    const itemsWithUrls = await Promise.all(items.map(async (item) => ({
      ...item,
      attachments: await Promise.all(item.attachments.map(async (att) => ({
        ...att,
        url: await getFileUrl(att.cloudStoragePath, att.isPublic).catch(() => ''),
      }))),
    })));

    return NextResponse.json(itemsWithUrls);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });
    const body = await req.json();
    const { vehicleId, supplierId, date, partName, quantity, unitPrice, notes } = body;
    if (!vehicleId || !date || !partName) {
      return NextResponse.json({ error: '\u0417\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u043b\u044f' }, { status: 400 });
    }
    const qty = Number(quantity) || 1;
    const price = Number(unitPrice) || 0;
    const total = qty * price;
    const item = await prisma.partPurchase.create({
      data: {
        vehicleId,
        supplierId: supplierId || null,
        date: new Date(date),
        partName,
        quantity: qty,
        unitPrice: price,
        totalAmount: total,
        paidAmount: 0,
        paymentStatus: 'unpaid',
        notes: notes || null,
      },
      include: {
        vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
        supplier: { select: { id: true, name: true } },
        payments: true,
        attachments: true,
      },
    });
    return NextResponse.json(item);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u044f' }, { status: 500 });
  }
}
