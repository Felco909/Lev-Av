export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function PUT(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();
    // Частичное обновление (как в PUT /api/vehicles/[id] и /api/drivers/[id]) — иначе
    // восстановление из архива одним {status:'active'} стёрло бы остальные поля.
    const data: any = {};
    if (body?.name !== undefined) data.name = body.name;
    if (body?.contactPerson !== undefined) data.contactPerson = body.contactPerson || null;
    if (body?.phone !== undefined) data.phone = body.phone || null;
    if (body?.email !== undefined) data.email = body.email || null;
    if (body?.inn !== undefined) data.inn = body.inn || null;
    if (body?.address !== undefined) data.address = body.address || null;
    if (body?.bankDetails !== undefined) data.bankDetails = body.bankDetails || null;
    if (body?.status !== undefined) data.status = body.status;
    const c = await prisma.carrier.update({ where: { id: params?.id }, data });
    return NextResponse.json(c);
  } catch (e: any) {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}

/**
 * DELETE — мягкое удаление (архивирование), та же архитектура, что и у машины/водителя.
 * Физическое удаление перевозчика молча обнуляет Trip.carrierId (ON DELETE SET NULL в БД) —
 * заявки экспедиции задним числом теряют привязку к перевозчику, а вместе с ней и
 * возможность посчитать КЗ/рейтинг перевозчика по прошлым периодам. Архивирование ничего
 * не удаляет: перевозчик скрывается из активных списков (см. GET выше, showArchived) и
 * может быть восстановлен. У Carrier нет собственных VehicleTrip (это только для
 * собственного транспорта) — зависимости считаются через заявки и связанные с ними
 * платежи/расходы.
 */
export async function DELETE(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const carrierId = params?.id;

    const existing = await prisma.carrier.findUnique({ where: { id: carrierId }, select: { id: true, status: true } });
    if (!existing) return NextResponse.json({ error: 'Не найден' }, { status: 404 });
    if (existing.status === 'archived') return NextResponse.json({ success: true, archived: true, message: 'Перевозчик уже в архиве.' });

    const tripIds = (await prisma.trip.findMany({ where: { carrierId }, select: { id: true } })).map((t) => t.id);
    const [trips, payments, expenses] = await Promise.all([
      Promise.resolve(tripIds.length),
      tripIds.length ? prisma.payment.count({ where: { tripId: { in: tripIds }, type: 'carrier' } }) : Promise.resolve(0),
      tripIds.length ? prisma.expense.count({ where: { tripId: { in: tripIds }, description: '__carrier__' } }) : Promise.resolve(0),
    ]);
    const totalDependents = trips + payments + expenses;

    await prisma.carrier.update({ where: { id: carrierId }, data: { status: 'archived' } });

    if (totalDependents > 0) {
      return NextResponse.json({
        success: true,
        archived: true,
        message: `Перевозчик архивирован (не удалён) — сохранена история: заявок ${trips}, платежей ${payments}, расходов ${expenses}.`,
      });
    }
    return NextResponse.json({ success: true, archived: true, message: 'Перевозчик архивирован.' });
  } catch (e: any) {
    console.error('Carrier archive error:', e);
    return NextResponse.json({ error: 'Не удалось архивировать перевозчика' }, { status: 500 });
  }
}
