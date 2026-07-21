'use client';
import { useEffect, useState, useCallback } from 'react';
import { Car, Route, DollarSign, Gauge, TrendingUp, ChevronDown, ChevronUp, Fuel, Percent } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface VehicleAnalytics {
  vehicle: { id: string; plateNumber: string; brand: string; model: string };
  tripsCount: number;
  totalMileage: number;
  totalRevenue: number;
  totalExpenses: number;
  profit: number;
  totalFuelLiters: number;
  totalFuelCost: number;
  avgRevenuePerTrip: number;
  costPerKm: number;
  profitPerKm: number;
  profitability: number;
  months: { month: string; trips: number; mileage: number; profit: number }[];
}

export default function VehicleAnalyticsPage() {
  const [data, setData] = useState<VehicleAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/vehicle-analytics');
      const d = await res.json();
      setData(Array.isArray(d) ? d : []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalTrips = data.reduce((s, v) => s + v.tripsCount, 0);
  const totalRevenue = data.reduce((s, v) => s + v.totalRevenue, 0);
  const totalExpenses = data.reduce((s, v) => s + v.totalExpenses, 0);
  const totalProfit = data.reduce((s, v) => s + v.profit, 0);
  const totalMileage = data.reduce((s, v) => s + v.totalMileage, 0);
  const avgRevenuePerTrip = totalTrips > 0 ? Math.round(totalRevenue / totalTrips) : 0;

  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-');
    const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    return `${months[parseInt(mo) - 1]} ${y.slice(2)}`;
  };

  if (loading) return <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Аналитика машин</h1>
        <p className="text-sm text-muted-foreground">Рейсы, пробег, топливо и рентабельность по каждому автомобилю</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Route className="w-3.5 h-3.5" />Всего рейсов</div>
          <p className="text-xl font-bold font-mono">{totalTrips}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="w-3.5 h-3.5" />Общий доход</div>
          <p className="text-xl font-bold font-mono">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="w-3.5 h-3.5" />Общие расходы</div>
          <p className="text-xl font-bold font-mono">{formatCurrency(totalExpenses)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="w-3.5 h-3.5" />Общая прибыль</div>
          <p className="text-xl font-bold font-mono">{formatCurrency(totalProfit)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="w-3.5 h-3.5" />Средний доход/рейс</div>
          <p className="text-xl font-bold font-mono">{formatCurrency(avgRevenuePerTrip)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Gauge className="w-3.5 h-3.5" />Общий пробег</div>
          <p className="text-xl font-bold font-mono">{totalMileage.toLocaleString()} км</p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Car className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Нет машин в парке</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((va, idx) => {
            const isExpanded = expandedId === va.vehicle.id;
            const rank = idx + 1;
            return (
              <div key={va.vehicle.id} className="bg-card rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition" onClick={() => setExpandedId(isExpanded ? null : va.vehicle.id)}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    rank === 1 ? 'bg-amber-100 text-amber-700' : rank === 2 ? 'bg-gray-100 text-gray-600' : rank === 3 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'
                  }`}>{rank}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{va.vehicle.plateNumber}</span>
                      <span className="text-xs text-muted-foreground">{va.vehicle.brand} {va.vehicle.model}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                      <span className="text-xs text-muted-foreground">{va.tripsCount} рейсов</span>
                      <span className="text-xs font-mono text-emerald-600">{formatCurrency(va.profit)}</span>
                      <span className="text-xs text-muted-foreground">{va.totalMileage.toLocaleString()} км</span>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>

                {isExpanded && (
                  <div className="border-t p-4 space-y-4">
                    {/* Финансы */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Доход</div>
                        <p className="text-sm font-bold font-mono mt-0.5">{formatCurrency(va.totalRevenue)}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Расходы</div>
                        <p className="text-sm font-bold font-mono mt-0.5">{formatCurrency(va.totalExpenses)}</p>
                      </div>
                      <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Прибыль</div>
                        <p className="text-sm font-bold font-mono mt-0.5">{formatCurrency(va.profit)}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Средний доход/рейс</div>
                        <p className="text-sm font-bold font-mono mt-0.5">{formatCurrency(va.avgRevenuePerTrip)}</p>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground flex items-center gap-1"><Percent className="w-3 h-3" /> Рентабельность</div>
                        <p className="text-sm font-bold font-mono mt-0.5">{va.profitability}%</p>
                      </div>
                    </div>
                    {/* Пробег / топливо */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground flex items-center gap-1"><Gauge className="w-3 h-3" /> Пробег</div>
                        <p className="text-sm font-bold font-mono mt-0.5">{va.totalMileage.toLocaleString()} км</p>
                      </div>
                      {va.totalFuelLiters > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground flex items-center gap-1"><Fuel className="w-3 h-3" /> Расход топл.</div>
                          <p className="text-sm font-bold font-mono mt-0.5">{va.totalFuelLiters} л</p>
                        </div>
                      )}
                      {va.totalFuelCost > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground flex items-center gap-1"><Fuel className="w-3 h-3" /> Стоим. топл.</div>
                          <p className="text-sm font-bold font-mono mt-0.5">{formatCurrency(va.totalFuelCost)}</p>
                        </div>
                      )}
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Стоимость 1 км</div>
                        <p className="text-sm font-bold font-mono mt-0.5">{formatCurrency(va.costPerKm)}</p>
                      </div>
                      <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Прибыль на км</div>
                        <p className="text-sm font-bold font-mono mt-0.5">{formatCurrency(va.profitPerKm)}</p>
                      </div>
                    </div>

                    {/* Помесячно */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2">Пробег по месяцам (6 мес.)</h4>
                      <div className="grid grid-cols-6 gap-2">
                        {va.months.map(m => {
                          const maxMileage = Math.max(...va.months.map(mm => mm.mileage), 1);
                          const pct = (m.mileage / maxMileage) * 100;
                          return (
                            <div key={m.month} className="text-center">
                              <div className="h-16 relative flex items-end justify-center mb-1">
                                <div className="w-full max-w-[28px] bg-primary/20 rounded-t" style={{ height: `${Math.max(pct, 4)}%` }}>
                                  {m.trips > 0 && <div className="absolute inset-x-0 top-0 text-[10px] font-bold text-primary">{m.trips}</div>}
                                </div>
                              </div>
                              <div className="text-[10px] text-muted-foreground">{monthLabel(m.month)}</div>
                              <div className="text-[10px] font-mono">{m.mileage.toLocaleString()} км</div>
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
