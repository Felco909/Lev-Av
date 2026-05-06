'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import CrumbLink from '@/components/nav/crumb-link';
import { ChevronLeft, ChevronRight, Truck, Building2, Wallet } from 'lucide-react';
import { STATUS_MAP, TRIP_TYPE_MAP, formatCurrency } from '@/lib/utils';

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

interface CalendarTrip {
  id: string;
  tripNumber: string;
  routeFrom: string;
  routeTo: string;
  tripType: string;
  status: string;
  tripDate: string;
  clientRate: number;
  profit: number;
  clientName: string;
  vehiclePlate?: string;
  driverName?: string;
  carrierName?: string;
  paymentDueDate?: string | null;
  clientPaymentStatus?: string;
  isPaymentDueEntry?: boolean;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [trips, setTrips] = useState<CalendarTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const month = `${currentDate.year}-${String(currentDate.month).padStart(2, '0')}`;
      const res = await fetch(`/api/trips/calendar?month=${month}`);
      const data = await res.json();
      setTrips(Array.isArray(data) ? data : []);
    } catch {}
    finally { setLoading(false); }
  }, [currentDate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelectedDay(null); }, [currentDate]);

  const prev = () => setCurrentDate(p => p.month === 1 ? { year: p.year - 1, month: 12 } : { ...p, month: p.month - 1 });
  const next = () => setCurrentDate(p => p.month === 12 ? { year: p.year + 1, month: 1 } : { ...p, month: p.month + 1 });

  // Build calendar grid
  const firstDay = new Date(currentDate.year, currentDate.month - 1, 1);
  const daysInMonth = new Date(currentDate.year, currentDate.month, 0).getDate();
  let startDow = firstDay.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // convert to Mon=0

  const tripsByDay: Record<number, CalendarTrip[]> = {};
  for (const t of trips) {
    if (t.isPaymentDueEntry && t.paymentDueDate) {
      const d = new Date(t.paymentDueDate).getDate();
      if (!tripsByDay[d]) tripsByDay[d] = [];
      tripsByDay[d].push(t);
    } else {
      const d = new Date(t.tripDate).getDate();
      if (!tripsByDay[d]) tripsByDay[d] = [];
      tripsByDay[d].push(t);
      // Also add to payment due day if in same month
      if (t.paymentDueDate) {
        const pd = new Date(t.paymentDueDate);
        if (pd.getFullYear() === currentDate.year && pd.getMonth() + 1 === currentDate.month) {
          const dd = pd.getDate();
          if (dd !== d) {
            if (!tripsByDay[dd]) tripsByDay[dd] = [];
            tripsByDay[dd].push({ ...t, isPaymentDueEntry: true });
          }
        }
      }
    }
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedTrips = selectedDay ? tripsByDay[selectedDay] || [] : [];

  const statusDotColor: Record<string, string> = {
    new: 'bg-blue-500',
    in_progress: 'bg-amber-500',
    unloaded: 'bg-purple-500',
    completed: 'bg-green-500',
    paid: 'bg-emerald-500',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Календарь заявок</h1>
        <p className="text-sm text-muted-foreground">Визуальный обзор заявок по дням</p>
      </div>

      <div className="bg-card rounded-xl shadow-sm">
        {/* Month nav */}
        <div className="flex items-center justify-between p-4 border-b">
          <button onClick={prev} className="p-2 hover:bg-muted rounded-lg transition"><ChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-base font-display font-bold">{MONTH_NAMES[currentDate.month - 1]} {currentDate.year}</h2>
          <button onClick={next} className="p-2 hover:bg-muted rounded-lg transition"><ChevronRight className="w-5 h-5" /></button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b">
          {DAY_NAMES.map(d => (
            <div key={d} className="text-center py-2 text-xs font-medium text-muted-foreground">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="h-80 flex items-center justify-center"><div className="animate-pulse text-sm text-muted-foreground">Загрузка...</div></div>
        ) : (
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const dayTrips = day ? tripsByDay[day] || [] : [];
              const isSelected = day === selectedDay;
              const isToday = day && currentDate.year === new Date().getFullYear() && currentDate.month === new Date().getMonth() + 1 && day === new Date().getDate();
              return (
                <div
                  key={i}
                  onClick={() => day && dayTrips.length > 0 && setSelectedDay(day)}
                  className={`min-h-[80px] lg:min-h-[100px] border-b border-r p-1.5 transition-colors ${
                    !day ? 'bg-muted/30' : dayTrips.length > 0 ? 'cursor-pointer hover:bg-primary/5' : ''
                  } ${isSelected ? 'bg-primary/10 ring-2 ring-primary/30 ring-inset' : ''}`}
                >
                  {day && (
                    <>
                      <span className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${
                        isToday ? 'bg-primary text-white' : 'text-foreground'
                      }`}>{day}</span>
                      <div className="mt-1 space-y-0.5">
                        {dayTrips.slice(0, 3).map((t, ti) => (
                          <div key={`${t.id}-${ti}`} className="flex items-center gap-1">
                            {t.isPaymentDueEntry ? (
                              <Wallet className="w-2.5 h-2.5 shrink-0 text-red-500" />
                            ) : (
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotColor[t.status] || 'bg-gray-400'}`} />
                            )}
                            <span className={`text-[10px] truncate leading-tight ${t.isPaymentDueEntry ? 'text-red-600 font-medium' : ''}`}>
                              {t.isPaymentDueEntry ? `₽ ${t.tripNumber}` : `${t.routeFrom}→${t.routeTo}`}
                            </span>
                          </div>
                        ))}
                        {dayTrips.length > 3 && <span className="text-[10px] text-muted-foreground">+{dayTrips.length - 3}</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        {Object.entries(STATUS_MAP).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${statusDotColor[key] || 'bg-gray-400'}`} />
            <span className="text-muted-foreground">{val.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <Wallet className="w-2.5 h-2.5 text-red-500" />
          <span className="text-muted-foreground">Срок оплаты</span>
        </div>
      </div>

      {/* Selected day trips */}
      {selectedDay && selectedTrips.length > 0 && (
        <div className="bg-card rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold mb-3">{selectedDay} {MONTH_NAMES[currentDate.month - 1]} — {selectedTrips.length} заявок</h3>
          <div className="space-y-2">
            {selectedTrips.map((t, ti) => {
              const si = STATUS_MAP[t.status] ?? { label: t.status, color: 'bg-gray-100 text-gray-700' };
              return (
                <CrumbLink key={`${t.id}-${ti}`} href={`/trips/${t.id}`} fromLabel="Календарь" fromKey="calendar" className={`flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition group ${t.isPaymentDueEntry ? 'border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/40' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-primary font-medium">{t.tripNumber}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${si.color}`}>{si.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${t.tripType === 'own_transport' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{TRIP_TYPE_MAP[t.tripType]}</span>
                      {t.isPaymentDueEntry && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1"><Wallet className="w-2.5 h-2.5" />Срок оплаты</span>}
                    </div>
                    <p className="text-sm mt-1">{t.routeFrom} → {t.routeTo}</p>
                    <p className="text-xs text-muted-foreground">{t.clientName}{t.driverName ? ` • ${t.driverName}` : ''}{t.carrierName ? ` • ${t.carrierName}` : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Ставка: {formatCurrency(t.clientRate)}</p>
                    <p className={`text-sm font-mono font-bold ${t.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(t.profit)}</p>
                  </div>
                </CrumbLink>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
