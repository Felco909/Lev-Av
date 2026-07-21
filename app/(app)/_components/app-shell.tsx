'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Toaster } from 'sonner';
import { clearTrail } from '@/lib/nav-history';
import { useServerSync } from '@/hooks/use-server-sync';
import {
  LayoutDashboard, Route, Users, Car, UserCheck, Building2,
  Menu, X, LogOut, ChevronRight, ChevronDown, BarChart3, Settings, FolderOpen,
  CalendarDays, PieChart, Wrench, MapPinned, Fuel, ShieldAlert, UserCog, Bell,
  Search, Wallet, TrendingUp, Bot, Radar,
} from 'lucide-react';

function BrandMark({ variant }: { variant?: 'sidebar' | 'compact' }) {
  const titleCls =
    variant === 'compact'
      ? 'font-display font-bold text-xs tracking-tight text-white leading-none'
      : 'font-display font-bold text-[15px] sm:text-base tracking-tight text-white leading-none';
  const subCls =
    variant === 'compact'
      ? 'hidden'
      : 'mt-1 text-[10px] leading-snug text-slate-500 font-normal tracking-wide';
  return (
    <div className="min-w-0">
      <p className={titleCls}>
        <span className="tracking-[0.07em]">LEV</span>
        <span className="text-white/55">&</span>
        <span className="tracking-[0.07em]">AV</span>{' '}
        <span className="font-semibold text-slate-400">TMS</span>
      </p>
      {variant !== 'compact' && (
        <p className={subCls}>Fleet & Logistics Platform</p>
      )}
    </div>
  );
}

interface NavItem { href: string; label: string; icon: any; }
interface NavGroup { group: string; items: NavItem[]; }

const navGroups: NavGroup[] = [
  { group: 'Главное', items: [
    { href: '/dashboard', label: 'Главная', icon: LayoutDashboard },
    { href: '/day-tasks', label: 'Лист дня', icon: CalendarDays },
    { href: '/director-finance', label: 'Финансы директора', icon: PieChart },
    { href: '/daily-reports', label: 'Ежедневные отчёты', icon: BarChart3 },
    { href: '/trips', label: 'Заявки', icon: Route },
    { href: '/calendar', label: 'Календарь', icon: CalendarDays },
    { href: '/documents', label: 'Документы', icon: FolderOpen },
    { href: '/agents', label: 'Агенты', icon: Bot },
  ]},
  { group: 'Финансы', items: [
    { href: '/debts', label: 'Долги', icon: Wallet },
    { href: '/reports', label: 'Отчёты', icon: BarChart3 },
  ]},
  { group: 'Справочники', items: [
    { href: '/clients', label: 'Клиенты', icon: Users },
    { href: '/carriers', label: 'Перевозчики', icon: Building2 },
  ]},
  { group: 'Автопарк', items: [
    { href: '/vehicles', label: 'Машины', icon: Car },
    { href: '/drivers', label: 'Водители', icon: UserCheck },
    { href: '/vehicle-trips', label: 'Рейсы машин', icon: TrendingUp },
    { href: '/vehicle-analytics', label: 'Аналитика машин', icon: BarChart3 },
    { href: '/maintenance', label: 'Техобслуживание', icon: Wrench },
    { href: '/expiry', label: 'Сроки документов', icon: ShieldAlert },
  ]},
  { group: 'Телематика', items: [
    { href: '/telematics', label: 'Wialon', icon: MapPinned },
    { href: '/telematics/monitoring', label: 'Онлайн-мониторинг', icon: Radar },
  ]},
  { group: 'Система', items: [
    { href: '/settings', label: 'Настройки', icon: Settings },
  ]},
];

// flat list for mobile
const navFlat = navGroups.flatMap(g => g.items);

/* ── Global Search ── */
interface SearchResult { trips: any[]; clients: any[]; carriers: any[]; }

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (q.length < 2) { setResults(null); setShow(false); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => { setResults(d); setShow(true); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [q]);

  const go = (href: string) => { setShow(false); setQ(''); router.push(href); };

  const total = results ? (results.trips?.length || 0) + (results.clients?.length || 0) + (results.carriers?.length || 0) : 0;

  return (
    <div ref={ref} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          value={q} onChange={e => setQ(e.target.value)} onFocus={() => results && setShow(true)}
          placeholder="Поиск заявок, клиентов, перевозчиков..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-slate-400 focus:outline-none focus:border-primary/50 focus:bg-white/15 transition"
        />
        {loading && <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />}
      </div>
      {show && results && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto">
          {total === 0 ? (
            <p className="text-xs text-slate-400 p-3 text-center">Ничего не найдено</p>
          ) : (
            <>
              {results.trips?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 px-3 pt-2 pb-1">Заявки</p>
                  {results.trips.map((t: any) => (
                    <button key={t.id} onClick={() => go(`/trips/${t.id}`)}
                      className="w-full text-left px-3 py-1.5 hover:bg-white/10 transition flex items-center gap-2">
                      <Route className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-mono text-white">{t.tripNumber}</span>
                        <span className="text-[11px] text-slate-400 ml-2">{t.routeFrom} → {t.routeTo}</span>
                        {t.client?.name && <span className="text-[11px] text-slate-500 ml-2">({t.client.name})</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {results.clients?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 px-3 pt-2 pb-1">Клиенты</p>
                  {results.clients.map((c: any) => (
                    <button key={c.id} onClick={() => go(`/clients/${c.id}`)}
                      className="w-full text-left px-3 py-1.5 hover:bg-white/10 transition flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="text-xs text-white">{c.name}</span>
                      {c.phone && <span className="text-[11px] text-slate-500">{c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
              {results.carriers?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 px-3 pt-2 pb-1">Перевозчики</p>
                  {results.carriers.map((c: any) => (
                    <button key={c.id} onClick={() => go(`/carriers/${c.id}`)}
                      className="w-full text-left px-3 py-1.5 hover:bg-white/10 transition flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="text-xs text-white">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children, user }: { children: React.ReactNode; user: any }) {
  const [open, setOpen] = useState(false);
  const [bellCount, setBellCount] = useState(0);
  const [overduePayments, setOverduePayments] = useState<{id:string;tripNumber:string;clientName?:string;daysOverdue:number;remainingAmd:number}[]>([]);
  const [overdueTotal, setOverdueTotal] = useState(0);
  const [cashGaps, setCashGaps] = useState<{id:string;tripNumber:string;gapAmd:number}[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const pathname = usePathname() ?? '';
  const { state: syncState, lastOkAt } = useServerSync();

  useEffect(() => {
    fetch('/api/trips/stats').then(r => r.json()).then(d => {
      const overdue: any[] = d?.reminders?.overdueClientPayments ?? [];
      const gaps: any[] = d?.reminders?.cashGapTrips ?? [];
      setOverdueTotal(overdue.length);
      setOverduePayments(overdue.slice(0, 8));
      setCashGaps(gaps.slice(0, 5));
      setBellCount(overdue.length + gaps.length);
    }).catch(() => {});
  }, [pathname]);

  useEffect(() => {
    if (!bellOpen) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-bell-dropdown]')) setBellOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [bellOpen]);

  return (
    <div className="min-h-screen flex bg-background">
      <Toaster richColors closeButton position="top-right" />
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900 text-white min-h-screen sticky top-0 h-screen">
        <div className="p-5 flex items-start gap-3 border-b border-white/[0.08]">
          <div className="flex-1 min-w-0 pt-0.5">
            <BrandMark variant="sidebar" />
          </div>
          <div className="relative" data-bell-dropdown>
            <button onClick={() => setBellOpen(!bellOpen)} className="text-slate-400 hover:text-white p-1 relative" title="Уведомления">
              <Bell className="w-5 h-5" />
              {bellCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{bellCount}</span>
              )}
            </button>
            {bellOpen && (
              <div className="fixed left-4 top-[72px] w-[380px] max-w-[calc(100vw-32px)] max-h-[480px] overflow-y-auto bg-slate-800 border border-white/10 rounded-xl shadow-xl z-[200] p-3">
                {overduePayments.length === 0 && cashGaps.length === 0 ? (
                  <p className="text-xs text-slate-500 py-1">Нет срочных уведомлений</p>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {overduePayments.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide mb-1.5">🔴 Просроченные оплаты</p>
                        <div className="space-y-1">
                          {overduePayments.map(t => (
                            <Link key={t.id} href={`/trips/${t.id}`} onClick={() => setBellOpen(false)}
                              className="block text-xs p-2 rounded-lg hover:bg-white/10 transition">
                              <div className="flex justify-between items-center">
                                <span className="text-slate-300 truncate max-w-[150px]">{t.clientName || t.tripNumber}</span>
                                <span className="font-semibold text-red-400 shrink-0 ml-2">−{t.daysOverdue} дн.</span>
                              </div>
                              <div className="flex justify-between mt-0.5">
                                <span className="font-mono text-slate-500">{t.tripNumber}</span>
                                <span className="font-mono text-slate-300">{Math.round(t.remainingAmd).toLocaleString('ru-RU')} ֏</span>
                              </div>
                            </Link>
                          ))}
                          {overdueTotal > overduePayments.length && (
                            <Link href="/debts" onClick={() => setBellOpen(false)}
                              className="block text-[10px] text-red-400 text-center py-1 hover:underline">
                              и ещё {overdueTotal - overduePayments.length} просроченных →
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                    {cashGaps.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-1.5">🟠 Кассовые разрывы</p>
                        <div className="space-y-1">
                          {cashGaps.map(t => (
                            <Link key={t.id} href={`/trips/${t.id}`} onClick={() => setBellOpen(false)}
                              className="block text-xs p-2 rounded-lg hover:bg-white/10 transition">
                              <div className="flex justify-between items-center">
                                <span className="font-mono text-slate-300">{t.tripNumber}</span>
                                <span className="font-mono text-amber-400">{Math.round(t.gapAmd).toLocaleString('ru-RU')} ֏</span>
                              </div>
                              <span className="text-slate-500 text-[10px]">выплачено перевозчику, клиент не платил</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <Link href="/dashboard" onClick={() => setBellOpen(false)} className="block text-center text-xs text-primary mt-2 hover:underline">Все напоминания →</Link>
              </div>
            )}
          </div>
        </div>
        <div className="px-3 pt-2 pb-1">
          <GlobalSearch />
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navGroups.map((g, gi) => (
            <div key={gi}>
              {g.group && <p className="text-[10px] uppercase tracking-wider text-slate-500 mt-4 mb-1 px-3">{g.group}</p>}
              {g.items.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <Link key={item.href} href={item.href} onClick={clearTrail}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      active ? 'bg-primary text-white font-medium' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}>
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{user?.name ?? 'Пользователь'}</p>
              <p className="text-[11px] text-slate-400 truncate">{user?.email ?? ''}</p>
              <p className={`text-[10px] mt-1 ${syncState === 'online' ? 'text-emerald-400' : syncState === 'offline' ? 'text-red-400' : 'text-slate-500'}`}>
                {syncState === 'online'
                  ? `Связь с сервером OK${lastOkAt ? ` · ${new Date(lastOkAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                  : syncState === 'offline'
                    ? 'Нет связи с сервером'
                    : 'Проверка связи...'}
              </p>
            </div>
            <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-slate-400 hover:text-white p-1" title="Выход">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile + Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-40 bg-slate-900 text-white flex items-center justify-between px-4 py-3">
          <div className="flex items-center min-w-0">
            <BrandMark variant="compact" />
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="p-1 relative" title="Уведомления">
              <Bell className="w-5 h-5 text-slate-300" />
              {bellCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{bellCount}</span>
              )}
            </Link>
            <button onClick={() => setOpen(!open)} className="p-1">
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {open && (
          <div className="lg:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setOpen(false)}>
            <div className="bg-slate-900 w-64 h-full p-4 space-y-1" onClick={(e) => e?.stopPropagation?.()}>
              <div className="mb-4 pb-3 border-b border-white/[0.08]">
                <BrandMark variant="sidebar" />
              </div>
              {navGroups.map((g, gi) => (
                <div key={gi}>
                  {g.group && <p className="text-[10px] uppercase tracking-wider text-slate-500 mt-3 mb-1 px-3">{g.group}</p>}
                  {g.items.map((item) => {
                    const active = pathname === item.href || pathname?.startsWith(item.href + '/');
                    return (
                      <Link key={item.href} href={item.href} onClick={() => { clearTrail(); setOpen(false); }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          active ? 'bg-primary text-white font-medium' : 'text-slate-300 hover:bg-white/10'
                        }`}>
                        <item.icon className="w-4 h-4" />
                        {item.label}
                        {active && <ChevronRight className="w-3 h-3 ml-auto" />}
                      </Link>
                    );
                  })}
                </div>
              ))}
              <button onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-white/10 w-full mt-4">
                <LogOut className="w-4 h-4" /> Выход
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
