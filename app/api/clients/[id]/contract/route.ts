export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { saveBufferToStorage, deleteStoredFile } from '@/lib/attachment-service';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Файл не найден' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) return NextResponse.json({ error: 'Пустой файл' }, { status: 400 });

    const existing = await prisma.client.findUnique({ where: { id: params.id }, select: { contractFile: true } });
    if (existing?.contractFile) await deleteStoredFile(existing.contractFile);

    const { cloudStoragePath } = await saveBufferToStorage(file.name, buffer, 'client-contracts');

    await prisma.client.update({
      where: { id: params.id },
      data: { contractFile: cloudStoragePath, contractFileName: file.name },
    });

    return NextResponse.json({ success: true, contractFile: cloudStoragePath, contractFileName: file.name });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка загрузки' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const client = await prisma.client.findUnique({ where: { id: params.id }, select: { contractFile: true } });
    if (client?.contractFile) await deleteStoredFile(client.contractFile);

    await prisma.client.update({
      where: { id: params.id },
      data: { contractFile: null, contractFileName: null },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка удаления' }, { status: 500 });
  }
}
