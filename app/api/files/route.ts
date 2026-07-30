export const dynamic = 'force-dynamic';
import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { isLocalStoragePath, localFileAbsolutePath } from '@/lib/attachment-service';
import { buildContentDisposition } from '@/lib/content-disposition';

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const storagePath = searchParams.get('path');
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    if (!storagePath || !isLocalStoragePath(storagePath)) {
      return NextResponse.json({ error: 'Некорректный путь файла' }, { status: 400 });
    }

    const absolutePath = localFileAbsolutePath(storagePath);
    if (!absolutePath) return NextResponse.json({ error: 'Некорректный путь файла' }, { status: 400 });

    const fileName = path.basename(absolutePath);
    const file = await fs.readFile(absolutePath);
    return new NextResponse(file, {
      status: 200,
      headers: {
        'Content-Type': contentTypeByExt(fileName),
        'Content-Disposition': buildContentDisposition('inline', fileName),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      console.error('[attachment-service] file missing on disk', storagePath);
      return NextResponse.json({ error: 'Файл отсутствует' }, { status: 404 });
    }
    console.error('[attachment-service] local file read error:', error);
    return NextResponse.json({ error: 'Файл отсутствует' }, { status: 404 });
  }
}

