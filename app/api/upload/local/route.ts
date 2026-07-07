export const dynamic = 'force-dynamic';
import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ensureStorageStructure, isUploadsStoragePath, localFileAbsolutePath, verifyStoredAttachmentReadable } from '@/lib/attachment-service';

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const storagePath = searchParams.get('path');
    if (!storagePath || !isUploadsStoragePath(storagePath)) {
      return NextResponse.json({ error: 'Некорректный путь хранения' }, { status: 400 });
    }

    const absolutePath = localFileAbsolutePath(storagePath);
    if (!absolutePath) {
      return NextResponse.json({ error: 'Некорректный путь хранения' }, { status: 400 });
    }

    await ensureStorageStructure();
    const body = await request.arrayBuffer();
    const buffer = Buffer.from(body);
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Пустой файл' }, { status: 400 });
    }

    await fs.writeFile(absolutePath, buffer);
    const readable = await verifyStoredAttachmentReadable(storagePath);
    if (!readable) {
      try { await fs.unlink(absolutePath); } catch {}
      console.error('[attachment-service] upload verification failed', storagePath);
      return NextResponse.json({ error: 'Файл не сохранён на диск' }, { status: 500 });
    }

    return NextResponse.json({ success: true, cloud_storage_path: storagePath, bytes: buffer.length });
  } catch (error) {
    console.error('Local upload error:', error);
    return NextResponse.json({ error: 'Ошибка локальной загрузки' }, { status: 500 });
  }
}

