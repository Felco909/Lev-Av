'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';
import { DayTasksPanels } from './_components/day-tasks-panels';
import type {
  DashboardResponse,
  DayTaskItem,
  DayTaskPanelData,
  DebtsResponse,
  FinanceAuditResponse,
  TripsReportResponse,
} from './_components/types';

type DayTasksPayload = {
  dashboard: DashboardResponse | null;
  debts: DebtsResponse | null;
  audit: FinanceAuditResponse | null;
  tripsTodayTomorrow: TripsReportResponse | null;
};

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function DayTasksPage() {
  const [payload, setPayload] = useState<DayTasksPayload>({
    dashboard: null,
    debts: null,
    audit: null,
    tripsTodayTomorrow: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const dateFrom = ymd(today);
      const dateTo = ymd(tomorrow);

      const [dashboardRes, debtsRes, auditRes, tripsRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/debts'),
        fetch('/api/finance/audit'),
        fetch(`/api/reports/trips?dateFrom=${dateFrom}&dateTo=${dateTo}`),
      ]);

      if (!dashboardRes.ok) throw new Error('Не удалось загрузить дашборд');
      if (!debtsRes.ok) throw new Error('Не удалось загрузить раздел долгов');
      if (!auditRes.ok) throw new Error('Не удалось загрузить финансовый аудит');
      if (!tripsRes.ok) throw new Error('Не удалось загрузить отчёт по заявкам');

      const [dashboard, debts, audit, tripsTodayTomorrow] = await Promise.all([
        dashboardRes.json(),
        debtsRes.json(),
        auditRes.json(),
        tripsRes.json(),
      ]);

      setPayload({ dashboard, debts, audit, tripsTodayTomorrow });
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const panels = useMemo<DayTaskPanelData[]>(() => {
    const dashboard = payload.dashboard;
    const debts = payload.debts;
    const audit = payload.audit;
    const trips = payload.tripsTodayTomorrow?.rows ?? [];

    const todayTrips: DayTaskItem[] = trips.slice(0, 8).map((t) => ({
      id: `trip-today-${t.id}`,
      label: `${t.tripNumber}: ${t.routeFrom} -> ${t.routeTo}`,
      href: `/trips/${t.id}`,
      tone: t.status === 'new' || t.status === 'in_progress' ? 'warning' : 'default',
      meta: t.client ? `Клиент: ${t.client}, статус: ${t.status}` : `Статус: ${t.status}`,
    }));

    const missingDocs: DayTaskItem[] = [
      ...(dashboard?.commandCenter?.attention?.noInvoiceActTrips ?? []).map((t) => ({
        id: `no-docs-${t.id}`,
        label: `${t.tripNumber} — без счета/акта`,
        href: `/trips/${t.id}`,
        tone: 'warning' as const,
        meta: t.clientName || 'Клиент не указан',
      })),
      ...(dashboard?.commandCenter?.attention?.noAttachmentTrips ?? []).map((t) => ({
        id: `no-attach-${t.id}`,
        label: `${t.tripNumber} — нет вложений`,
        href: `/trips/${t.id}`,
        tone: 'warning' as const,
        meta: t.clientName || 'Клиент не указан',
      })),
    ].slice(0, 8);

    const logisticsQueue: DayTaskItem[] = [
      ...(dashboard?.reminders?.overduePayments ?? []).map((r) => ({
        id: `log-overdue-${r.id}`,
        label: `${r.tripNumber} — просрочен контроль`,
        href: `/trips/${r.id}`,
        tone: 'danger' as const,
        meta: `${r.clientName ?? 'Клиент'}${typeof r.daysLeft === 'number' ? `, дней: ${r.daysLeft}` : ''}`,
      })),
      ...(dashboard?.reminders?.paymentDueTrips ?? []).map((r) => ({
        id: `log-due-${r.id}`,
        label: `${r.tripNumber} — контроль оплаты`,
        href: `/trips/${r.id}`,
        tone: 'warning' as const,
        meta: `${r.clientName ?? 'Клиент'}${typeof r.daysLeft === 'number' ? `, дней: ${r.daysLeft}` : ''}`,
      })),
    ].slice(0, 8);

    const accountantIncoming: DayTaskItem[] = [
      ...(dashboard?.reminders?.paymentDueTrips ?? []).map((r) => ({
        id: `acc-in-${r.id}`,
        label: `${r.tripNumber} — входящая оплата`,
        href: `/trips/${r.id}`,
        tone: typeof r.daysLeft === 'number' && r.daysLeft < 0 ? ('danger' as const) : ('warning' as const),
        meta: `${r.clientName ?? 'Клиент'}${r.amount ? `, ${Math.round(r.amount).toLocaleString('ru-RU')} ֏` : ''}`,
      })),
      ...(dashboard?.reminders?.overduePayments ?? []).map((r) => ({
        id: `acc-in-overdue-${r.id}`,
        label: `${r.tripNumber} — входящая просрочена`,
        href: `/trips/${r.id}`,
        tone: 'danger' as const,
        meta: `${r.clientName ?? 'Клиент'}${r.amount ? `, ${Math.round(r.amount).toLocaleString('ru-RU')} ֏` : ''}`,
      })),
    ].slice(0, 8);

    const accountantOutgoing: DayTaskItem[] = [
      ...(dashboard?.reminders?.carrierPaymentDueTrips ?? []).map((r) => ({
        id: `acc-out-${r.id}`,
        label: `${r.tripNumber} — исходящая перевозчику`,
        href: `/trips/${r.id}`,
        tone: typeof r.daysLeft === 'number' && r.daysLeft < 0 ? ('danger' as const) : ('warning' as const),
        meta: `${r.carrierName ?? 'Перевозчик'}${r.amount ? `, ${Math.round(r.amount).toLocaleString('ru-RU')} ֏` : ''}`,
      })),
      ...(dashboard?.reminders?.carrierOverduePayments ?? []).map((r) => ({
        id: `acc-out-overdue-${r.id}`,
        label: `${r.tripNumber} — исходящая просрочена`,
        href: `/trips/${r.id}`,
        tone: 'danger' as const,
        meta: `${r.carrierName ?? 'Перевозчик'}${r.amount ? `, ${Math.round(r.amount).toLocaleString('ru-RU')} ֏` : ''}`,
      })),
    ].slice(0, 8);

    const discrepancies: DayTaskItem[] = [
      ...((audit?.endpointConsistency?.mismatches ?? []).map((m, idx) => ({
        id: `mismatch-${idx}`,
        label: `${m.metric}: ${m.left.endpoint} и ${m.right.endpoint}`,
        href: '/reports',
        tone: 'danger' as const,
        meta: `Разница: ${Math.round((m.diffAmd ?? 0) * 100) / 100} ֏`,
      }))),
      ...(audit?.summary?.tripConflictCount
        ? [
            {
              id: 'trip-conflicts',
              label: `Конфликтов по заявкам: ${audit.summary.tripConflictCount}`,
              href: '/reports',
              tone: 'warning' as const,
              meta: 'Сверить карточки заявок и оплаты',
            },
          ]
        : []),
    ];

    const directorSlice: DayTaskItem[] = [
      {
        id: 'slice-income',
        label: `Доход: ${Math.round(dashboard?.totals?.totalIncome ?? 0).toLocaleString('ru-RU')} ֏`,
        href: '/dashboard',
        tone: 'success' as const,
      },
      {
        id: 'slice-expense',
        label: `Расход: ${Math.round(dashboard?.totals?.totalExpense ?? 0).toLocaleString('ru-RU')} ֏`,
        href: '/dashboard',
        tone: 'default' as const,
      },
      {
        id: 'slice-profit',
        label: `Прибыль: ${Math.round(dashboard?.kpi?.totalProfit ?? 0).toLocaleString('ru-RU')} ֏`,
        href: '/dashboard',
        tone: (dashboard?.kpi?.totalProfit ?? 0) >= 0 ? ('success' as const) : ('danger' as const),
      },
    ];

    const directorRisks: DayTaskItem[] = [
      {
        id: 'risk-client-debt',
        label: `Долг клиентов: ${Math.round(debts?.totalClientDebt ?? dashboard?.kpi?.totalClientDebt ?? 0).toLocaleString('ru-RU')} ֏`,
        href: '/debts',
        tone: 'warning' as const,
      },
      {
        id: 'risk-carrier-debt',
        label: `Долг перевозчикам: ${Math.round(debts?.totalCarrierDebt ?? dashboard?.kpi?.totalCarrierDebt ?? 0).toLocaleString('ru-RU')} ֏`,
        href: '/debts',
        tone: 'warning' as const,
      },
      {
        id: 'risk-cash-gap',
        label: `Кассовый разрыв: ${Math.round(dashboard?.kpi?.totalCashGap ?? 0).toLocaleString('ru-RU')} ֏`,
        href: '/reports',
        tone: (dashboard?.kpi?.totalCashGap ?? 0) > 0 ? ('danger' as const) : ('success' as const),
      },
    ];

    const directorDrillDown: DayTaskItem[] = [
      ...(dashboard?.clientDebts ?? []).slice(0, 5).map((d) => ({
        id: `dd-client-${d.id}`,
        label: `${d.tripNumber} — долг клиента`,
        href: `/trips/${d.id}`,
        tone: d.remaining > 0 ? ('warning' as const) : ('default' as const),
        meta: `${d.clientName ?? 'Клиент'}: ${Math.round(d.remaining).toLocaleString('ru-RU')} ֏`,
      })),
      ...(dashboard?.problemRows ?? []).slice(0, 5).map((p) => ({
        id: `dd-problem-${p.id}`,
        label: `${p.tripNumber} — финансовый риск`,
        href: `/trips/${p.id}`,
        tone: 'danger' as const,
        meta: `Разрыв: ${Math.round(p.diff).toLocaleString('ru-RU')} ֏`,
      })),
    ].slice(0, 8);

    return [
      {
        roleTitle: 'Логист',
        roleSubtitle: 'Оперативный список заявок и действий на сегодня',
        blocks: [
          {
            title: 'Заявки сегодня / завтра',
            emptyText: 'На сегодня и завтра заявок не найдено',
            items: todayTrips,
          },
          {
            title: 'Не закрыто по документам / маршруту',
            emptyText: 'Критичных незакрытых позиций нет',
            items: missingDocs,
          },
          {
            title: 'Сделать сегодня',
            emptyText: 'Очередь на сегодня пустая',
            items: logisticsQueue,
          },
        ],
      },
      {
        roleTitle: 'Бухгалтер',
        roleSubtitle: 'Оплаты, документы и сверка финансовых отклонений',
        blocks: [
          {
            title: 'Очередь оплат (входящие / исходящие)',
            emptyText: 'Сегодня нет срочных оплат',
            items: [...accountantIncoming, ...accountantOutgoing].slice(0, 10),
          },
          {
            title: 'Заявки без счета / акта / документов',
            emptyText: 'Все заявки укомплектованы',
            items: missingDocs,
          },
          {
            title: 'Финансовые расхождения',
            emptyText: 'Расхождений между модулями не найдено',
            items: discrepancies,
          },
        ],
      },
      {
        roleTitle: 'Директор',
        roleSubtitle: 'Финансовый срез дня, долги, риски и детализация',
        blocks: [
          {
            title: 'Финансовый срез дня',
            emptyText: 'Нет данных за период',
            items: directorSlice,
          },
          {
            title: 'Долги и риски',
            emptyText: 'Критичных долгов и рисков не найдено',
            items: directorRisks,
          },
          {
            title: 'Детализация по заявкам',
            emptyText: 'Нет заявок для детализации',
            items: directorDrillDown,
          },
        ],
      },
    ];
  }, [payload]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Лист дня</h1>
          <p className="text-sm text-muted-foreground">
            Ролевые задачи на день: логист, бухгалтер, директор
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Обновить
          </button>
          <Link href="/dashboard" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
            В дашборд
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading && !payload.dashboard ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <DayTasksPanels panels={panels} />
      )}
    </div>
  );
}
