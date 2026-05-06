'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Pencil, Trash2, Loader2, Filter, X, Download, Car, Wallet } from 'lucide-react';
import { formatCurrency, formatDate, FLEET_EXPENSE_TYPE_MAP } from '@/lib/utils';

const CURRENCIES = ['AMD', 'RUB', 'USD', 'GEL', 'EUR'];

interface Vehicle { id: string; plateNumber: string; brand: string; model: string }
interface VTRef { id: string; tripNumber: string }
interface FleetExpense {
  id: string;
  date: string;
  vehicleId: string;
  vehicle: Vehicle;
  vehicleTripId: string | null;
  vehicleTrip: VTRef | null;
  expenseType: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  amountAmd: number;
  comment: string | null;
}

interface FormData {
  id?: string;
  date: string;
  vehicleId: string;
  vehicleTripId: string;
  expenseType: string;
  amount: string;
  currency: string;
  exchangeRate: string;
  comment: string;
}

const emptyForm = (): FormData => ({
  date: new Date().toISOString().slice(0, 10),
  vehicleId: '',
  vehicleTripId: '',
  expenseType: 'salary',
  amount: '',
  currency: 'AMD',
  exchangeRate: '1',
  comment: '',
});

export default function FleetExpensesPage() {
  const searchParams = useSearchParams();
  const urlVehicleTripId = searchParams?.get('vehicleTripId') || '';

  const [rows, setRows] = useState<FleetExpense[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleTrips, setVehicleTrips] = useState<VTRef[]>([]);

  // Filters
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterVT, setFilterVT] = useState(urlVehicleTripId);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [deleting, setDeleting] = useState<string | null>(null);

  // Init dates to current month (skip if filtering by vehicleTrip)
  useEffect(() => {
    if (urlVehicleTripId) return; // don't limit dates when filtering by VT
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    setDateFrom(`${y}-${m}-01`);
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    setDateTo(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
  }, [urlVehicleTripId]);

  // Load vehicles + vehicle trips
  useEffect(() => {
    fetch('/api/vehicles').then(r => r.json()).then(d => {
      const list = Array.isArray(d) ? d : d.vehicles || [];
      setVehicles(list);
    }).catch(() => {});
    fetch('/api/vehicle-trips').then(r => r.json()).then(d => {
      setVehicleTrips((Array.isArray(d) ? d : []).map((vt: any) => ({ id: vt.id, tripNumber: vt.tripNumber })));
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterVehicle) params.set('vehicleId', filterVehicle);
    if (filterType) params.set('expenseType', filterType);
    if (filterVT) params.set('vehicleTripId', filterVT);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    try {
      const res = await fetch(`/api/fleet-expenses?${params}`);
      const data = await res.json();
      setRows(data.rows || []);
      setTotals(data.totals || {});
      setGrandTotal(data.grandTotal || 0);
    } catch { /* */ }
    setLoading(false);
  }, [filterVehicle, filterType, filterVT, dateFrom, dateTo]);

  useEffect(() => {
    // load immediately if filtering by VT (no date needed), or when dates are set
    if (filterVT || (dateFrom && dateTo)) load();
  }, [load, dateFrom, dateTo, filterVT]);

  const computedAmountAmd = useMemo(() => {
    const amt = parseFloat(form.amount) || 0;
    const rate = parseFloat(form.exchangeRate) || 1;
    if (form.currency === 'AMD') return amt;
    return Math.round(amt * rate * 100) / 100;
  }, [form.amount, form.currency, form.exchangeRate]);

  const openNew = () => {
    const f = emptyForm();
    if (filterVT) f.vehicleTripId = filterVT;
    setForm(f);
    setShowModal(true);
  };

  const openEdit = (r: FleetExpense) => {
    setForm({
      id: r.id,
      date: r.date?.slice(0, 10) || '',
      vehicleId: r.vehicleId,
      vehicleTripId: r.vehicleTripId || '',
      expenseType: r.expenseType,
      amount: String(Number(r.amount)),
      currency: r.currency,
      exchangeRate: String(Number(r.exchangeRate)),
      comment: r.comment || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.vehicleId || !form.date || !form.amount) return;
    setSaving(true);
    const method = form.id ? 'PUT' : 'POST';
    await fetch('/api/fleet-expenses', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowModal(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить расход?')) return;
    setDeleting(id);
    await fetch(`/api/fleet-expenses?id=${id}`, { method: 'DELETE' });
    setDeleting(null);
    load();
  };

  const exportCsv = () => {
    const hdr = ['Дата', 'Машина', 'Тип', 'Сумма', 'Валюта', 'Курс', 'Сумма AMD', 'Комментарий'];
    const lines = rows.map(r => [
      formatDate(r.date),
      r.vehicle?.plateNumber || '',
      FLEET_EXPENSE_TYPE_MAP[r.expenseType] || r.expenseType,
      Number(r.amount),
      r.currency,
      Number(r.exchangeRate),
      Number(r.amountAmd),
      r.comment || '',
    ].join('\t'));
    const csv = [hdr.join('\t'), ...lines].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fleet_expenses.csv';
    a.click();
  };

  const fmtAmd = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ֏`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Расходы автопарка</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Учёт расходов по собственным машинам (не привязан к заявкам)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 text-xs border rounded-lg hover:bg-muted transition-colors">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button type="button" onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Добавить
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 bg-muted/40 rounded-xl p-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Период</label>
          <div className="flex gap-1.5 mt-0.5">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs w-[130px]" />
            <span className="text-xs self-center">—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs w-[130px]" />
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Машина</label>
          <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs mt-0.5 block w-[160px]">
            <option value="">Все</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber} ({v.brand})</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Рейс машины</label>
          <select value={filterVT} onChange={e => setFilterVT(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs mt-0.5 block w-[130px]">
            <option value="">Все</option>
            {vehicleTrips.map(vt => <option key={vt.id} value={vt.id}>{vt.tripNumber}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Тип расхода</label>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs mt-0.5 block w-[160px]">
            <option value="">Все</option>
            {Object.entries(FLEET_EXPENSE_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">ИТОГО</p>
          <p className="text-lg font-bold font-mono mt-1">{fmtAmd(grandTotal)}</p>
        </div>
        {Object.entries(FLEET_EXPENSE_TYPE_MAP).map(([key, label]) => (
          <div key={key} className="rounded-xl border bg-card p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-base font-bold font-mono mt-1">{fmtAmd(totals[key] || 0)}</p>
            {grandTotal > 0 && <p className="text-[9px] text-muted-foreground">{Math.round(((totals[key] || 0) / grandTotal) * 100)}%</p>}
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Wallet className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Нет расходов за выбранный период</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="py-2.5 px-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground">Дата</th>
                <th className="py-2.5 px-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground">Машина</th>
                <th className="py-2.5 px-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Рейс</th>
                <th className="py-2.5 px-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground">Тип</th>
                <th className="py-2.5 px-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground">Сумма</th>
                <th className="py-2.5 px-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Сумма AMD</th>
                <th className="py-2.5 px-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground hidden md:table-cell">Комментарий</th>
                <th className="py-2.5 px-3 text-center text-[10px] uppercase tracking-wider text-muted-foreground w-20"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 px-3 text-xs whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="py-2.5 px-3 text-xs">
                    <span className="font-medium">{r.vehicle?.plateNumber}</span>
                    <span className="text-muted-foreground ml-1 text-[10px]">{r.vehicle?.brand} {r.vehicle?.model}</span>
                  </td>
                  <td className="py-2.5 px-3 text-xs hidden lg:table-cell">
                    {r.vehicleTrip ? <span className="font-mono text-[10px] text-primary">{r.vehicleTrip.tripNumber}</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-xs">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {FLEET_EXPENSE_TYPE_MAP[r.expenseType] || r.expenseType}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-right font-mono whitespace-nowrap">
                    {Number(r.amount).toLocaleString('ru-RU')} {r.currency === 'AMD' ? '֏' : r.currency === 'RUB' ? '₽' : '$'}
                    {r.currency !== 'AMD' && <span className="text-muted-foreground text-[9px] ml-1">(×{Number(r.exchangeRate)})</span>}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-right font-mono whitespace-nowrap hidden sm:table-cell font-medium">{fmtAmd(Number(r.amountAmd))}</td>
                  <td className="py-2.5 px-3 text-xs text-muted-foreground hidden md:table-cell max-w-[200px] truncate">{r.comment || '—'}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Редактировать">
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Удалить">
                        {deleting === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/20">
                <td colSpan={5} className="py-2.5 px-3 text-xs text-right font-medium">ИТОГО ({rows.length}):</td>
                <td className="py-2.5 px-3 text-xs text-right font-mono font-bold hidden sm:table-cell">{fmtAmd(grandTotal)}</td>
                <td className="hidden md:table-cell"></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{form.id ? 'Редактировать расход' : 'Новый расход'}</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Дата *</label>
                <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Машина *</label>
                <select value={form.vehicleId} onChange={e => setForm({...form, vehicleId: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5">
                  <option value="">Выберите…</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber} — {v.brand} {v.model}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Рейс машины</label>
              <select value={form.vehicleTripId} onChange={e => setForm({...form, vehicleTripId: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5">
                <option value="">— без рейса —</option>
                {vehicleTrips.map(vt => <option key={vt.id} value={vt.id}>{vt.tripNumber}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Тип расхода *</label>
              <select value={form.expenseType} onChange={e => setForm({...form, expenseType: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5">
                {Object.entries(FLEET_EXPENSE_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Сумма *</label>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Валюта</label>
                <select value={form.currency} onChange={e => setForm({...form, currency: e.target.value, exchangeRate: e.target.value === 'AMD' ? '1' : form.exchangeRate})} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Курс к AMD</label>
                <input type="number" step="0.0001" min="0" value={form.exchangeRate} onChange={e => setForm({...form, exchangeRate: e.target.value})} disabled={form.currency === 'AMD'} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5 disabled:opacity-50" />
              </div>
            </div>

            {form.currency !== 'AMD' && parseFloat(form.amount) > 0 && (
              <p className="text-xs text-blue-600 font-medium">→ {fmtAmd(computedAmountAmd)}</p>
            )}

            <div>
              <label className="text-xs text-muted-foreground">Комментарий</label>
              <textarea value={form.comment} onChange={e => setForm({...form, comment: e.target.value})} rows={2} className="border rounded-lg px-3 py-2 text-sm w-full mt-0.5" placeholder="Необязательно" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Отмена</button>
              <button type="button" onClick={handleSave} disabled={saving || !form.vehicleId || !form.date || !form.amount}
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (form.id ? 'Сохранить' : 'Добавить')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
