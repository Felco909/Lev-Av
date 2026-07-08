export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { deleteStoredFile } from '@/lib/attachment-service';

// GET client templates info
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041D\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D' }, { status: 401 });
    const client = await prisma.client.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        invoiceTemplatePath: true,
        invoiceTemplateName: true,
        actTemplatePath: true,
        actTemplateName: true,
      },
    });
    if (!client) return NextResponse.json({ error: '\u041A\u043B\u0438\u0435\u043D\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D' }, { status: 404 });
    return NextResponse.json(client);
  } catch (e: any) {
    console.error('GET client templates error:', e);
    return NextResponse.json({ error: '\u041E\u0448\u0438\u0431\u043A\u0430' }, { status: 500 });
  }
}

// POST — save template for client
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041D\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D' }, { status: 401 });
    const { templateType, fileName, cloudStoragePath } = await req.json();
    if (!templateType || !fileName || !cloudStoragePath) {
      return NextResponse.json({ error: '\u0412\u0441\u0435 \u043F\u043E\u043B\u044F \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B' }, { status: 400 });
    }
    if (!['invoice', 'act'].includes(templateType)) {
      return NextResponse.json({ error: '\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0442\u0438\u043F \u0448\u0430\u0431\u043B\u043E\u043D\u0430' }, { status: 400 });
    }

    const client = await prisma.client.findUnique({ where: { id: params.id } });
    if (!client) return NextResponse.json({ error: '\u041A\u043B\u0438\u0435\u043D\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D' }, { status: 404 });

    // Delete old file if replacing
    const oldPath = templateType === 'invoice' ? client.invoiceTemplatePath : client.actTemplatePath;
    if (oldPath) {
      try { await deleteStoredFile(oldPath); } catch { /* ignore */ }
    }

    const data = templateType === 'invoice'
      ? { invoiceTemplatePath: cloudStoragePath, invoiceTemplateName: fileName }
      : { actTemplatePath: cloudStoragePath, actTemplateName: fileName };

    const updated = await prisma.client.update({ where: { id: params.id }, data });
    return NextResponse.json(updated);
  } catch (e: any) {
    console.error('POST client template error:', e);
    return NextResponse.json({ error: '\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F' }, { status: 500 });
  }
}

// DELETE — remove a template from client
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041D\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const templateType = searchParams.get('templateType');
    if (!templateType || !['invoice', 'act'].includes(templateType)) {
      return NextResponse.json({ error: '\u0423\u043A\u0430\u0436\u0438\u0442\u0435 templateType' }, { status: 400 });
    }

    const client = await prisma.client.findUnique({ where: { id: params.id } });
    if (!client) return NextResponse.json({ error: '\u041A\u043B\u0438\u0435\u043D\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D' }, { status: 404 });

    const oldPath = templateType === 'invoice' ? client.invoiceTemplatePath : client.actTemplatePath;
    if (oldPath) {
      try { await deleteStoredFile(oldPath); } catch { /* ignore */ }
    }

    const data = templateType === 'invoice'
      ? { invoiceTemplatePath: null, invoiceTemplateName: null }
      : { actTemplatePath: null, actTemplateName: null };

    await prisma.client.update({ where: { id: params.id }, data });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('DELETE client template error:', e);
    return NextResponse.json({ error: '\u041E\u0448\u0438\u0431\u043A\u0430 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u044F' }, { status: 500 });
  }
}
