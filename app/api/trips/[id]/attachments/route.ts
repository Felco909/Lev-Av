export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { enrichTripAttachmentDownload, deleteStoredFile } from '@/lib/attachment-service';

// GET attachments for a trip
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const attachments = await prisma.tripAttachment.findMany({
      where: { tripId: params.id },
      orderBy: { uploadedAt: 'desc' },
    });

    // Generate download URLs
    const withUrls = await Promise.all(
      attachments.map((a) => enrichTripAttachmentDownload(a))
    );

    return NextResponse.json(withUrls);
  } catch (error) {
    console.error('GET attachments error:', error);
    return NextResponse.json({ error: 'Ошибка загрузки файлов' }, { status: 500 });
  }
}

// POST — save attachment record after file upload
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { fileName, fileType, cloudStoragePath, isPublic, description } = await request.json();
    if (!fileName || !cloudStoragePath) {
      return NextResponse.json({ error: 'fileName и cloudStoragePath обязательны' }, { status: 400 });
    }

    // Verify trip exists
    const trip = await prisma.trip.findUnique({ where: { id: params.id } });
    if (!trip) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });

    const attachment = await prisma.tripAttachment.create({
      data: {
        tripId: params.id,
        fileName,
        fileType: fileType || 'application/octet-stream',
        cloudStoragePath,
        isPublic: isPublic ?? false,
        description: description || null,
      },
    });

    return NextResponse.json(attachment);
  } catch (error) {
    console.error('POST attachment error:', error);
    return NextResponse.json({ error: 'Ошибка сохранения файла' }, { status: 500 });
  }
}

// DELETE an attachment
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get('attachmentId');
    if (!attachmentId) return NextResponse.json({ error: 'attachmentId обязателен' }, { status: 400 });

    const attachment = await prisma.tripAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) return NextResponse.json({ error: 'Файл не найден' }, { status: 404 });

    await deleteStoredFile(attachment.cloudStoragePath);
    await prisma.tripAttachment.delete({ where: { id: attachmentId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE attachment error:', error);
    return NextResponse.json({ error: 'Ошибка удаления файла' }, { status: 500 });
  }
}
