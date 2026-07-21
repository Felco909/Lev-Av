export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { getZones, WialonApiError } from '@/lib/wialon/client';

/** GET — все геозоны Wialon-аккаунта, с уже назначенной ролью (если есть). */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  try {
    const [zones, roles] = await Promise.all([getZones(), prisma.wialonZoneRole.findMany()]);
    const roleByZoneId = new Map(roles.map((r) => [r.wialonZoneId, r.role]));

    const result = zones.map((z) => ({
      id: z.id,
      name: z.name,
      type: z.type,
      role: roleByZoneId.get(String(z.id)) ?? null,
    }));

    return NextResponse.json({ zones: result });
  } catch (e: any) {
    if (e instanceof WialonApiError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error('[api/wialon/zones] Ошибка:', e);
    return NextResponse.json({ error: e?.message ?? 'Неизвестная ошибка' }, { status: 500 });
  }
}
