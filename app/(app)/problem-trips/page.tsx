'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface TripRow { id: string; tripNumber: string; entityName: string; remaining?: number; daysOverdue?: number; gapAmd?: number; }
interface IdleVehicleRow { vehicleId: string; plateNumber: string; daysIdle: number; }
interface StuckTripRow { vehicleTripId: string; vehicleId: string; plateNumber: string; tripNumber: string; daysOpen: number; }

interface ProblemTripsData {
  counts: { critical: number; warning: number; info: number };
  overdueClientPayments: TripRow[];
  overdueCarrierPayments: TripRow[];
  cashGapTrips: TripRow[];
  noInvoiceActTrips: TripRow[];
  noAttachmentTrips: TripRow[];
  idleVehicles: IdleVehicleRow[];
  stuckVehicleTrips: StuckTripRow[];
}

function Section({ severity, title, hint, children, count }: { severity: 'crit' | 'warn' | 'info'; title: string; hint?: string; children: React.ReactNode; count: number }) {
  if (count === 0) return null;
  const dot = severity === 'crit' ? '🔴' : severity === 'warn' ? '🟡' : '🟢';
  const border = severity === 'crit' ? 'border-red-200' : severity === 'warn' ? 'border-amber-200' : 'border-emerald-200';
  return (
    <div className={`bg-card rounded-xl shadow-sm border ${border} overflow-hidden`}>
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{dot} {title} <span className="text-muted-foreground font-normal">({count})</span></h2>
          {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
        </div>
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

export default function ProblemTripsPage() {
  const [data, setData] = useState<ProblemTripsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/problem-trips');
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = data ? data.counts.critical + data.counts.warning + data.counts.info : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Проблемные рейсы</h1>
          <p className="text-sm text-muted-foreground">Сводка уже посчитанных проблем по заявкам и рейсам машин — в одном месте</p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-muted transition disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Обновить
        </button>
      </div>

      {loading && !data ? (
        <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
      ) : !data || total === 0 ? (
        <div className="bg-card rounded-xl shadow-sm p-10 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
          <p className="text-sm font-medium">Проблем не найдено</p>
          <p className="text-xs text-muted-foreground mt-1">Все заявки и рейсы машин — в норме</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 bg-card rounded-xl px-4 py-3 shadow-sm text-sm">
            {data.counts.critical > 0 && <span className="font-medium text-red-700">🔴 {data.counts.critical} критических</span>}
            {data.counts.warning > 0 && <span className="font-medium text-amber-700">🟡 {data.counts.warning} требуют внимания</span>}
            {data.counts.info > 0 && <span className="font-medium text-emerald-700">🟢 {data.counts.info} информационных</span>}
          </div>

          <Section severity="crit" title="Просроченные оплаты клиентов" count={data.overdueClientPayments.length}>
            {data.overdueClientPayments.map(r => (
              <Link key={r.id} href={`/trips/${r.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/30 transition">
                <span className="font-mono font-medium">№{r.tripNumber}</span>
                <span className="text-muted-foreground truncate max-w-[220px]">{r.entityName}</span>
                <span className="font-mono text-red-600">{formatCurrency(r.remaining)}</span>
                <span className="text-xs text-red-600">просрочка {r.daysOverdue} дн.</span>
              </Link>
            ))}
          </Section>

          <Section severity="crit" title="Просроченные выплаты перевозчикам" count={data.overdueCarrierPayments.length}>
            {data.overdueCarrierPayments.map(r => (
              <Link key={r.id} href={`/trips/${r.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/30 transition">
                <span className="font-mono font-medium">№{r.tripNumber}</span>
                <span className="text-muted-foreground truncate max-w-[220px]">{r.entityName}</span>
                <span className="font-mono text-red-600">{formatCurrency(r.remaining)}</span>
                <span className="text-xs text-red-600">просрочка {r.daysOverdue} дн.</span>
              </Link>
            ))}
          </Section>

          <Section severity="warn" title="Кассовые разрывы" hint="Перевозчику уже оплачено, клиент ещё не заплатил" count={data.cashGapTrips.length}>
            {data.cashGapTrips.map(r => (
              <Link key={r.id} href={`/trips/${r.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/30 transition">
                <span className="font-mono font-medium">№{r.tripNumber}</span>
                <span className="font-mono text-amber-600">{formatCurrency(r.gapAmd)}</span>
              </Link>
            ))}
          </Section>

          <Section severity="warn" title="Заявки без счёта/акта" count={data.noInvoiceActTrips.length}>
            {data.noInvoiceActTrips.map(r => (
              <Link key={r.id} href={`/trips/${r.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/30 transition">
                <span className="font-mono font-medium">№{r.tripNumber}</span>
                <span className="text-muted-foreground truncate max-w-[260px]">{r.entityName}</span>
              </Link>
            ))}
          </Section>

          <Section severity="warn" title="Заявки без вложений" count={data.noAttachmentTrips.length}>
            {data.noAttachmentTrips.map(r => (
              <Link key={r.id} href={`/trips/${r.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/30 transition">
                <span className="font-mono font-medium">№{r.tripNumber}</span>
                <span className="text-muted-foreground truncate max-w-[260px]">{r.entityName}</span>
              </Link>
            ))}
          </Section>

          <Section severity="info" title="Простаивающие машины" hint="Активны, но без рейса ≥5 дней" count={data.idleVehicles.length}>
            {data.idleVehicles.map(v => (
              <Link key={v.vehicleId} href={`/vehicles/${v.vehicleId}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/30 transition">
                <span className="font-mono font-medium">{v.plateNumber}</span>
                <span className="text-emerald-700">простой {v.daysIdle} дн.</span>
              </Link>
            ))}
          </Section>

          <Section severity="info" title="Аномально долгие рейсы машин" hint="Открыты (не закрыты) ≥14 дней" count={data.stuckVehicleTrips.length}>
            {data.stuckVehicleTrips.map(t => (
              <Link key={t.vehicleTripId} href={`/vehicle-trips?vehicleId=${t.vehicleId}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/30 transition">
                <span className="font-mono font-medium">{t.plateNumber} · №{t.tripNumber}</span>
                <span className="text-emerald-700">открыт {t.daysOpen} дн.</span>
              </Link>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}
