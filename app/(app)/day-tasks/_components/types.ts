export interface DayTaskItem {
  id: string;
  label: string;
  href?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  meta?: string;
}

export interface DayTaskBlock {
  title: string;
  emptyText: string;
  items: DayTaskItem[];
}

export interface DayTaskPanelData {
  roleTitle: string;
  roleSubtitle: string;
  blocks: DayTaskBlock[];
}

export interface DashboardResponse {
  kpi?: {
    totalClientDebt: number;
    totalCarrierDebt: number;
    totalProfit: number;
    totalCashGap: number;
  };
  totals?: {
    totalIncome: number;
    totalExpense: number;
  };
  clientDebts?: Array<{
    id: string;
    tripNumber: string;
    clientName?: string;
    remaining: number;
  }>;
  problemRows?: Array<{
    id: string;
    tripNumber: string;
    diff: number;
  }>;
  reminders?: {
    overduePayments?: Array<{
      id: string;
      tripNumber: string;
      clientName?: string;
      amount?: number;
      daysLeft?: number;
    }>;
    paymentDueTrips?: Array<{
      id: string;
      tripNumber: string;
      clientName?: string;
      amount?: number;
      daysLeft?: number;
    }>;
    carrierOverduePayments?: Array<{
      id: string;
      tripNumber: string;
      carrierName?: string;
      amount?: number;
      daysLeft?: number;
    }>;
    carrierPaymentDueTrips?: Array<{
      id: string;
      tripNumber: string;
      carrierName?: string;
      amount?: number;
      daysLeft?: number;
    }>;
  };
  commandCenter?: {
    today?: {
      loadings: number;
      unloadings: number;
      expectedPayments: number;
      problems: number;
    };
    attention?: {
      noInvoiceActTrips?: Array<{ id: string; tripNumber: string; clientName: string }>;
      noAttachmentTrips?: Array<{ id: string; tripNumber: string; clientName: string }>;
      overduePayments?: Array<{ id: string; tripNumber: string; clientName?: string; amount?: number; daysLeft?: number }>;
      unpaidTrips?: Array<{ id: string; tripNumber: string; clientName?: string; remaining: number }>;
      statusProblemsCount?: number;
      idleVehiclesCount?: number;
      vehiclesWithoutDocs?: number;
    };
  };
}

export interface DebtsResponse {
  totalClientDebt?: number;
  totalCarrierDebt?: number;
}

export interface FinanceAuditResponse {
  endpointConsistency?: {
    hasMismatch?: boolean;
    mismatches?: Array<{
      metric: string;
      diffAmd: number;
      left: { endpoint: string; value: number };
      right: { endpoint: string; value: number };
    }>;
  };
  summary?: {
    tripConflictCount?: number;
  };
}

export interface TripsReportResponse {
  rows?: Array<{
    id: string;
    tripNumber: string;
    routeFrom: string;
    routeTo: string;
    status: string;
    client?: string;
  }>;
}
