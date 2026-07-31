'use client';

import Link from 'next/link';
import { UserCog, ChevronRight, AlertTriangle, CheckCircle2, Truck } from 'lucide-react';
import { PanelShell } from './panel-shell';
import type { DirectorData } from './types';

function fmtAmd(v: number): string {
  return `${Math.round(v).toLocaleString('ru-RU')} ֏`;
}

function KpiTile({ label, value, borderClass, valueClass, href }: { label: string; value: string; borderClass: string; valueClass: string; href: string }) {
  return (
    <Link
      href={href}
      className={`rounded-lg border-l-4 bg-muted/30 p-2.5 transition hover:bg-muted/50 ${borderClass}`}
    >
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-bold ${valueClass}`}>{value}</p>
    </Link>
  );
}

export function DirectorPanel({
  data,
  isExpanded,
  isCollapsed,
  isDimmed,
  onToggleExpand,
  onToggleCollapse,
}: {
  data: DirectorData;
  isExpanded: boolean;
  isCollapsed: boolean;
  isDimmed: boolean;
  onToggleExpand: () => void;
  onToggleCollapse: () => void;
}) {
  const { kpi, attention } = data;
  return (
    <PanelShell
      icon={<UserCog className="h-4 w-4 text-purple-600" />}
      title="Директор"
      subtitle="Финансовый срез дня и риски"
      isExpanded={isExpanded}
      isCollapsed={isCollapsed}
      isDimmed={isDimmed}
      onToggleExpand={onToggleExpand}
      onToggleCollapse={onToggleCollapse}
    >
      <div className="grid grid-cols-2 gap-2">
        <KpiTile label="Доход" value={fmtAmd(kpi.incomeAmd)} borderClass="border-emerald-500" valueClass="text-emerald-700 dark:text-emerald-400" href="/dashboard" />
        <KpiTile label="Расход" value={fmtAmd(kpi.expenseAmd)} borderClass="border-red-500" valueClass="text-red-700 dark:text-red-400" href="/dashboard" />
        <KpiTile label="Прибыль" value={fmtAmd(kpi.profitAmd)} borderClass={kpi.profitAmd >= 0 ? 'border-emerald-500' : 'border-red-500'} valueClass={kpi.profitAmd >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'} href="/dashboard" />
        <KpiTile label="Кассовый разрыв" value={fmtAmd(kpi.cashGapAmd)} borderClass={kpi.cashGapAmd > 0 ? 'border-orange-500' : 'border-emerald-500'} valueClass={kpi.cashGapAmd > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-emerald-700'} href="/debts" />
        <KpiTile label="Дебиторка" value={fmtAmd(kpi.clientDebtAmd)} borderClass="border-blue-500" valueClass="text-blue-700 dark:text-blue-400" href="/debts" />
        <KpiTile label="Кредиторка" value={fmtAmd(kpi.carrierDebtAmd)} borderClass="border-purple-500" valueClass="text-purple-700 dark:text-purple-400" href="/debts" />
      </div>

      <div className="mt-1 flex items-center gap-4 rounded-lg bg-muted/30 px-3 py-2 text-xs">
        <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5 text-blue-600" /> В рейсе <b className="font-mono">{kpi.vehiclesOnTrip}</b></span>
        <span className="text-muted-foreground">Свободно <b className="font-mono text-foreground">{kpi.vehiclesFree}</b></span>
        <span className="text-muted-foreground">Всего <b className="font-mono text-foreground">{kpi.totalActiveVehicles}</b></span>
      </div>

      <div className="rounded-lg border p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Требует внимания {kpi.criticalEventsCount > 0 ? `(${kpi.criticalEventsCount})` : ''}
        </h3>
        {attention.length === 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Критичных рисков не выявлено
          </div>
        ) : (
          <div className="space-y-1">
            {attention.map((a) => (
              <Link
                key={a.key}
                href={a.href}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                <span className="flex-1 truncate">{a.label}</span>
                <span className="text-[11px] text-muted-foreground">× {a.count}</span>
                {a.amountAmd != null ? (
                  <span className="font-mono text-[11px] font-semibold text-red-600">{fmtAmd(a.amountAmd)}</span>
                ) : null}
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-60" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </PanelShell>
  );
}
