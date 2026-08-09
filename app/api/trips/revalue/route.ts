export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { computeTripProfitAmd } from '@/lib/finance/formulas';
import { assertRole, CRITICAL_FINANCE_FIELDS_ROLES } from '@/lib/auth/role-guard';

// Mass revaluation: update exchange rate for all unpaid trips of a given currency
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const guard = assertRole(session, CRITICAL_FINANCE_FIELDS_ROLES, 'массовая переоценка курса заявок');
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const body = await req.json();
    const { currency, newRate } = body;
    if (!currency || !newRate) return NextResponse.json({ error: 'Укажите валюту и новый курс' }, { status: 400 });
    if (currency === 'AMD') return NextResponse.json({ error: 'AMD не требует переоценки' }, { status: 400 });
    const rate = Number(newRate);
    if (rate <= 0) return NextResponse.json({ error: 'Курс должен быть > 0' }, { status: 400 });

    // Fetch all non-paid, non-closed trips for this currency — завершённые/архивные
    // заявки защищены от изменения финансов той же логикой, что и в PUT/PATCH
    // /api/trips/[id] (см. lib/trip-workflow-guards.ts, TMS-AUDIT-0016); bulk-переоценка
    // не должна быть обходным путём мимо этой защиты.
    const trips = await prisma.trip.findMany({
      where: { currency, status: { notIn: ['paid', 'completed', 'archived'] } },
      include: { expenses: true },
    });

    let updated = 0;
    let totalNewDiff = 0;
    for (const t of trips) {
      const clientRate = Number(t.clientRate);
      const carrierRate = t.carrierRate != null ? Number(t.carrierRate) : null;
      const isExp = t.tripType === 'expedition';
      // Ставка перевозчика пересчитывается ЭТИМ курсом только если у перевозчика та же
      // валюта, что и переоцениваемая — иначе курс клиента был бы ошибочно применён к
      // сумме в другой валюте (TMS-AUDIT-0002). Если валюты разные — carrierRateAmd/
      // carrierExchangeRate остаются как были.
      const carrierCurrency = t.carrierCurrency || t.currency;
      const carrierMatchesRevalued = carrierCurrency === currency;

      const clientRateAmd = Math.round(clientRate * rate * 100) / 100;
      const carrierRateAmd = carrierRate != null
        ? (carrierMatchesRevalued ? Math.round(carrierRate * rate * 100) / 100 : Number(t.carrierRateAmd ?? 0))
        : null;
      const carrierExchangeRate = carrierMatchesRevalued
        ? rate
        : Number(t.carrierExchangeRate ?? t.exchangeRate ?? 1);

      // Единая формула прибыли (lib/finance/formulas.ts) — одна и та же для
      // own_transport и expedition, расходы разбираются по маркеру __carrier__.
      const profitAmd = computeTripProfitAmd({
        clientRateAmd,
        carrierRateAmd: isExp ? carrierRateAmd : null,
        expenses: t.expenses,
      });
      const origRate = Number(t.originalRate);
      const origClientRateAmd = Math.round(clientRate * origRate * 100) / 100;
      // Исторический курс перевозчика для расчёта "было" — если валюты разные, это
      // всегда его собственный текущий курс (он не переоценивается), не курс клиента.
      const origCarrierRate = carrierMatchesRevalued ? origRate : Number(t.carrierExchangeRate ?? t.exchangeRate ?? 1);
      const origCarrierRateAmd = carrierRate != null ? Math.round(carrierRate * origCarrierRate * 100) / 100 : null;
      const origProfitAmd = computeTripProfitAmd({
        clientRateAmd: origClientRateAmd,
        carrierRateAmd: isExp ? origCarrierRateAmd : null,
        expenses: t.expenses,
      });
      const exchangeDiff = Math.round((profitAmd - origProfitAmd) * 100) / 100;

      await prisma.trip.update({
        where: { id: t.id },
        data: { exchangeRate: rate, clientRateAmd, carrierRateAmd, carrierExchangeRate, profitAmd, exchangeDiff },
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
