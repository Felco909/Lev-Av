export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041D\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D' }, { status: 401 });
    const contacts = await prisma.clientContact.findMany({
      where: { clientId: params.id },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(contacts);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041E\u0448\u0438\u0431\u043A\u0430' }, { status: 500 });
  }
}

export async function POST(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041D\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D' }, { status: 401 });
    const body = await req.json();
    if (!body?.name) return NextResponse.json({ error: '\u0418\u043C\u044F \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E' }, { status: 400 });
    const contact = await prisma.clientContact.create({
      data: {
        clientId: params.id,
        name: body.name,
        phone: body.phone || null,
        email: body.email || null,
      },
    });
    return NextResponse.json(contact);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041E\u0448\u0438\u0431\u043A\u0430' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041D\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D' }, { status: 401 });
    const body = await req.json();
    if (!body?.id || !body?.name) return NextResponse.json({ error: '\u0418\u043C\u044F \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E' }, { status: 400 });
    const contact = await prisma.clientContact.update({
      where: { id: body.id },
      data: {
        name: body.name,
        phone: body.phone || null,
        email: body.email || null,
      },
    });
    return NextResponse.json(contact);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041E\u0448\u0438\u0431\u043A\u0430' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041D\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get('contactId');
    if (!contactId) return NextResponse.json({ error: '\u041D\u0435\u0442 ID' }, { status: 400 });
    await prisma.clientContact.delete({ where: { id: contactId } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041D\u0435\u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E \u0443\u0434\u0430\u043B\u0438\u0442\u044C' }, { status: 500 });
  }
}
