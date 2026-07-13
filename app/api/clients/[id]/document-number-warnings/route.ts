export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

/** Предупреждения о дубликатах номеров у того же клиента (не блокирует сохранение). */
export async function POST(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const clientId = params.id;
    const body = await req.json().catch(() => ({}));
    const tripId = typeof body.tripId === 'string' ? body.tripId : '';
    const invoiceNumber =
      typeof body.invoiceNumber === 'string' ? body.invoiceNumber.trim() : '';
    const actNumber = typeof body.actNumber === 'string' ? body.actNumber.trim() : '';

    const warnings: { kind: 'invoice' | 'act'; tripNumber: string }[] = [];

    if (invoiceNumber) {
      const dup = await prisma.trip.findFirst({
        where: {
          clientId,
          id: tripId ? { not: tripId } : undefined,
          invoiceDocNumber: invoiceNumber,
        },
        select: { tripNumber: true },
      });
      if (dup) warnings.push({ kind: 'invoice', tripNumber: dup.tripNumber });
    }

    if (actNumber) {
      const dup = await prisma.trip.findFirst({
        where: {
          clientId,
          id: tripId ? { not: tripId } : undefined,
          actDocNumber: actNumber,
        },
        select: { tripNumber: true },
      });
      if (dup) warnings.push({ kind: 'act', tripNumber: dup.tripNumber });
    }

    return NextResponse.json({ warnings });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка проверки' }, { status: 500 });
  }
}
