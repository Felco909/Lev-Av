export type TripType = 'expedition' | 'own_transport' | string;

export type PaymentStatus = 'not_paid' | 'partially_paid' | 'paid';

export interface FinanceTripInput {
  tripId: string;
  tripNumber: string;
  tripType: TripType;
  status?: string | null;
  clientRateAmd: number;
  carrierRateAmd: number;
  expensesAmd: number;
  clientDueDate?: Date | string | null;
  carrierDueDate?: Date | string | null;
}

export interface FinancePaymentInput {
  tripId: string;
  type: 'client' | 'carrier';
  amountAmd: number;
  paymentDate?: Date | string | null;
}

export interface TripFinanceMetrics {
  tripId: string;
  tripNumber: string;
  tripType: TripType;
  clientPaidAmd: number;
  carrierPaidAmd: number;
  clientDebtAmd: number;
  carrierDebtAmd: number;
  clientPaymentStatus: PaymentStatus;
  carrierPaymentStatus: PaymentStatus;
  clientOverdue: boolean;
  carrierOverdue: boolean;
  profitAmd: number;
  cashGapAmd: number;
}

export interface FinanceAggregateMetrics {
  totalClientDebtAmd: number;
  totalCarrierDebtAmd: number;
  totalProfitAmd: number;
  totalCashGapAmd: number;
  overdueClientCount: number;
  overdueCarrierCount: number;
}
