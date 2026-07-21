export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { assertRole, WIALON_CONFIG_ROLES } from '@/lib/auth/role-guard';
import { prisma } from '@/lib/prisma';

const VALID_ROLES = ['garage', 'loading', 'unloading'] as const;

/** PUT — назначить/снять роль геозоны (гараж/погрузка/выгрузка). Конфигурация парка —
 *  тот же уровень доступа, что и настройка подключения Wialon (Этап 1). */
export async function PUT(req: NextRequest, { params: paramsPromise }: { params: Promise<{ zoneId: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  const guard = assertRole(session, WIALON_CONFIG_ROLES, 'назначение роли геозоны');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await req.json().catch(() => null);
  const zoneName = typeof body?.zoneName === 'string' ? body.zoneName : '';
  const role = body?.role;

  if (role !== null && !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `Роль должна быть одной из: ${VALID_ROLES.join(', ')}, либо null` }, { status: 400 });
  }

  if (role === null) {
    await prisma.wialonZoneRole.deleteMany({ where: { wialonZoneId: params.zoneId } });
    return NextResponse.json({ success: true });
  }

  await prisma.wialonZoneRole.upsert({
    where: { wialonZoneId: params.zoneId },
    update: { role, zoneName },
    create: { wialonZoneId: params.zoneId, zoneName, role },
  });

  return NextResponse.json({ success: true });
}
