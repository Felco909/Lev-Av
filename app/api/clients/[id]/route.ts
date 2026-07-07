export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();
    const data: any = {
      name: body?.name,
      contactPerson: body?.contactPerson ?? null,
      phone: body?.phone ?? null,
      email: body?.email ?? null,
      inn: body?.inn ?? null,
      address: body?.address ?? null,
    };
    if (body?.invoicePrefix !== undefined) data.invoicePrefix = body.invoicePrefix;
    if (body?.actPrefix !== undefined) data.actPrefix = body.actPrefix;
    if (body?.numberFormat !== undefined) data.numberFormat = body.numberFormat;
    if (body?.resetNumberingYearly !== undefined) data.resetNumberingYearly = body.resetNumberingYearly;
    if (body?.paymentTermsDays !== undefined) data.paymentTermsDays = body.paymentTermsDays ? parseInt(body.paymentTermsDays) : null;
    const client = await prisma.client.update({
      where: { id: params?.id },
      data,
    });
    return NextResponse.json(client);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    // Check if client has linked trips
    const tripCount = await prisma.trip.count({ where: { clientId: params?.id } });
    if (tripCount > 0) {
      return NextResponse.json(
        { error: `Невозможно удалить клиента — у него ${tripCount} заявок. Сначала удалите или переназначьте заявки.` },
        { status: 409 }
      );
    }

    await prisma.client.delete({ where: { id: params?.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Невозможно удалить' }, { status: 500 });
  }
}
