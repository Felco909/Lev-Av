export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { deleteFile } from '@/lib/s3';

// GET all templates
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const templates = await prisma.documentTemplate.findMany({
      orderBy: { uploadedAt: 'desc' },
    });
    return NextResponse.json(templates);
  } catch (error) {
    console.error('GET templates error:', error);
    return NextResponse.json({ error: 'Ошибка загрузки шаблонов' }, { status: 500 });
  }
}

// POST — save/update a template record after file upload
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { documentType, fileName, cloudStoragePath, isPublic } = await request.json();
    if (!documentType || !fileName || !cloudStoragePath) {
      return NextResponse.json({ error: 'Все поля обязательны' }, { status: 400 });
    }

    // Delete old file if replacing
    const existing = await prisma.documentTemplate.findUnique({ where: { documentType } });
    if (existing) {
      try { await deleteFile(existing.cloudStoragePath); } catch (e) { /* ignore */ }
    }

    const template = await prisma.documentTemplate.upsert({
      where: { documentType },
      update: { fileName, cloudStoragePath, isPublic: isPublic ?? false, uploadedAt: new Date() },
      create: { documentType, fileName, cloudStoragePath, isPublic: isPublic ?? false },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error('POST template error:', error);
    return NextResponse.json({ error: 'Ошибка сохранения шаблона' }, { status: 500 });
  }
}

// DELETE a template
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const documentType = searchParams.get('documentType');
    if (!documentType) return NextResponse.json({ error: 'documentType обязателен' }, { status: 400 });

    const existing = await prisma.documentTemplate.findUnique({ where: { documentType } });
    if (!existing) return NextResponse.json({ error: 'Шаблон не найден' }, { status: 404 });

    try { await deleteFile(existing.cloudStoragePath); } catch (e) { /* ignore */ }
    await prisma.documentTemplate.delete({ where: { documentType } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE template error:', error);
    return NextResponse.json({ error: 'Ошибка удаления шаблона' }, { status: 500 });
  }
}
