export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getFileUrl } from '@/lib/s3';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    // Get all clients that have trips
    const clients = await prisma.client.findMany({
      where: { trips: { some: {} } },
      orderBy: { name: 'asc' },
      include: {
        trips: {
          orderBy: { tripDate: 'desc' },
          include: {
            attachments: {
              orderBy: { uploadedAt: 'desc' },
            },
            carrier: { select: { name: true } },
            vehicle: { select: { plateNumber: true, brand: true, model: true } },
            driver: { select: { fullName: true } },
          },
        },
      },
    });

    // Generate download URLs for attachments
    const result = await Promise.all(
      clients.map(async (client) => ({
        ...client,
        trips: await Promise.all(
          client.trips.map(async (trip) => ({
            ...trip,
            clientRate: Number((trip as any).clientRateAmd ?? trip.clientRate ?? 0),
            carrierRate: trip.carrierRate != null ? Number(trip.carrierRate) : null,
            profit: Number((trip as any).profitAmd ?? trip.profit ?? 0),
            attachments: await Promise.all(
              trip.attachments.map(async (att) => ({
                ...att,
                downloadUrl: await getFileUrl(att.cloudStoragePath, att.isPublic),
              }))
            ),
          }))
        ),
      }))
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET documents by client error:', error);
    return NextResponse.json({ error: 'Ошибка загрузки данных' }, { status: 500 });
  }
}
