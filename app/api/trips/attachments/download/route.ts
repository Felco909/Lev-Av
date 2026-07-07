export const dynamic = 'force-dynamic';
import path from 'path';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { readStoredAttachmentFile } from '@/lib/attachment-service';

function contentTypeByExt(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.doc') return 'application/msword';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === '.xls') return 'application/vnd.ms-excel';
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.txt') return 'text/plain; charset=utf-8';
  if (ext === '.csv') return 'text/csv; charset=utf-8';
  return 'application/octet-stream';
}

function asciiFileName(name: string): string {
  const cleaned = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_').trim();
  return cleaned || 'file';
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get('attachmentId');
    if (!attachmentId) {
      return NextResponse.json({ error: 'attachmentId обязателен' }, { status: 400 });
    }

    const attachment = await prisma.tripAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) return NextResponse.json({ error: 'Файл не найден' }, { status: 404 });

    const file = await readStoredAttachmentFile(attachment.cloudStoragePath);
    return new NextResponse(file, {
      status: 200,
      headers: {
        'Content-Type': attachment.fileType || contentTypeByExt(attachment.fileName),
        'Content-Disposition': `inline; filename="${asciiFileName(attachment.fileName)}"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return NextResponse.json({ error: 'Файл отсутствует' }, { status: 404 });
    }
    console.error('[attachment-service] trip attachment download error:', error);
    return NextResponse.json({ error: 'Файл отсутствует' }, { status: 404 });
  }
}
