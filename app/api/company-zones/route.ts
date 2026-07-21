export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { assertRole, WIALON_CONFIG_ROLES } from '@/lib/auth/role-guard';
import { prisma } from '@/lib/prisma';

/**
 * CRUD зон TMS (сейчас — только "база компании", kind="base"). Замена Wialon-геозонам
 * (Этап 7 пересмотрен) — см. lib/company-base/baseCheck.ts.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const zones = await prisma.companyZone.findMany({ orderBy: { createdAt: 'asc' } });
  return NextResponse.json(zones);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const guard = assertRole(session, WIALON_CONFIG_ROLES, 'настройка базы компании');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await req.json();
  const { name, lat, lon, radiusMeters } = body;
  if (!name || typeof lat !== 'number' || typeof lon !== 'number' || !radiusMeters) {
    return NextResponse.json({ error: 'Нужны name, lat, lon, radiusMeters' }, { status: 400 });
  }

  const zone = await prisma.companyZone.create({
    data: { name, kind: 'base', lat, lon, radiusMeters: Math.round(radiusMeters) },
  });
  return NextResponse.json(zone);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const guard = assertRole(session, WIALON_CONFIG_ROLES, 'настройка базы компании');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await req.json();
  const { id, name, lat, lon, radiusMeters, isActive } = body;
  if (!id) return NextResponse.json({ error: 'ID обязателен' }, { status: 400 });

  const data: any = {};
  if (name !== undefined) data.name = name;
  if (lat !== undefined) data.lat = lat;
  if (lon !== undefined) data.lon = lon;
  if (radiusMeters !== undefined) data.radiusMeters = Math.round(radiusMeters);
  if (isActive !== undefined) data.isActive = isActive;

  const zone = await prisma.companyZone.update({ where: { id }, data });
  return NextResponse.json(zone);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const guard = assertRole(session, WIALON_CONFIG_ROLES, 'настройка базы компании');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID обязателен' }, { status: 400 });

  await prisma.companyZone.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
