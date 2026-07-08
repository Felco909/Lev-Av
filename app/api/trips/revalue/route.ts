export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { computeTripProfitAmd } from '@/lib/finance/formulas';

// Mass revaluation: update exchange rate for all unpaid trips of a given currency
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();
    const { currency, newRate } = body;
    if (!currency || !newRate) return NextResponse.json({ error: 'Укажите валюту и новый курс' }, { status: 400 });
    if (currency === 'AMD') return NextResponse.json({ error: 'AMD не требует переоценки' }, { status: 400 });
    const rate = Number(newRate);
    if (rate <= 0) return NextResponse.json({ error: 'Курс должен быть > 0' }, { status: 400 });

    // Fetch all non-paid trips for this currency
    const trips = await prisma.trip.findMany({
      where: { currency, status: { notIn: ['paid'] } },
      include: { expenses: true },
    });

    let updated = 0;
    let totalNewDiff = 0;
    for (const t of trips) {
      const clientRate = Number(t.clientRate);
      const carrierRate = t.carrierRate != null ? Number(t.carrierRate) : null;
      const isExp = t.tripType === 'expedition';

      const clientRateAmd = Math.round(clientRate * rate * 100) / 100;
      const carrierRateAmd = carrierRate != null ? Math.round(carrierRate * rate * 100) / 100 : null;

      // Единая формула прибыли (lib/finance/formulas.ts) — одна и та же для
      // own_transport и expedition, расходы разбираются по маркеру __carrier__.
      const profitAmd = computeTripProfitAmd({
        clientRateAmd,
        carrierRateAmd: isExp ? carrierRateAmd : null,
        expenses: t.expenses,
      });
      const origRate = Number(t.originalRate);
      const origClientRateAmd = Math.round(clientRate * origRate * 100) / 100;
      const origCarrierRateAmd = carrierRate != null ? Math.round(carrierRate * origRate * 100) / 100 : null;
      const origProfitAmd = computeTripProfitAmd({
        clientRateAmd: origClientRateAmd,
        carrierRateAmd: isExp ? origCarrierRateAmd : null,
        expenses: t.expenses,
      });
      const exchangeDiff = Math.round((profitAmd - origProfitAmd) * 100) / 100;

      await prisma.trip.update({
        where: { id: t.id },
        data: { exchangeRate: rate, clientRateAmd, carrierRateAmd, profitAmd, exchangeDiff },
      });
      totalNewDiff += exchangeDiff;
      updated++;
    }

    return NextResponse.json({
      updated,
      totalExchangeDiff: Math.round(totalNewDiff * 100) / 100,
      newRate: rate,
      currency,
    });
  } catch (e: any) {
    console.error('Revalue error:', e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
