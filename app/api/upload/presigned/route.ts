export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { generatePresignedUploadUrl } from '@/lib/s3';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { fileName, contentType, isPublic } = await request.json();
    if (!fileName || !contentType) {
      return NextResponse.json({ error: 'fileName и contentType обязательны' }, { status: 400 });
    }

    const result = await generatePresignedUploadUrl(fileName, contentType, isPublic ?? false);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Presigned URL error:', error);
    return NextResponse.json({ error: 'Ошибка генерации URL' }, { status: 500 });
  }
}
