import type { PrismaClient } from '@prisma/client';
import {
  computeClientDueAmd,
  computeCarrierDueAmd,
  computeDebtAmd,
  computeCashGapAmd,
  computeOverdueFlag,
  roundMoney,
} from '@/lib/finance/formulas';
import {
  buildClientPaymentReminderBuckets,
  buildCarrierPaymentReminderBuckets,
} from '@/lib/dashboard-payment-reminders';

/**
 * Единый слой чтения долгов (см. аудит раздела «Долги», 28.07.2026) — единственное место,
 * где Trip+Expense читаются и превращаются в долг клиента/перевозчика. До этого модуля
 * один и тот же расчёт независимо переписывали /api/debts, /api/dashboard и
 * /api/reports/company-debts — каждый своим прямым Prisma-запросом. Формулы (computeClientDueAmd
 * и т.д.) не менялись — здесь только один общий вызов вместо трёх.
 *
 * Просрочка — через computeOverdueFlag() (formulas.ts → computeIsClientPaymentOverdue()),
 * а не через локально переписанное правило, каким было calcDueState() в /api/debts.
 * Кассовый разрыв — через computeCashGapAmd(), а не инлайн-вычитание.
 */

export interface DebtTripRow {
  id: string;
  tripNumber: string;
  routeFrom: string;
  routeTo: string;
  rateAmd: number;
  paidAmd: number;
  remaining: number;
  tripDate: string;
  status: string;
  paymentDueDate: string | null;
  daysLeft: number | null;
  isOverdue: boolean;
  isUrgent: boolean;
  cashGap: number;
  entityId: string;
  entityName: string;
  entityPhone?: string | null;
  entityEmail?: string | null;
  // Единый слой отображения валют (не расчёт — чистый проброс уже загруженных полей
  // Trip, formulas.ts не тронуты). "Своя" сторона строки (клиент — для
  // getClientDebtRows, перевозчик — для getCarrierDebtRows) — исходная ставка,
  // не rateAmd (который может включать доп.расходы в других валютах).
  rate?: number;
  currency?: string;
  exchangeRate?: number;
  // Только для клиентских строк (используются вкладкой "Кассовые разрывы", см.
  // debts/page.tsx cashGapRows = clientDebts.filter(cashGap>0)) — сторона
  // перевозчика, которой в этой строке иначе вообще нет.
  carrierRate?: number;
  carrierCurrency?: string;
  carrierExchangeRate?: number;
  carrierPaidAmd?: number;
}

function calcDaysLeft(dueDate: Date | null, todayStart: Date): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - todayStart.getTime()) / 86400000);
}

/**
 * Необязательный фильтр периода/клиента/типа — нужен только Dashboard (там долг считается
 * "за период" для сравнения с предыдущим периодом). /api/debts вызывает без фильтра — это
 * общий текущий остаток долга, а не долг "за период" (сам долг не привязан к дате рейса).
 */
export interface DebtFilters {
  dateFrom?: string | null;
  dateTo?: string | null;
  clientId?: string | null;
  tripType?: string | null;
}

function applyDebtFilters(where: any, filters?: DebtFilters) {
  if (!filters) return where;
  if (filters.dateFrom || filters.dateTo) {
    where.tripDate = {};
    if (filters.dateFrom) where.tripDate.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.tripDate.lte = new Date(filters.dateTo);
  }
  if (filters.clientId) where.clientId = filters.clientId;
  if (filters.tripType) where.tripType = filters.tripType;
  return where;
}

/** Долги клиентов — по всем незакрытым по оплате заявкам; без filters — весь текущий остаток (как /api/debts), с filters — долг "за период" (как Dashboard). */
export async function getClientDebtRows(prisma: PrismaClient, todayStart = new Date(), filters?: DebtFilters): Promise<DebtTripRow[]> {
  const trips = await prisma.trip.findMany({
    where: applyDebtFilters({
      status: { in: ['new', 'in_progress', 'unloaded', 'awaiting_payment', 'sverka', 'completed', 'archived'] },
      clientPaymentStatus: { in: ['not_paid', 'partially_paid'] },
    }, filters),
    include: {
      client: { select: { id: true, name: true, phone: true, email: true } },
      expenses: true,
    },
    orderBy: { tripDate: 'desc' },
  });

  return trips
    .map((t) => {
      const clientRateAmd = Number((t as any).clientRateAmd ?? t.clientRate ?? 0);
      const rateAmd = computeClientDueAmd(clientRateAmd, (t as any).expenses ?? []);
      const paidAmd = Number((t as any).clientPaidAmountAmd ?? 0);
      const remaining = computeDebtAmd(rateAmd, paidAmd);
      const dueDate = (t as any).paymentDueDate ? new Date((t as any).paymentDueDate) : null;
      const daysLeft = calcDaysLeft(dueDate, todayStart);
      const isOverdue = computeOverdueFlag(dueDate, remaining, t.status);
      const isUrgent = !isOverdue && daysLeft != null && daysLeft >= 0 && daysLeft <= 3;
      const carrierPaidAmd = Number((t as any).carrierPaidAmountAmd ?? 0);
      const cashGap = t.tripType === 'expedition' ? computeCashGapAmd(paidAmd, carrierPaidAmd) : 0;
      return {
        id: t.id,
        tripNumber: t.tripNumber,
        routeFrom: t.routeFrom ?? '',
        routeTo: t.routeTo ?? '',
        rateAmd,
        paidAmd,
        remaining,
        tripDate: t.tripDate ? new Date(t.tripDate).toISOString().slice(0, 10) : '',
        status: t.status,
        paymentDueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
        daysLeft,
        isOverdue,
        isUrgent,
        cashGap,
        entityId: t.client?.id ?? 'unknown',
        entityName: t.client?.name ?? '—',
        entityPhone: (t.client as any)?.phone ?? null,
        entityEmail: (t.client as any)?.email ?? null,
        rate: Number(t.clientRate ?? 0),
        currency: t.currency || 'AMD',
        exchangeRate: Number((t as any).exchangeRate ?? 1),
        carrierRate: t.carrierRate != null ? Number(t.carrierRate) : undefined,
        carrierCurrency: (t as any).carrierCurrency || t.currency || 'AMD',
        carrierExchangeRate: (t as any).carrierExchangeRate != null ? Number((t as any).carrierExchangeRate) : undefined,
        carrierPaidAmd,
      };
    })
    .filter((r) => r.remaining > 0);
}

/** Долги перевозчикам — зеркально клиентским, только для tripType='expedition' (кроме случая, когда
 * фильтр явно просит 'own_transport' — тогда результат пуст, у собственного транспорта нет перевозчика). */
export async function getCarrierDebtRows(prisma: PrismaClient, todayStart = new Date(), filters?: DebtFilters): Promise<DebtTripRow[]> {
  const where: any = applyDebtFilters({
    status: { in: ['new', 'in_progress', 'unloaded', 'awaiting_payment', 'sverka', 'completed', 'archived'] },
    carrierPaymentStatus: { in: ['not_paid', 'partially_paid'] },
  }, { ...filters, tripType: undefined });
  where.tripType = filters?.tripType === 'own_transport' ? 'own_transport' : 'expedition';

  const trips = await prisma.trip.findMany({
    where,
    include: {
      carrier: { select: { id: true, name: true } },
      expenses: true,
    },
    orderBy: { tripDate: 'desc' },
  });

  return trips
    .map((t) => {
      const carrierBaseAmd = Number((t as any).carrierRateAmd ?? t.carrierRate ?? 0);
      const rateAmd = computeCarrierDueAmd(carrierBaseAmd, (t as any).expenses ?? []);
      const paidAmd = Number((t as any).carrierPaidAmountAmd ?? 0);
      const remaining = computeDebtAmd(rateAmd, paidAmd);
      const dueDate = (t as any).carrierPaymentDate ? new Date((t as any).carrierPaymentDate) : null;
      const daysLeft = calcDaysLeft(dueDate, todayStart);
      const isOverdue = computeOverdueFlag(dueDate, remaining, t.status);
      const isUrgent = !isOverdue && daysLeft != null && daysLeft >= 0 && daysLeft <= 3;
      const clientPaidAmd = Number((t as any).clientPaidAmountAmd ?? 0);
      const cashGap = computeCashGapAmd(clientPaidAmd, paidAmd);
      return {
        id: t.id,
        tripNumber: t.tripNumber,
        routeFrom: t.routeFrom ?? '',
        routeTo: t.routeTo ?? '',
        rateAmd,
        paidAmd,
        remaining,
        tripDate: t.tripDate ? new Date(t.tripDate).toISOString().slice(0, 10) : '',
        status: t.status,
        paymentDueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
        daysLeft,
        isOverdue,
        isUrgent,
        cashGap,
        entityId: t.carrier?.id ?? 'unknown',
        entityName: t.carrier?.name ?? '—',
        rate: t.carrierRate != null ? Number(t.carrierRate) : undefined,
        currency: (t as any).carrierCurrency || t.currency || 'AMD',
        exchangeRate: (t as any).carrierExchangeRate != null ? Number((t as any).carrierExchangeRate) : Number((t as any).exchangeRate ?? 1),
      };
    })
    .filter((r) => r.remaining > 0);
}

export interface GroupedDebt {
  entity: { id: string; name: string; phone?: string | null; email?: string | null };
  trips: DebtTripRow[];
  totalDebt: number;
}

/** Группировка уже полученных строк по клиенту/перевозчику — чистая функция, без обращения к БД. */
export function groupDebtRows(rows: DebtTripRow[]): GroupedDebt[] {
  const map = new Map<string, GroupedDebt>();
  for (const r of rows) {
    if (!map.has(r.entityId)) {
      map.set(r.entityId, {
        entity: { id: r.entityId, name: r.entityName, phone: r.entityPhone, email: r.entityEmail },
        trips: [],
        totalDebt: 0,
      });
    }
    const g = map.get(r.entityId)!;
    g.trips.push(r);
    g.totalDebt = roundMoney(g.totalDebt + r.remaining);
  }
  return Array.from(map.values()).sort((a, b) => b.totalDebt - a.totalDebt);
}

export function sumDebt(rows: DebtTripRow[]): number {
  return roundMoney(rows.reduce((s, r) => s + r.remaining, 0));
}

export function sumCashGap(rows: DebtTripRow[]): number {
  return roundMoney(rows.reduce((s, r) => s + (r.cashGap || 0), 0));
}

/**
 * Ожидаемые/просроченные платежи (вёдра overdue/dueSoon) — обёртка над уже существующим
 * lib/dashboard-payment-reminders.ts. Этот модуль был написан ранее (журнал-first, с
 * денормализованным fallback — см. lib/client-overdue-logic.ts), но до сих пор нигде не
 * вызывался: ни /api/debts, ни /api/dashboard не использовали его, у каждого была своя
 * версия того же самого правила.
 */
export async function getPaymentReminders(prisma: PrismaClient, todayStart = new Date()) {
  const [client, carrier] = await Promise.all([
    buildClientPaymentReminderBuckets(prisma, todayStart),
    buildCarrierPaymentReminderBuckets(prisma, todayStart),
  ]);
  return {
    clientOverdue: client.overdue,
    clientDueSoon: client.dueSoon,
    carrierOverdue: carrier.overdue,
    carrierDueSoon: carrier.dueSoon,
  };
}

export interface SupplierDebtRow {
  id: string;
  date: Date;
  partName: string;
  quantity: unknown;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;
  paymentStatus: string;
  vehicle: { id: string; plateNumber: string; brand: string; model: string } | null;
  supplier: { id: string; name: string; contactPerson: string | null; phone: string | null } | null;
}

/** Долги поставщикам запчастей — единственный источник для /api/reports/supplier-debts и /api/reports/company-debts. */
export async function getSupplierDebtRows(
  prisma: PrismaClient,
  filters?: { supplierId?: string | null; vehicleId?: string | null; paymentStatus?: string | null }
): Promise<SupplierDebtRow[]> {
  const where: any = {};
  if (filters?.supplierId) where.supplierId = filters.supplierId;
  if (filters?.vehicleId) where.vehicleId = filters.vehicleId;
  if (filters?.paymentStatus) where.paymentStatus = filters.paymentStatus;

  const purchases = await prisma.partPurchase.findMany({
    where,
    include: {
      vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
      supplier: { select: { id: true, name: true, contactPerson: true, phone: true } },
    },
    orderBy: { date: 'desc' },
  });

  return purchases.map((p) => ({
    id: p.id,
    date: p.date,
    partName: p.partName,
    quantity: p.quantity,
    totalAmount: Number(p.totalAmount),
    paidAmount: Number(p.paidAmount),
    debtAmount: computeDebtAmd(Number(p.totalAmount), Number(p.paidAmount)),
    paymentStatus: p.paymentStatus,
    vehicle: p.vehicle,
    supplier: p.supplier,
  }));
}
