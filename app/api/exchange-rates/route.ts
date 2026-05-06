export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

// Daily exchange rates stored as a Setting with key 'exchange_rates'
// Format: JSON { "USD": 387.5, "EUR": 420.0, "RUB": 4.2, "GEL": 140.0 }

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const setting = await prisma.setting.findUnique({ where: { key: 'exchange_rates' } });
    const rates = setting?.value ? JSON.parse(setting.value) : { USD: 0, EUR: 0, RUB: 0, GEL: 0 };
    return NextResponse.json(rates);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ USD: 0, EUR: 0, RUB: 0, GEL: 0 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();
    // body = { USD: 387.5, EUR: 420.0, RUB: 4.2, GEL: 140.0 }
    const rates: Record<string, number> = {};
    for (const [k, v] of Object.entries(body)) {
      if (typeof v === 'number' || typeof v === 'string') rates[k] = Number(v) || 0;
    }
    await prisma.setting.upsert({
      where: { key: 'exchange_rates' },
      create: { key: 'exchange_rates', value: JSON.stringify(rates) },
      update: { value: JSON.stringify(rates) },
    });
    return NextResponse.json(rates);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
