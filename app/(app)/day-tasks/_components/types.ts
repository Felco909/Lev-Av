export type Priority = 'normal' | 'attention' | 'urgent' | 'overdue';
export type GpsStatus = 'moving' | 'stopped' | 'no_signal';

export interface TripTask {
  id: string;
  tripId: string;
  tripNumber: string;
  route: string;
  clientName: string | null;
  carrierName: string | null;
  vehiclePlate: string | null;
  driverName: string | null;
  status: string;
  nextAction: string;
  dueAt: string | null;
  priority: Priority;
  gpsStatus: GpsStatus | null;
  clientPhone: string | null;
  driverPhone: string | null;
  amountAmd: number | null;
}

export interface LogistCategory {
  category: string;
  icon: string;
  count: number;
  items: TripTask[];
}

export interface AccountantStage {
  stage: string;
  count: number;
  items: TripTask[];
}

export interface AttentionItem {
  key: string;
  label: string;
  count: number;
  amountAmd: number | null;
  href: string;
}

export interface DirectorData {
  kpi: {
    incomeAmd: number;
    expenseAmd: number;
    profitAmd: number;
    clientDebtAmd: number;
    carrierDebtAmd: number;
    cashGapAmd: number;
    vehiclesOnTrip: number;
    vehiclesFree: number;
    totalActiveVehicles: number;
    criticalEventsCount: number;
  };
  attention: AttentionItem[];
}

export interface DayTasksSummary {
  date: string;
  weekday: string;
  activeTripsCount: number;
  tasksTodayCount: number;
  overdueTasksCount: number;
  criticalEventsCount: number;
  lastUpdated: string;
}

export interface DayTasksResponse {
  summary: DayTasksSummary;
  logist: LogistCategory[];
  accountant: AccountantStage[];
  director: DirectorData;
}

export type PeriodFilter = 'today' | 'tomorrow' | 'week' | 'all';
