export interface PlanFactDay {
  plannedTrips: number;
  actualTrips: number;
  plannedRevenueAmd: number;
  actualRevenueAmd: number;
  plannedProfitAmd: number;
  actualProfitAmd: number;
}

export interface OverdueBucket {
  bucket: 'not_due' | 'overdue_1_3' | 'overdue_4_7' | 'overdue_8_14' | 'overdue_15_plus';
  label: string;
  clientDebtAmd: number;
  carrierDebtAmd: number;
  tripCount: number;
}

export interface CashFlowSummary {
  expectedIncomingAmd: number;
  actualIncomingAmd: number;
  expectedOutgoingAmd: number;
  actualOutgoingAmd: number;
  netExpectedAmd: number;
  netActualAmd: number;
}

export interface SplitWindowSummary {
  incomeAmd: number;
  expenseAmd: number;
  profitAmd: number;
  clientDebtAmd: number;
  carrierDebtAmd: number;
  cashGapAmd: number;
}

export interface OwnVsExpeditionSplit {
  day: {
    ownTransport: SplitWindowSummary;
    expedition: SplitWindowSummary;
  };
  week: {
    ownTransport: SplitWindowSummary;
    expedition: SplitWindowSummary;
  };
}

export interface DailyReportsResponse {
  asOf: string;
  planFactDay: PlanFactDay;
  overdueBuckets: OverdueBucket[];
  cashFlow: CashFlowSummary;
  ownVsExpedition: OwnVsExpeditionSplit;
}
