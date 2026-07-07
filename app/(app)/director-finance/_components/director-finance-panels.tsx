'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Building2,
  CircleDollarSign,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import type { DirectorFinanceResponse } from './types';

function fmtAmd(value: number): string {
  return `${Math.round(Number(value) || 0).toLocaleString('ru-RU')} ֏`;
}

function KpiCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone: 'green' | 'red' | 'blue' | 'purple' | 'amber';
}) {
  const toneCls: Record<typeof tone, string> = {
    green: 'border-emerald-300/70 bg-emerald-50 text-emerald-900',
    red: 'border-red-300/70 bg-red-50 text-red-900',
    blue: 'border-blue-300/70 bg-blue-50 text-blue-900',
    purple: 'border-purple-300/70 bg-purple-50 text-purple-900',
    amber: 'border-amber-300/70 bg-amber-50 text-amber-900',
  };
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneCls[tone]}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide">{title}</p>
      <p className="mt-2 text-2xl font-bold leading-none">{fmtAmd(value)}</p>
    </div>
  );
}

function SectionRow({ label, value, accent }: { label: string; value: number; accent?: 'good' | 'warn' | 'danger' }) {
  const cls =
    accent === 'good'
      ? 'text-emerald-600'
      : accent === 'danger'
      ? 'text-red-600'
      : accent === 'warn'
      ? 'text-amber-600'
      : 'text-foreground';

  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-none">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${cls}`}>{fmtAmd(value)}</span>
    </div>
  );
}

export function DirectorFinancePanels({ data }: { data: DirectorFinanceResponse }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <KpiCard title="Выручка" value={data.kpi.revenueAmd} tone="green" />
        <KpiCard title="Расходы" value={data.kpi.expenseAmd} tone="red" />
        <KpiCard title="Прибыль" value={data.kpi.profitAmd} tone={data.kpi.profitAmd >= 0 ? 'green' : 'red'} />
        <KpiCard title="ДЗ" value={data.kpi.clientDebtAmd} tone="blue" />
        <KpiCard title="КЗ" value={data.kpi.carrierDebtAmd} tone="purple" />
        <KpiCard title="Кассовый разрыв" value={data.kpi.cashGapAmd} tone={data.kpi.cashGapAmd > 0 ? 'amber' : 'green'} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Truck className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold">Собственный транспорт</h2>
          </div>
          <SectionRow label="Доход" value={data.ownTransport.incomeAmd} accent="good" />
          <SectionRow label="Расход" value={data.ownTransport.expenseAmd} accent="danger" />
          <SectionRow
            label="Прибыль"
            value={data.ownTransport.profitAmd}
            accent={data.ownTransport.profitAmd >= 0 ? 'good' : 'danger'}
          />
        </section>

        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-purple-600" />
            <h2 className="text-sm font-semibold">Экспедиция</h2>
          </div>
          <SectionRow label="Доход" value={data.expedition.incomeAmd} accent="good" />
          <SectionRow label="Расход" value={data.expedition.expenseAmd} accent="danger" />
          <SectionRow
            label="Прибыль"
            value={data.expedition.profitAmd}
            accent={data.expedition.profitAmd >= 0 ? 'good' : 'danger'}
          />
          <SectionRow label="ДЗ" value={data.expedition.clientDebtAmd} accent="warn" />
          <SectionRow label="КЗ" value={data.expedition.carrierDebtAmd} accent="warn" />
          <SectionRow label="Кассовый разрыв" value={data.expedition.cashGapAmd} accent={data.expedition.cashGapAmd > 0 ? 'danger' : 'good'} />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold">Риски сегодня</h3>
          </div>
          {data.risksToday.length === 0 ? (
            <p className="text-sm text-muted-foreground">На сегодня критичных рисков не выявлено.</p>
          ) : (
            <div className="space-y-2">
              {data.risksToday.map((r) => (
                <Link
                  key={r.id}
                  href={`/trips/${r.tripId}`}
                  className={`block rounded-lg border px-3 py-2 text-sm hover:bg-muted/40 ${
                    r.tone === 'danger' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.tripNumber}</span>
                    <span className="font-semibold">{fmtAmd(r.amountAmd)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.title}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold">Детализация по заявкам</h3>
          </div>
          {data.drillDown.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет заявок для детализации.</p>
          ) : (
            <div className="space-y-2">
              {data.drillDown.map((row) => (
                <Link key={row.tripId} href={`/trips/${row.tripId}`} className="block rounded-lg border px-3 py-2 hover:bg-muted/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{row.tripNumber}</span>
                    <span className={`text-xs font-semibold ${row.profitAmd >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {fmtAmd(row.profitAmd)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{row.route} • {row.clientName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                      <ArrowUpCircle className="h-3 w-3" /> ДЗ {fmtAmd(row.clientDebtAmd)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-purple-700">
                      <ArrowDownCircle className="h-3 w-3" /> КЗ {fmtAmd(row.carrierDebtAmd)}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                      row.cashGapAmd > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      <AlertTriangle className="h-3 w-3" /> разрыв {fmtAmd(row.cashGapAmd)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
