'use client';
import { useEffect, useState, useCallback } from 'react';
import { UserCheck, Route, DollarSign, Gauge, TrendingUp, ChevronDown, ChevronUp, Package, Fuel, Zap } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface DriverAnalytics {
  driver: { id: string; fullName: string; phone: string | null; licenseNumber: string | null };
  totalTrips: number; completedTrips: number; totalRevenue: number; totalProfit: number;
  totalDistance: number; totalCargo: number; totalFuelCost: number;
  avgProfitPerTrip: number; avgDistancePerTrip: number;
  fuelEfficiency: number | null; profitPerKm: number; costPerTrip: number; totalFuelLiters: number;
  months: { month: string; trips: number; profit: number; distance: number }[];
}

export default function DriverAnalyticsPage() {
  const [data, setData] = useState<DriverAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/driver-analytics');
      const d = await res.json();
      setData(Array.isArray(d) ? d : []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalTrips = data.reduce((s, d) => s + d.totalTrips, 0);
  const totalProfit = data.reduce((s, d) => s + d.totalProfit, 0);
  const totalDistance = data.reduce((s, d) => s + d.totalDistance, 0);

  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-');
    const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
    return `${months[parseInt(mo)-1]} ${y.slice(2)}`;
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Аналитика водителей</h1>
        <p className="text-sm text-muted-foreground">Заявки, выручка, пробег и эффективность по каждому водителю</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Route className="w-3.5 h-3.5" />Всего заявок</div>
          <p className="text-xl font-bold font-mono">{totalTrips}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="w-3.5 h-3.5" />Общая прибыль</div>
          <p className="text-xl font-bold font-mono">{formatCurrency(totalProfit)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Gauge className="w-3.5 h-3.5" />Общий пробег</div>
          <p className="text-xl font-bold font-mono">{totalDistance.toLocaleString()} км</p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <UserCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Нет активных водителей с заявками</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((da, idx) => {
            const isExpanded = expandedId === da.driver.id;
            const rank = idx + 1;
            return (
              <div key={da.driver.id} className="bg-card rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition" onClick={() => setExpandedId(isExpanded ? null : da.driver.id)}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    rank === 1 ? 'bg-amber-100 text-amber-700' : rank === 2 ? 'bg-gray-100 text-gray-600' : rank === 3 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'
                  }`}>{rank}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{da.driver.fullName}</span>
                      {da.driver.phone && <span className="text-xs text-muted-foreground">{da.driver.phone}</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                      <span className="text-xs text-muted-foreground">{da.totalTrips} заявок</span>
                      <span className="text-xs font-mono text-emerald-600">{formatCurrency(da.totalProfit)}</span>
                      <span className="text-xs text-muted-foreground">{da.totalDistance.toLocaleString()} км</span>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>

                {isExpanded && (
                  <div className="border-t p-4 space-y-4">
                    {/* KPI grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">{"\u0412\u044B\u0440\u0443\u0447\u043A\u0430"}</div>
                        <p className="text-sm font-bold font-mono mt-0.5">{formatCurrency(da.totalRevenue)}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">{"\u0421\u0440. \u043F\u0440\u0438\u0431\u044B\u043B\u044C/\u0437\u0430\u044f\u0432\u043a\u0443"}</div>
                        <p className="text-sm font-bold font-mono mt-0.5">{formatCurrency(da.avgProfitPerTrip)}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">{"\u0421\u0440. \u043F\u0440\u043E\u0431\u0435\u0433/\u0437\u0430\u044f\u0432\u043a\u0443"}</div>
                        <p className="text-sm font-bold font-mono mt-0.5">{da.avgDistancePerTrip.toLocaleString()} {"\u043A\u043C"}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">{"\u0413\u0440\u0443\u0437 (\u0442\u043E\u043D\u043D)"}</div>
                        <p className="text-sm font-bold font-mono mt-0.5">{Number(da.totalCargo).toFixed(1)}</p>
                      </div>
                    </div>
                    {/* Driver KPI */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {da.fuelEfficiency != null && (
                        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground flex items-center gap-1"><Fuel className="w-3 h-3" /> {"\u0420\u0430\u0441\u0445\u043E\u0434 \u0442\u043E\u043F\u043B."}</div>
                          <p className="text-sm font-bold font-mono mt-0.5">{da.fuelEfficiency} {"\u043B/100\u043A\u043C"}</p>
                        </div>
                      )}
                      <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {"\u041F\u0440\u0438\u0431\u044B\u043B\u044C/\u043A\u043C"}</div>
                        <p className="text-sm font-bold font-mono mt-0.5">{da.profitPerKm} {"\u058F"}</p>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" /> {"\u0417\u0430\u0442\u0440. \u0442\u043E\u043F\u043B./\u0437\u0430\u044f\u0432\u043a\u0443"}</div>
                        <p className="text-sm font-bold font-mono mt-0.5">{formatCurrency(da.costPerTrip)}</p>
                      </div>
                      {da.totalFuelLiters > 0 && (
                        <div className="bg-muted/50 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground">{"\u0412\u0441\u0435\u0433\u043E \u0442\u043E\u043F\u043B\u0438\u0432\u043E"}</div>
                          <p className="text-sm font-bold font-mono mt-0.5">{da.totalFuelLiters} L</p>
                        </div>
                      )}
                    </div>

                    {/* Monthly breakdown */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2">По месяцам (6 мес.)</h4>
                      <div className="grid grid-cols-6 gap-2">
                        {da.months.map(m => {
                          const maxTrips = Math.max(...da.months.map(mm => mm.trips), 1);
                          const pct = (m.trips / maxTrips) * 100;
                          return (
                            <div key={m.month} className="text-center">
                              <div className="h-16 relative flex items-end justify-center mb-1">
                                <div className="w-full max-w-[28px] bg-primary/20 rounded-t" style={{ height: `${Math.max(pct, 4)}%` }}>
                                  {m.trips > 0 && <div className="absolute inset-x-0 top-0 text-[10px] font-bold text-primary">{m.trips}</div>}
                                </div>
                              </div>
                              <div className="text-[10px] text-muted-foreground">{monthLabel(m.month)}</div>
                              <div className="text-[10px] font-mono">{m.profit > 0 ? '+' : ''}{Math.round(m.profit / 1000)}к</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
