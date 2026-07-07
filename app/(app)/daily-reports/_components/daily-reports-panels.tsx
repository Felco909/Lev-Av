'use client';

import { CalendarClock, CircleDollarSign, GitCompareArrows, TimerReset } from 'lucide-react';
import type { DailyReportsResponse, OverdueBucket, SplitWindowSummary } from './types';

function fmtAmd(v: number): string {
  return `${Math.round(Number(v) || 0).toLocaleString('ru-RU')} ֏`;
}

function KpiMini({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'danger' }) {
  const cls = tone === 'good' ? 'text-emerald-600' : tone === 'danger' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-foreground';
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${cls}`}>{value}</p>
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SplitTable({ own, expedition }: { own: SplitWindowSummary; expedition: SplitWindowSummary }) {
  const rows = [
    { label: 'Доход', own: own.incomeAmd, exp: expedition.incomeAmd },
    { label: 'Расход', own: own.expenseAmd, exp: expedition.expenseAmd },
    { label: 'Прибыль', own: own.profitAmd, exp: expedition.profitAmd },
    { label: 'ДЗ', own: own.clientDebtAmd, exp: expedition.clientDebtAmd },
    { label: 'КЗ', own: own.carrierDebtAmd, exp: expedition.carrierDebtAmd },
    { label: 'Кассовый разрыв', own: own.cashGapAmd, exp: expedition.cashGapAmd },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2">Метрика</th>
            <th className="px-3 py-2 text-right">Собственный транспорт</th>
            <th className="px-3 py-2 text-right">Экспедиция</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b last:border-none">
              <td className="px-3 py-2 text-xs text-muted-foreground">{r.label}</td>
              <td className="px-3 py-2 text-right font-medium">{fmtAmd(r.own)}</td>
              <td className="px-3 py-2 text-right font-medium">{fmtAmd(r.exp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DailyReportsPanels({ data }: { data: DailyReportsResponse }) {
  const overdueTotals = data.overdueBuckets.reduce(
    (acc, b) => {
      acc.clientDebtAmd += b.clientDebtAmd;
      acc.carrierDebtAmd += b.carrierDebtAmd;
      acc.tripCount += b.tripCount;
      return acc;
    },
    { clientDebtAmd: 0, carrierDebtAmd: 0, tripCount: 0 }
  );

  const overdueTone = (b: OverdueBucket) => {
    if (b.bucket === 'overdue_15_plus') return 'text-red-600';
    if (b.bucket === 'overdue_8_14') return 'text-amber-600';
    return 'text-foreground';
  };

  return (
    <div className="space-y-5">
      <SectionCard title="1) Операционный план-факт дня" icon={<CalendarClock className="h-4 w-4 text-blue-600" />}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <KpiMini label="План заявок" value={`${data.planFactDay.plannedTrips}`} />
          <KpiMini label="Факт заявок" value={`${data.planFactDay.actualTrips}`} />
          <KpiMini
            label="Отклонение по заявкам"
            value={`${data.planFactDay.actualTrips - data.planFactDay.plannedTrips > 0 ? '+' : ''}${data.planFactDay.actualTrips - data.planFactDay.plannedTrips}`}
            tone={data.planFactDay.actualTrips >= data.planFactDay.plannedTrips ? 'good' : 'warn'}
          />
          <KpiMini label="План выручки" value={fmtAmd(data.planFactDay.plannedRevenueAmd)} />
          <KpiMini label="Факт выручки" value={fmtAmd(data.planFactDay.actualRevenueAmd)} />
          <KpiMini
            label="Отклонение выручки"
            value={fmtAmd(data.planFactDay.actualRevenueAmd - data.planFactDay.plannedRevenueAmd)}
            tone={data.planFactDay.actualRevenueAmd >= data.planFactDay.plannedRevenueAmd ? 'good' : 'danger'}
          />
          <KpiMini label="План прибыли" value={fmtAmd(data.planFactDay.plannedProfitAmd)} />
          <KpiMini label="Факт прибыли" value={fmtAmd(data.planFactDay.actualProfitAmd)} />
          <KpiMini
            label="Отклонение прибыли"
            value={fmtAmd(data.planFactDay.actualProfitAmd - data.planFactDay.plannedProfitAmd)}
            tone={data.planFactDay.actualProfitAmd >= data.planFactDay.plannedProfitAmd ? 'good' : 'danger'}
          />
        </div>
      </SectionCard>

      <SectionCard title="2) Долги с разбивкой по сроку просрочки" icon={<TimerReset className="h-4 w-4 text-amber-600" />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">Сегмент</th>
                <th className="px-3 py-2 text-right">ДЗ</th>
                <th className="px-3 py-2 text-right">КЗ</th>
                <th className="px-3 py-2 text-right">Заявок</th>
              </tr>
            </thead>
            <tbody>
              {data.overdueBuckets.map((b) => (
                <tr key={b.bucket} className="border-b last:border-none">
                  <td className={`px-3 py-2 font-medium ${overdueTone(b)}`}>{b.label}</td>
                  <td className="px-3 py-2 text-right">{fmtAmd(b.clientDebtAmd)}</td>
                  <td className="px-3 py-2 text-right">{fmtAmd(b.carrierDebtAmd)}</td>
                  <td className="px-3 py-2 text-right">{b.tripCount}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/20 font-semibold">
                <td className="px-3 py-2">Итого</td>
                <td className="px-3 py-2 text-right">{fmtAmd(overdueTotals.clientDebtAmd)}</td>
                <td className="px-3 py-2 text-right">{fmtAmd(overdueTotals.carrierDebtAmd)}</td>
                <td className="px-3 py-2 text-right">{overdueTotals.tripCount}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="3) Денежный поток (ожидаемые/фактические)" icon={<CircleDollarSign className="h-4 w-4 text-emerald-600" />}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <KpiMini label="Ожидаемые входящие" value={fmtAmd(data.cashFlow.expectedIncomingAmd)} tone="good" />
          <KpiMini label="Фактические входящие" value={fmtAmd(data.cashFlow.actualIncomingAmd)} tone="good" />
          <KpiMini
            label="Отклонение входящих"
            value={fmtAmd(data.cashFlow.actualIncomingAmd - data.cashFlow.expectedIncomingAmd)}
            tone={data.cashFlow.actualIncomingAmd >= data.cashFlow.expectedIncomingAmd ? 'good' : 'warn'}
          />
          <KpiMini label="Ожидаемые исходящие" value={fmtAmd(data.cashFlow.expectedOutgoingAmd)} tone="warn" />
          <KpiMini label="Фактические исходящие" value={fmtAmd(data.cashFlow.actualOutgoingAmd)} tone="warn" />
          <KpiMini
            label="Отклонение исходящих"
            value={fmtAmd(data.cashFlow.actualOutgoingAmd - data.cashFlow.expectedOutgoingAmd)}
            tone={data.cashFlow.actualOutgoingAmd <= data.cashFlow.expectedOutgoingAmd ? 'good' : 'danger'}
          />
          <KpiMini label="Чистый поток ожидаемый" value={fmtAmd(data.cashFlow.netExpectedAmd)} tone={data.cashFlow.netExpectedAmd >= 0 ? 'good' : 'danger'} />
          <KpiMini label="Чистый поток фактический" value={fmtAmd(data.cashFlow.netActualAmd)} tone={data.cashFlow.netActualAmd >= 0 ? 'good' : 'danger'} />
          <KpiMini
            label="Разница чистого потока"
            value={fmtAmd(data.cashFlow.netActualAmd - data.cashFlow.netExpectedAmd)}
            tone={data.cashFlow.netActualAmd >= data.cashFlow.netExpectedAmd ? 'good' : 'danger'}
          />
        </div>
      </SectionCard>

      <SectionCard title="4) Сводка собственный транспорт и экспедиция (день/неделя)" icon={<GitCompareArrows className="h-4 w-4 text-purple-600" />}>
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">День</h3>
            <SplitTable own={data.ownVsExpedition.day.ownTransport} expedition={data.ownVsExpedition.day.expedition} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Неделя</h3>
            <SplitTable own={data.ownVsExpedition.week.ownTransport} expedition={data.ownVsExpedition.week.expedition} />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
