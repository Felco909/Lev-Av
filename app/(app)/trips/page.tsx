'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import CrumbLink from '@/components/nav/crumb-link';
import { useNavState } from '@/hooks/use-nav-state';
import { Plus, Search, Filter, Eye, ChevronLeft, ChevronRight, ArrowDown, ArrowUp, Layers, Archive } from 'lucide-react';
import { formatCurrency, formatDate, STATUS_MAP, TRIP_TYPE_MAP } from '@/lib/utils';

const PAGE_SIZE = 50;

type SortBy = 'tripDate' | 'createdAt';
type SortDir = 'asc' | 'desc';

type StatusGroupKey = 'new' | 'in_progress' | 'unloaded' | 'awaiting_payment' | 'sverka' | 'completed' | 'archived';

function getStatusGroupKey(status: string | null | undefined): StatusGroupKey {
  if (status === 'in_progress') return 'in_progress';
  if (status === 'unloaded') return 'unloaded';
  if (status === 'awaiting_payment') return 'awaiting_payment';
  if (status === 'sverka') return 'sverka';
  if (status === 'archived') return 'archived';
  if (status === 'completed' || status === 'paid') return 'completed';
  return 'new';
}

const GROUP_META: Record<StatusGroupKey, { label: string; color: string; dot: string }> = {
  new:              { label: 'Новая',      color: 'text-blue-700 bg-blue-50 border-blue-200',   dot: 'bg-blue-500' },
  in_progress:      { label: 'В пути',     color: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  unloaded:         { label: 'Разгружен',  color: 'text-orange-700 bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  awaiting_payment: { label: 'На оплату',  color: 'text-purple-700 bg-purple-50 border-purple-200', dot: 'bg-purple-500' },
  sverka:           { label: 'Сверка',     color: 'text-teal-700 bg-teal-50 border-teal-200',       dot: 'bg-teal-500' },
  completed:        { label: 'Завершённые', color: 'text-green-700 bg-green-50 border-green-200',  dot: 'bg-green-500' },
  archived:         { label: 'Архив',      color: 'text-slate-500 bg-slate-50 border-slate-200', dot: 'bg-slate-400' },
};


export default function TripsPage() {
  const [trips, setTrips] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Sorting state — default: newest first, group by status
  const [sortBy, setSortBy] = useState<SortBy>('tripDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [groupByStatus, setGroupByStatus] = useState<boolean>(true);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const load = useCallback(async (targetPage?: number) => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterStatus) params.set('status', filterStatus);
      if (showArchived && !filterStatus) params.set('showArchived', '1');
      if (filterType) params.set('tripType', filterType);
      if (filterClient) params.set('clientId', filterClient);
      if (filterPaymentStatus) params.set('paymentStatus', filterPaymentStatus);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
      params.set('groupByStatus', groupByStatus ? '1' : '0');
      params.set('page', String(targetPage ?? page));
      params.set('pageSize', String(PAGE_SIZE));
      const res = await fetch(`/api/trips?${params.toString()}`);
      const data = await res.json();
      if (data?.data && typeof data.totalCount === 'number') {
        setTrips(Array.isArray(data.data) ? data.data : []);
        setTotalCount(data.totalCount);
      } else {
        setTrips(Array.isArray(data) ? data : []);
        setTotalCount(Array.isArray(data) ? data.length : 0);
      }
    } catch {
      console.error('Failed to load trips');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterType, filterClient, filterPaymentStatus, dateFrom, dateTo, sortBy, sortDir, groupByStatus, showArchived, page]);

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(d => setClients(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // ═══ Navigation state preservation ═══
  const scrollRef = useRef(0);
  const skipResetRef = useRef(false);
  useNavState('trips',
    () => ({
      search, filterStatus, filterType, filterClient, filterPaymentStatus,
      dateFrom, dateTo, showFilters, showArchived, sortBy, sortDir, groupByStatus, page,
      scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
    }),
    (s) => {
      skipResetRef.current = true;
      if (s.search !== undefined) setSearch(s.search);
      if (s.filterStatus !== undefined) setFilterStatus(s.filterStatus);
      if (s.filterType !== undefined) setFilterType(s.filterType);
      if (s.filterClient !== undefined) setFilterClient(s.filterClient);
      if (s.filterPaymentStatus !== undefined) setFilterPaymentStatus(s.filterPaymentStatus);
      if (s.dateFrom !== undefined) setDateFrom(s.dateFrom);
      if (s.dateTo !== undefined) setDateTo(s.dateTo);
      if (s.showFilters !== undefined) setShowFilters(s.showFilters);
      if (s.showArchived !== undefined) setShowArchived(s.showArchived);
      if (s.sortBy) setSortBy(s.sortBy);
      if (s.sortDir) setSortDir(s.sortDir);
      if (typeof s.groupByStatus === 'boolean') setGroupByStatus(s.groupByStatus);
      if (typeof s.page === 'number') setPage(s.page);
      scrollRef.current = s.scrollY || 0;
    }
  );

  // Scroll restore after data loaded
  useEffect(() => {
    if (!loading && scrollRef.current > 0) {
      const y = scrollRef.current;
      scrollRef.current = 0;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [loading]);

  // When filters or sorting change, reset to page 1 (skip once after restore)
  useEffect(() => {
    if (skipResetRef.current) { skipResetRef.current = false; return; }
    setLoading(true); setPage(1);
  }, [search, filterStatus, filterType, filterClient, filterPaymentStatus, dateFrom, dateTo, sortBy, sortDir, groupByStatus, showArchived]);

  // When page changes, reload data
  useEffect(() => { setLoading(true); const t = setTimeout(() => load(page), 300); return () => clearTimeout(t); }, [page, load]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Group visible trips for grouped rendering (server already returns them in group + date order)
  const groups = useMemo(() => {
    if (!groupByStatus) return null;
    const byKey: Record<StatusGroupKey, any[]> = { new: [], in_progress: [], unloaded: [], awaiting_payment: [], sverka: [], completed: [], archived: [] };
    for (const t of trips ?? []) {
      const key = getStatusGroupKey(t?.status);
      byKey[key].push(t);
    }
    return byKey;
  }, [trips, groupByStatus]);

  const toggleDir = () => setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));

  const renderRow = (t: any) => {
    const statusInfo = STATUS_MAP[t?.status] ?? { label: t?.status, color: 'bg-gray-100 text-gray-700' };
    return (
      <tr key={t?.id} className="border-b border-muted last:border-0 hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3"><CrumbLink href={`/trips/${t?.id}`} fromLabel="Заявки" fromKey="trips" className="font-mono text-xs text-primary hover:underline">{t?.tripNumber ?? '—'}</CrumbLink></td>
        <td className="px-4 py-3 max-w-[150px]">
          <CrumbLink href={`/trips/${t?.id}`} fromLabel="Заявки" fromKey="trips" className="block hover:text-primary">
            <div className="truncate">{t?.client?.name ?? '—'}</div>
            {t?.contact?.name && <div className="text-[10px] text-muted-foreground truncate">{t.contact.name}</div>}
          </CrumbLink>
        </td>
        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{t?.routeFrom ?? ''} → {t?.routeTo ?? ''}</td>
        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{formatDate(sortBy === 'createdAt' ? t?.createdAt : t?.tripDate)}</td>
        <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${t?.tripType === 'own_transport' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{TRIP_TYPE_MAP[t?.tripType] ?? ''}</span></td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </td>
        <td className="px-4 py-3 hidden lg:table-cell">
          {(() => {
            const cps = t?.clientPaymentStatus || 'not_paid';
            const cpMap: Record<string, { label: string; color: string }> = {
              not_paid: { label: 'Не опл.', color: 'bg-red-100 text-red-700' },
              partially_paid: { label: 'Частично', color: 'bg-amber-100 text-amber-700' },
              paid: { label: 'Оплачено', color: 'bg-green-100 text-green-700' },
            };
            const cpInfo = cpMap[cps] || cpMap.not_paid;
            const paidAmd = Number(t?.clientPaidAmountAmd ?? 0);
            const totalAmd = Number(t?.clientRateAmd ?? t?.clientRate ?? 0);
            return (
              <div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap font-medium ${cpInfo.color}`}>{cpInfo.label}</span>
                {cps === 'partially_paid' && totalAmd > 0 && (
                  <div className="text-[9px] text-muted-foreground mt-0.5 font-mono">{Math.round(paidAmd).toLocaleString('ru-RU')}/{Math.round(totalAmd).toLocaleString('ru-RU')}</div>
                )}
              </div>
            );
          })()}
        </td>
        <td className="px-4 py-3 hidden lg:table-cell">
          {t?.tripType === 'expedition' ? (() => {
            const cps = t?.carrierPaymentStatus || 'not_paid';
            const cpMap: Record<string, { label: string; color: string }> = {
              not_paid: { label: 'Не опл.', color: 'bg-red-100 text-red-700' },
              partially_paid: { label: 'Частично', color: 'bg-amber-100 text-amber-700' },
              paid: { label: 'Оплачено', color: 'bg-green-100 text-green-700' },
            };
            const cpInfo = cpMap[cps] || cpMap.not_paid;
            const cashGap = t?.status !== 'paid' && (cps === 'paid' || Number(t?.carrierPaidAmount ?? 0) > 0);
            return (
              <div className="flex items-center gap-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap font-medium ${cpInfo.color}`}>{cpInfo.label}</span>
                {cashGap && <span className="text-red-500 text-[10px]" title="Кассовый разрыв">⚠</span>}
              </div>
            );
          })() : <span className="text-[10px] text-muted-foreground">&mdash;</span>}
        </td>
        <td className="px-4 py-3 text-right font-mono text-xs hidden sm:table-cell">{formatCurrency(t?.clientRateAmd ?? t?.clientRate)}</td>
        <td className={`px-4 py-3 text-right font-mono text-xs font-medium ${(t?.profitAmd ?? t?.profit ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(t?.profitAmd ?? t?.profit)}</td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <CrumbLink href={`/trips/${t?.id}`} fromLabel="Заявки" fromKey="trips" className="p-1.5 hover:bg-muted rounded-md transition" title="Открыть заявку"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></CrumbLink>
          </div>
        </td>
      </tr>
    );
  };

  const renderHeader = () => (
    <thead>
      <tr className="text-xs text-muted-foreground bg-muted/50">
        <th className="text-left px-4 py-3 font-medium">№ заявки</th>
        <th className="text-left px-4 py-3 font-medium">Клиент</th>
        <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Маршрут</th>
        <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">{sortBy === 'createdAt' ? 'Создана' : 'Дата'}</th>
        <th className="text-left px-4 py-3 font-medium">Тип</th>
        <th className="text-left px-4 py-3 font-medium">Статус</th>
        <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Оплата</th>
        <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Перевозчик</th>
        <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Ставка</th>
        <th className="text-right px-4 py-3 font-medium">Прибыль ֏</th>
        <th className="text-right px-4 py-3 font-medium">Действия</th>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Заявки</h1>
          <p className="text-sm text-muted-foreground">Просмотр всех заявок компании. Изменения доступны внутри заявки.</p>
        </div>
        <Link href="/trips/new" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition">
          <Plus className="w-4 h-4" /> Новая заявка
        </Link>
      </div>

      {/* Search + Filter Toggle */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Поиск по номеру, маршруту, клиенту, контакту..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-card" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-muted transition bg-card">
          <Filter className="w-4 h-4" /> Фильтры
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-card rounded-xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Статус</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="">Все</option>
              {Object.entries(STATUS_MAP).filter(([k]) => k !== 'paid').map(([k, v]) => <option key={k} value={k}>{v?.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Тип</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="">Все</option>
              {Object.entries(TRIP_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Клиент</label>
            <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="">Все</option>
              {(clients ?? []).map((c: any) => <option key={c?.id} value={c?.id}>{c?.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Оплата</label>
            <select value={filterPaymentStatus} onChange={(e) => setFilterPaymentStatus(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="">Все</option>
              <option value="not_paid">Не оплачено</option>
              <option value="partially_paid">Частично</option>
              <option value="paid">Оплачено</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Дата от</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Дата до</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
          </div>
        </div>
      )}

      {/* Sort controls — simple */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-muted-foreground">Сортировка:</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="border rounded-lg px-2.5 py-1.5 text-xs bg-card hover:bg-muted/50 transition"
          aria-label="Поле сортировки"
        >
          <option value="tripDate">по дате заявки</option>
          <option value="createdAt">по дате создания</option>
        </select>
        <button
          type="button"
          onClick={toggleDir}
          className="inline-flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 text-xs bg-card hover:bg-muted/50 transition"
          title={sortDir === 'desc' ? 'Новые сверху' : 'Старые сверху'}
        >
          {sortDir === 'desc' ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />}
          <span>{sortDir === 'desc' ? 'Новые сверху' : 'Старые сверху'}</span>
        </button>
        <button
          type="button"
          onClick={() => setGroupByStatus(v => !v)}
          className={`inline-flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 text-xs transition ${groupByStatus ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-card hover:bg-muted/50'}`}
          title={groupByStatus ? 'Группировка по статусу включена' : 'Группировка по статусу выключена'}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Группировать по статусу</span>
        </button>
        <button
          type="button"
          onClick={() => setShowArchived(v => !v)}
          className={`inline-flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 text-xs transition ${showArchived ? 'bg-slate-200 dark:bg-slate-700 border-slate-400 text-slate-700 dark:text-slate-200' : 'bg-card hover:bg-muted/50'}`}
          title={showArchived ? 'Архив показан' : 'Показать архив'}
        >
          <Archive className="w-3.5 h-3.5" />
          <span>{showArchived ? 'Скрыть архив' : 'Показать архив'}</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
          ) : (trips?.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Заявки не найдены</div>
          ) : groupByStatus && groups ? (
            <div className="divide-y">
              {(['new', 'in_progress', 'unloaded', 'awaiting_payment', 'sverka', 'completed', 'archived'] as const).map((gKey) => {
                const items = groups[gKey];
                if (!items || items.length === 0) return null;
                const meta = GROUP_META[gKey];
                return (
                  <div key={gKey}>
                    <div className={`flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30`}>
                      <span className={`inline-block w-2 h-2 rounded-full ${meta.dot}`} />
                      <span className={`text-xs font-semibold uppercase tracking-wide ${meta.color.split(' ')[0]}`}>{meta.label}</span>
                      <span className="text-[11px] text-muted-foreground">&bull; {items.length} шт.</span>
                    </div>
                    <table className="w-full text-sm">
                      {renderHeader()}
                      <tbody>
                        {items.map((t) => renderRow(t))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          ) : (
            <table className="w-full text-sm">
              {renderHeader()}
              <tbody>
                {(trips ?? []).map((t: any) => renderRow(t))}
              </tbody>
            </table>
          )}
        </div>
        {/* Pagination */}
        {!loading && totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-xs text-muted-foreground">Показано {(page - 1) * PAGE_SIZE + 1}&ndash;{Math.min(page * PAGE_SIZE, totalCount)} из {totalCount}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 transition"><ChevronLeft className="w-4 h-4" /></button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1).map((p, i, arr) => (
                <span key={p}>
                  {i > 0 && arr[i - 1] !== p - 1 && <span className="text-xs text-muted-foreground px-1">...</span>}
                  <button onClick={() => setPage(p)} className={`min-w-[28px] h-7 rounded-md text-xs font-medium transition ${p === page ? 'bg-primary text-white' : 'hover:bg-muted'}`}>{p}</button>
                </span>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 transition"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
