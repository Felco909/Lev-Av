export interface DirectorFinanceKpi {
  revenueAmd: number;
  expenseAmd: number;
  profitAmd: number;
  clientDebtAmd: number;
  carrierDebtAmd: number;
  cashGapAmd: number;
}

export interface DirectorFinanceSection {
  incomeAmd: number;
  expenseAmd: number;
  profitAmd: number;
}

export interface DirectorFinanceRiskItem {
  id: string;
  tripId: string;
  tripNumber: string;
  title: string;
  amountAmd: number;
  tone: 'warning' | 'danger';
}

export interface DirectorFinanceDrillDownItem {
  tripId: string;
  tripNumber: string;
  route: string;
  clientName: string;
  tripType: 'own_transport' | 'expedition';
  profitAmd: number;
  clientDebtAmd: number;
  carrierDebtAmd: number;
  cashGapAmd: number;
}

export interface DirectorFinanceResponse {
  asOf: string;
  kpi: DirectorFinanceKpi;
  ownTransport: DirectorFinanceSection;
  expedition: DirectorFinanceSection & {
    clientDebtAmd: number;
    carrierDebtAmd: number;
    cashGapAmd: number;
  };
  risksToday: DirectorFinanceRiskItem[];
  drillDown: DirectorFinanceDrillDownItem[];
}
