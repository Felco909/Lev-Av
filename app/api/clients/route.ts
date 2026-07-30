export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { assertRole, CLIENT_GLOBAL_DOC_NUMBERING_ROLES, diffClientDocNumberingFields } from '@/lib/auth/role-guard';

/** Значения по умолчанию для нумерации — форма всегда прогружает их даже для нового
 *  клиента, поэтому "изменение" при создании — это отличие от ЭТИХ дефолтов, а не от
 *  какой-то существующей записи (её ещё нет). См. clients/[id]/route.ts PUT. */
const CLIENT_DOC_NUMBERING_DEFAULTS = {
  invoicePrefix: 'СЧ',
  actPrefix: 'АКТ',
  numberFormat: '{prefix}-{number}',
  resetNumberingYearly: false,
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const clients = await prisma.client.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { trips: true } }, contacts: { orderBy: { name: 'asc' } } } });
    return NextResponse.json(clients ?? []);
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
    if (!body?.name) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 });

    const changedNumberingFields = diffClientDocNumberingFields(CLIENT_DOC_NUMBERING_DEFAULTS, body ?? {});
    if (changedNumberingFields.length > 0) {
      const guard = assertRole(session, CLIENT_GLOBAL_DOC_NUMBERING_ROLES, 'установка нумерации счетов/актов при создании клиента');
      if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const client = await prisma.client.create({
      data: {
        name: body.name,
        contactPerson: body?.contactPerson ?? null,
        phone: body?.phone ?? null,
        email: body?.email ?? null,
        inn: body?.inn ?? null,
        address: body?.address ?? null,
        invoicePrefix: body?.invoicePrefix || '\u0421\u0427',
        actPrefix: body?.actPrefix || '\u0410\u041A\u0422',
        numberFormat: body?.numberFormat || '{prefix}-{number}',
        resetNumberingYearly: body?.resetNumberingYearly ?? false,
        paymentTermsDays: body?.paymentTermsDays ? parseInt(body.paymentTermsDays) : null,
      },
    });
    return NextResponse.json(client);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
