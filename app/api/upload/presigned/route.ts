export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { createUploadTarget } from '@/lib/attachment-service';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { fileName, contentType, storageCategory } = await request.json();
    if (!fileName || !contentType) {
      return NextResponse.json({ error: 'fileName и contentType обязательны' }, { status: 400 });
    }

    const result = await createUploadTarget(fileName, storageCategory);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Upload target error:', error);
    return NextResponse.json({ error: 'Ошибка подготовки загрузки' }, { status: 500 });
  }
}
