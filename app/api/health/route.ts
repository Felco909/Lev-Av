export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      ok: true,
      database: 'levav_prod_local',
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('GET /api/health', error);
    return NextResponse.json(
      { ok: false, error: 'Сервер или база данных недоступны.' },
      { status: 503 },
    );
  }
}
