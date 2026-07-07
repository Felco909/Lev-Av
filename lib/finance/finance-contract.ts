import type { PaymentStatus } from '@/lib/finance/types';

/**
 * Canonical finance contract (stage-1 baseline).
 *
 * This file is intentionally declarative and read-only:
 * - keeps formula/metric names stable;
 * - avoids changing business logic in API/UI;
 * - serves as a single source for contract review.
 */

export const FINANCE_CONTRACT_VERSION = '1.0.0' as const;

export const PAYMENT_SOURCE_OF_TRUTH = 'Payment' as const;
export const TRIP_ROLE_IN_CONTRACT = 'commercial_context_and_aggregates' as const;

export const CANONICAL_PAYMENT_STATUSES: readonly PaymentStatus[] = Object.freeze([
  'not_paid',
  'partially_paid',
  'paid',
]);

export const CANONICAL_FORMULAS = Object.freeze({
  client_debt_amd: 'max(0, client_rate_amd - client_paid_amd)',
  carrier_debt_amd: 'max(0, carrier_rate_amd - carrier_paid_amd)',
  client_payment_status:
    'not_paid if client_paid_amd<=0; paid if client_paid_amd>=client_rate_amd; else partially_paid',
  carrier_payment_status:
    'not_paid if carrier_paid_amd<=0; paid if carrier_paid_amd>=carrier_rate_amd; else partially_paid',
  is_overdue: 'debt_amd > 0 && due_date < today',
  expedition_profit_amd: 'client_rate_amd - carrier_rate_amd - expedition_expenses_amd',
  own_transport_profit_amd: 'client_rate_amd - own_transport_expenses_amd',
  cash_gap_amd: 'max(0, carrier_paid_amd - client_paid_amd)',
});

/**
 * Fields that must be covered by internal validation checks.
 * Used only for passive scope-coverage diagnostics.
 */
export const VALIDATION_SCOPE_FIELDS = Object.freeze([
  'clientDebtAmd',
  'carrierDebtAmd',
  'clientPaymentStatus',
  'carrierPaymentStatus',
  'profitAmd',
  'cashGapAmd',
] as const);

export const CONTRACT_NOTES = Object.freeze([
  'Original currency values are preserved as entered.',
  'AMD values are canonical for comparison and control.',
  'Historical values are not retroactively changed without explicit revaluation.',
  'Overdue is a flag layered over payment status, not a separate status enum.',
] as const);
