const { PrismaClient } = require('@prisma/client');

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function classifyReason(field, oldValue, canonicalValue, trip) {
  if (field === 'clientPaidAmd' || field === 'carrierPaidAmd') {
    return 'payment aggregate mismatch (Trip snapshot differs from Payment facts)';
  }
  if (field === 'clientPaymentStatus' || field === 'carrierPaymentStatus') {
    return 'legacy payment status mismatch against canonical status formula';
  }
  if (field === 'profitAmd') {
    return trip.tripType === 'expedition'
      ? 'legacy expedition profit differs from canonical formula (client-carrier-expenses)'
      : 'legacy own-transport profit differs from canonical formula (client-expenses)';
  }
  if (field === 'clientDebtAmd' || field === 'carrierDebtAmd') {
    return 'debt mismatch from legacy paid aggregates vs Payment-based canonical values';
  }
  if (field === 'cashGapAmd') {
    return 'cash-gap mismatch from legacy paid aggregates vs Payment-based canonical values';
  }
  return 'canonical vs legacy mismatch';
}

async function main() {
  const prisma = new PrismaClient();
  const limit = 50;
  try {
    const trips = await prisma.trip.findMany({
      include: {
        expenses: { select: { amountAmd: true, amount: true } },
      },
      orderBy: { tripDate: 'desc' },
      take: limit,
    });

    const paymentsDb = await prisma.payment.findMany({
      where: { tripId: { in: trips.map((t) => t.id) } },
      select: { tripId: true, type: true, amountAmd: true, paymentDate: true },
    });
    const payments = paymentsDb.map((p) => ({
      tripId: p.tripId,
      type: p.type,
      amountAmd: Number(p.amountAmd || 0),
      paymentDate: p.paymentDate,
    }));

    const discrepancies = [];

    for (const t of trips) {
      const input = {
        tripId: t.id,
        tripNumber: t.tripNumber,
        tripType: t.tripType,
        status: t.status,
        clientRateAmd: Number(t.clientRateAmd ?? t.clientRate ?? 0),
        carrierRateAmd: Number(t.carrierRateAmd ?? t.carrierRate ?? 0),
        expensesAmd: (t.expenses || []).reduce((s, e) => s + Number(e.amountAmd ?? e.amount ?? 0), 0),
        clientDueDate: t.paymentDueDate ?? null,
        carrierDueDate: t.carrierPaymentDate ?? null,
      };
      const clientPaidAmd = round2(
        payments
          .filter((p) => p.tripId === t.id && p.type === 'client')
          .reduce((s, p) => s + Number(p.amountAmd || 0), 0)
      );
      const carrierPaidAmd = round2(
        payments
          .filter((p) => p.tripId === t.id && p.type === 'carrier')
          .reduce((s, p) => s + Number(p.amountAmd || 0), 0)
      );
      const canonical = {
        clientPaidAmd,
        carrierPaidAmd,
        clientDebtAmd: round2(Math.max(0, input.clientRateAmd - clientPaidAmd)),
        carrierDebtAmd: round2(Math.max(0, input.carrierRateAmd - carrierPaidAmd)),
        clientPaymentStatus:
          clientPaidAmd <= 0 ? 'not_paid' : clientPaidAmd >= input.clientRateAmd ? 'paid' : 'partially_paid',
        carrierPaymentStatus:
          carrierPaidAmd <= 0 ? 'not_paid' : carrierPaidAmd >= input.carrierRateAmd ? 'paid' : 'partially_paid',
        profitAmd:
          input.tripType === 'expedition'
            ? round2(input.clientRateAmd - input.carrierRateAmd - input.expensesAmd)
            : round2(input.clientRateAmd - input.expensesAmd),
        cashGapAmd:
          input.tripType === 'expedition' ? round2(Math.max(0, carrierPaidAmd - clientPaidAmd)) : 0,
      };

      const oldClientPaidAmd = round2(Number(t.clientPaidAmountAmd ?? 0));
      const oldCarrierPaidAmd = round2(Number(t.carrierPaidAmountAmd ?? 0));
      const oldClientStatus = String(t.clientPaymentStatus ?? 'not_paid');
      const oldCarrierStatus = String(t.carrierPaymentStatus ?? 'not_paid');
      const oldProfitAmd = round2(Number(t.profitAmd ?? t.profit ?? 0));
      const oldClientDebtAmd = round2(Math.max(0, Number(t.clientRateAmd ?? t.clientRate ?? 0) - Number(t.clientPaidAmountAmd ?? 0)));
      const oldCarrierDebtAmd = round2(Math.max(0, Number(t.carrierRateAmd ?? t.carrierRate ?? 0) - Number(t.carrierPaidAmountAmd ?? 0)));
      const oldCashGapAmd = t.tripType === 'expedition'
        ? round2(Math.max(0, Number(t.carrierPaidAmountAmd ?? t.carrierPaidAmount ?? 0) - Number(t.clientPaidAmountAmd ?? t.clientPaidAmount ?? 0)))
        : 0;

      const checks = [
        ['clientPaidAmd', oldClientPaidAmd, round2(canonical.clientPaidAmd)],
        ['carrierPaidAmd', oldCarrierPaidAmd, round2(canonical.carrierPaidAmd)],
        ['clientPaymentStatus', oldClientStatus, canonical.clientPaymentStatus],
        ['carrierPaymentStatus', oldCarrierStatus, canonical.carrierPaymentStatus],
        ['profitAmd', oldProfitAmd, round2(canonical.profitAmd)],
        ['clientDebtAmd', oldClientDebtAmd, round2(canonical.clientDebtAmd)],
        ['carrierDebtAmd', oldCarrierDebtAmd, round2(canonical.carrierDebtAmd)],
        ['cashGapAmd', oldCashGapAmd, round2(canonical.cashGapAmd)],
      ];

      for (const [field, oldValue, canonicalValue] of checks) {
        if (String(oldValue) === String(canonicalValue)) continue;
        discrepancies.push({
          tripId: t.id,
          tripNumber: t.tripNumber,
          tripType: t.tripType,
          field,
          oldValue,
          canonicalValue,
          delta: typeof oldValue === 'number' && typeof canonicalValue === 'number'
            ? round2(canonicalValue - oldValue)
            : null,
          possibleReason: classifyReason(field, oldValue, canonicalValue, t),
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          scannedTrips: trips.length,
          discrepancyCount: discrepancies.length,
          discrepancies,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('finance diagnostic failed:', err);
  process.exit(1);
});
