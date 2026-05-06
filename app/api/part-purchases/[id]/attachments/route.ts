export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getFileUrl, deleteFile } from '@/lib/s3';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });
    const { id } = await params;
    const attachments = await prisma.partAttachment.findMany({
      where: { partPurchaseId: id },
      orderBy: { uploadedAt: 'desc' },
    });
    const withUrls = await Promise.all(
      attachments.map(async (a) => ({
        ...a,
        url: await getFileUrl(a.cloudStoragePath, a.isPublic),
      }))
    );
    return NextResponse.json(withUrls);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const { fileName, fileType, cloudStoragePath, isPublic } = body;
    const att = await prisma.partAttachment.create({
      data: { partPurchaseId: id, fileName, fileType, cloudStoragePath, isPublic: isPublic || false },
    });
    return NextResponse.json(att);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const attId = searchParams.get('attachmentId');
    if (!attId) return NextResponse.json({ error: '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 attachmentId' }, { status: 400 });
    const att = await prisma.partAttachment.findUnique({ where: { id: attId } });
    if (att) {
      try { await deleteFile(att.cloudStoragePath); } catch {}
      await prisma.partAttachment.delete({ where: { id: attId } });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0443\u0434\u0430\u043b\u0435\u043d\u0438\u044f' }, { status: 500 });
  }
}
