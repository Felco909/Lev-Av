export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { computeAggregateMetrics, computeTripFinanceMetrics, getTripSplitExpenseTotalsAmd, validateMetricsAgainstContract } from '@/lib/finance/finance-metrics-service';
import { FINANCE_CONTRACT_VERSION, PAYMENT_SOURCE_OF_TRUTH, VALIDATION_SCOPE_FIELDS } from '@/lib/finance/finance-contract';
import { roundMoney } from '@/lib/finance/formulas';
import { getValidationGateConfig, shouldSample } from '@/lib/finance/validation-gate';
import type { FinancePaymentInput, FinanceTripInput } from '@/lib/finance/types';

type NumericDiff = {
  oldValue: number;
  canonicalValue: number;
  diff: number;
};

function diff(oldValue: number, canonicalValue: number): NumericDiff {
  const d = roundMoney(canonicalValue - oldValue);
  return {
    oldValue: roundMoney(oldValue),
    canonicalValue: roundMoney(canonicalValue),
    diff: d,
  };
}

function hasMismatch(a: number, b: number): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) > 0.009;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const limitParam = Number(searchParams.get('limit') || 0);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 5000) : undefined;

    const where: any = {};
    if (dateFrom || dateTo) {
      where.tripDate = {};
      if (dateFrom) where.tripDate.gte = new Date(dateFrom);
      if (dateTo) where.tripDate.lte = new Date(dateTo);
    }

    const trips = await prisma.trip.findMany({
      where,
      include: {
        expenses: { select: { amountAmd: true, amount: true } },
      },
      orderBy: { tripDate: 'desc' },
      ...(limit ? { take: limit } : {}),
    });

    if (trips.length === 0) {
      return NextResponse.json({
        summary: { tripCount: 0, hasConflicts: false },
        diagnostics: [],
      });
    }

    const tripIds = trips.map((t) => t.id);
    const paymentsDb = await prisma.payment.findMany({
      where: { tripId: { in: tripIds } },
      select: { tripId: true, type: true, amountAmd: true, paymentDate: true },
    });

    const payments: FinancePaymentInput[] = paymentsDb.map((p) => ({
      tripId: p.tripId,
      type: p.type as 'client' | 'carrier',
      amountAmd: Number(p.amountAmd ?? 0),
      paymentDate: p.paymentDate,
    }));

    const tripInputs: FinanceTripInput[] = trips.map((t) => ({
      ...(function () {
        const split = getTripSplitExpenseTotalsAmd(t as any);
        return {
          tripId: t.id,
          tripNumber: t.tripNumber,
          tripType: t.tripType,
          status: t.status,
          clientRateAmd: Number((t as any).clientRateAmd ?? t.clientRate ?? 0) + split.clientExtraAmd,
          carrierRateAmd: Number((t as any).carrierRateAmd ?? t.carrierRate ?? 0),
          expensesAmd: split.carrierExtraAmd,
          clientDueDate: (t as any).paymentDueDate ?? null,
          carrierDueDate: (t as any).carrierPaymentDate ?? null,
        };
      })(),
    }));

    const canonicalRows = tripInputs.map((tripInput) => {
      return computeTripFinanceMetrics(tripInput, payments);
    });
    const canonicalTotals = computeAggregateMetrics(canonicalRows);
    const canonicalByTripId = new Map(canonicalRows.map((r) => [r.tripId, r]));

    // Passive internal verification layer (debug/flag + sampling).
    // Never throws into response path.
    try {
      const gate = getValidationGateConfig(process.env);
      if (gate.enabled && gate.sampleRate > 0) {
        const localWarnings: Array<ReturnType<typeof validateMetricsAgainstContract>[number]> = [];
        let sampledTrips = 0;
        for (let i = 0; i < tripInputs.length; i++) {
          if (!shouldSample(gate.sampleRate)) continue;
          sampledTrips++;
          const warnings = validateMetricsAgainstContract(tripInputs[i], canonicalRows[i]);
          if (warnings.length > 0) localWarnings.push(...warnings);
        }
        const warningsByField: Record<string, number> = {};
        const warningsByFormula: Record<string, number> = {};
        for (const w of localWarnings) {
          warningsByField[w.field] = (warningsByField[w.field] || 0) + 1;
          warningsByFormula[w.formulaKey] = (warningsByFormula[w.formulaKey] || 0) + 1;
        }
        const coveredValidationFields = new Set([
          'clientDebtAmd',
          'carrierDebtAmd',
          'clientPaymentStatus',
          'carrierPaymentStatus',
          'profitAmd',
          'cashGapAmd',
        ]);
        const scopeMissingFields = VALIDATION_SCOPE_FIELDS.filter((f) => !coveredValidationFields.has(f));
        const internalDiagnosticReport = {
          contractVersion: FINANCE_CONTRACT_VERSION,
          paymentSourceOfTruth: PAYMENT_SOURCE_OF_TRUTH,
          sampledTrips,
          warningCount: localWarnings.length,
          uniqueTripsWithWarnings: new Set(localWarnings.map((w) => w.tripId)).size,
          warningsByField,
          warningsByFormula,
          scopeMissingFields,
        };
        if (scopeMissingFields.length > 0) {
          console.warn('[finance-audit][internal-validation] scope coverage warning', {
            contractVersion: FINANCE_CONTRACT_VERSION,
            scopeMissingFields,
          });
        }
        if (localWarnings.length > 0) {
          console.warn('[finance-audit][internal-validation] contract warnings', {
            ...internalDiagnosticReport,
            sample: localWarnings.slice(0, 20),
          });
        } else {
          console.info('[finance-audit][internal-validation] ok', internalDiagnosticReport);
        }
      }
    } catch (validationError) {
      // Fail-safe: diagnostics must never break API response.
      console.warn('[finance-audit][internal-validation] skipped due to error', validationError);
    }

    // AS-IS old totals (mirrors existing APIs)
    const oldTripProfitTotal = roundMoney(
      trips.reduce((s, t) => s + Number((t as any).profitAmd ?? t.profit ?? 0), 0)
    );
    const oldClientDebtTotal = roundMoney(
      trips
        .filter((t) => ['not_paid', 'partially_paid'].includes((t as any).clientPaymentStatus ?? 'not_paid'))
        .reduce((s, t) => {
          const rate = Number((t as any).clientRateAmd ?? t.clientRate ?? 0);
          const paid = Number((t as any).clientPaidAmountAmd ?? 0);
          return s + Math.max(0, rate - paid);
        }, 0)
    );
    const oldCarrierDebtTotal = roundMoney(
      trips
        .filter((t) => t.tripType === 'expedition')
        .filter((t) => ['not_paid', 'partially_paid'].includes((t as any).carrierPaymentStatus ?? 'not_paid'))
        .reduce((s, t) => {
          const rate = Number((t as any).carrierRateAmd ?? t.carrierRate ?? 0);
          const paid = Number((t as any).carrierPaidAmountAmd ?? 0);
          return s + Math.max(0, rate - paid);
        }, 0)
    );
    const oldCashGapTotal = roundMoney(
      trips
        .filter((t) => t.tripType === 'expedition')
        .reduce((s, t) => {
          const clientPaid = Number((t as any).clientPaidAmountAmd ?? (t as any).clientPaidAmount ?? 0);
          const carrierPaid = Number((t as any).carrierPaidAmountAmd ?? (t as any).carrierPaidAmount ?? 0);
          const d = carrierPaid - clientPaid;
          return s + (d > 0 ? d : 0);
        }, 0)
    );

    const moduleDiagnostics = {
      trip: {
        totalProfitAmd: diff(oldTripProfitTotal, canonicalTotals.totalProfitAmd),
      },
      debts: {
        totalClientDebtAmd: diff(oldClientDebtTotal, canonicalTotals.totalClientDebtAmd),
        totalCarrierDebtAmd: diff(oldCarrierDebtTotal, canonicalTotals.totalCarrierDebtAmd),
      },
      dashboard: {
        totalClientDebtAmd: diff(oldClientDebtTotal, canonicalTotals.totalClientDebtAmd),
        totalCarrierDebtAmd: diff(oldCarrierDebtTotal, canonicalTotals.totalCarrierDebtAmd),
        totalProfitAmd: diff(oldTripProfitTotal, canonicalTotals.totalProfitAmd),
        totalCashGapAmd: diff(oldCashGapTotal, canonicalTotals.totalCashGapAmd),
      },
      reports: {
        totalProfitAmd: diff(oldTripProfitTotal, canonicalTotals.totalProfitAmd),
      },
    };

    const tripConflicts = trips
      .map((t) => {
        const canonical = canonicalByTripId.get(t.id)!;
        const oldClientPaidAmd = Number((t as any).clientPaidAmountAmd ?? 0);
        const oldCarrierPaidAmd = Number((t as any).carrierPaidAmountAmd ?? 0);
        const oldClientStatus = String((t as any).clientPaymentStatus ?? 'not_paid');
        const oldCarrierStatus = String((t as any).carrierPaymentStatus ?? 'not_paid');
        const oldProfitAmd = Number((t as any).profitAmd ?? t.profit ?? 0);

        const conflicts: string[] = [];
        if (roundMoney(oldClientPaidAmd) !== roundMoney(canonical.clientPaidAmd)) conflicts.push('client_paid_amount');
        if (roundMoney(oldCarrierPaidAmd) !== roundMoney(canonical.carrierPaidAmd)) conflicts.push('carrier_paid_amount');
        if (oldClientStatus !== canonical.clientPaymentStatus) conflicts.push('client_payment_status');
        if (oldCarrierStatus !== canonical.carrierPaymentStatus) conflicts.push('carrier_payment_status');
        if (roundMoney(oldProfitAmd) !== roundMoney(canonical.profitAmd)) conflicts.push('profit_amd');

        if (conflicts.length === 0) return null;
        return {
          tripId: t.id,
          tripNumber: t.tripNumber,
          tripType: t.tripType,
          conflictFields: conflicts,
          old: {
            clientPaidAmd: roundMoney(oldClientPaidAmd),
            carrierPaidAmd: roundMoney(oldCarrierPaidAmd),
            clientPaymentStatus: oldClientStatus,
            carrierPaymentStatus: oldCarrierStatus,
            profitAmd: roundMoney(oldProfitAmd),
          },
          canonical: {
            clientPaidAmd: canonical.clientPaidAmd,
            carrierPaidAmd: canonical.carrierPaidAmd,
            clientPaymentStatus: canonical.clientPaymentStatus,
            carrierPaymentStatus: canonical.carrierPaymentStatus,
            profitAmd: canonical.profitAmd,
            clientDebtAmd: canonical.clientDebtAmd,
            carrierDebtAmd: canonical.carrierDebtAmd,
            cashGapAmd: canonical.cashGapAmd,
          },
        };
      })
      .filter(Boolean);

    const conflictsByModule = Object.entries(moduleDiagnostics)
      .flatMap(([moduleName, values]) =>
        Object.entries(values)
          .filter(([, v]) => Math.abs(v.diff) > 0.009)
          .map(([metric]) => `${moduleName}:${metric}`)
      );

    if (conflictsByModule.length > 0 || tripConflicts.length > 0) {
      console.warn('[finance-audit] Conflicts detected', {
        conflictsByModule,
        tripConflictCount: tripConflicts.length,
      });
    }

    // Endpoint parity diagnostics (read-only): compare numbers used by dashboard/debts/reports.
    const debtsUseCanonical = String(process.env.FINANCE_CANONICAL_DEBTS || '').toLowerCase() === 'true';
    const endpointNumbers = {
      dashboard: {
        totalClientDebtAmd: canonicalTotals.totalClientDebtAmd,
        totalCarrierDebtAmd: canonicalTotals.totalCarrierDebtAmd,
        totalProfitAmd: canonicalTotals.totalProfitAmd,
      },
      debts: debtsUseCanonical
        ? {
            totalClientDebtAmd: canonicalTotals.totalClientDebtAmd,
            totalCarrierDebtAmd: canonicalTotals.totalCarrierDebtAmd,
          }
        : {
            totalClientDebtAmd: oldClientDebtTotal,
            totalCarrierDebtAmd: oldCarrierDebtTotal,
          },
      reports: {
        totalProfitAmd: canonicalTotals.totalProfitAmd,
      },
    };

    const endpointMismatches = [
      {
        metric: 'totalClientDebtAmd',
        left: { endpoint: 'dashboard', value: endpointNumbers.dashboard.totalClientDebtAmd },
        right: { endpoint: 'debts', value: endpointNumbers.debts.totalClientDebtAmd },
      },
      {
        metric: 'totalCarrierDebtAmd',
        left: { endpoint: 'dashboard', value: endpointNumbers.dashboard.totalCarrierDebtAmd },
        right: { endpoint: 'debts', value: endpointNumbers.debts.totalCarrierDebtAmd },
      },
      {
        metric: 'totalProfitAmd',
        left: { endpoint: 'dashboard', value: endpointNumbers.dashboard.totalProfitAmd },
        right: { endpoint: 'reports', value: endpointNumbers.reports.totalProfitAmd },
      },
    ]
      .map((pair) => ({
        ...pair,
        diffAmd: roundMoney(pair.left.value - pair.right.value),
      }))
      .filter((pair) => hasMismatch(pair.left.value, pair.right.value));

    const endpointConsistency = {
      debtsMode: debtsUseCanonical ? 'canonical' : 'legacy',
      numbers: endpointNumbers,
      hasMismatch: endpointMismatches.length > 0,
      mismatches: endpointMismatches,
    };

    if (endpointConsistency.hasMismatch) {
      console.warn('[finance-audit][endpoint-parity] mismatch detected', endpointConsistency);
    } else {
      console.info('[finance-audit][endpoint-parity] ok', {
        debtsMode: endpointConsistency.debtsMode,
      });
    }

    return NextResponse.json({
      summary: {
        tripCount: trips.length,
        paymentCount: payments.length,
        hasConflicts: conflictsByModule.length > 0 || tripConflicts.length > 0,
        conflictModules: conflictsByModule,
        tripConflictCount: tripConflicts.length,
      },
      totals: {
        old: {
          totalClientDebtAmd: oldClientDebtTotal,
          totalCarrierDebtAmd: oldCarrierDebtTotal,
          totalProfitAmd: oldTripProfitTotal,
          totalCashGapAmd: oldCashGapTotal,
        },
        canonical: canonicalTotals,
      },
      diagnostics: moduleDiagnostics,
      endpointConsistency,
      tripConflicts: tripConflicts.slice(0, 200),
      notes: [
        'Phase-1 read-only diagnostics: no UI/DB writes performed.',
        'Canonical paid amounts are computed only from Payment records.',
      ],
    });
  } catch (error) {
    console.error('Finance audit error:', error);
    return NextResponse.json({ error: 'Ошибка финансового аудита' }, { status: 500 });
  }
}
