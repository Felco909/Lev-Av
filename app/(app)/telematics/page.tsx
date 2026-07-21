'use client';
import { useEffect, useState, useCallback } from 'react';
import { Satellite, Loader2, CheckCircle2, XCircle, RefreshCw, Trash2, Eye, EyeOff, WifiOff } from 'lucide-react';
import { getVehicleActivityStatus } from '@/lib/wialon/status';

interface ConfigStatus {
  configured: boolean;
  source: 'db' | 'env' | null;
  maskedToken: string | null;
}

interface TestResult {
  ok: boolean;
  authorizedAs?: string | null;
  unitsCount?: number;
  error?: string;
}

interface SyncResult {
  matched: Array<{ plateNumber: string; wialonUnitId: string; wialonName: string }>;
  alreadyLinked: Array<{ plateNumber: string; wialonUnitId: string }>;
  notFoundInWialon: Array<{ plateNumber: string }>;
  wialonUnits: Array<{ id: number; name: string }>;
}

interface FleetVehicle {
  vehicleId: string;
  plateNumber: string;
  brand: string;
  model: string;
  driverName: string | null;
  mileageKm: number | null;
  fuelLevelL: number | null;
  lat: number | null;
  lon: number | null;
  speedKmh: number | null;
  lastMessageAt: string | null;
}


function fmtAgo(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
}

export default function TelematicsPage() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [fleet, setFleet] = useState<FleetVehicle[]>([]);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [fleetError, setFleetError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    const res = await fetch('/api/wialon/config');
    if (res.ok) setStatus(await res.json());
    setStatusLoading(false);
  }, []);

  const loadFleet = useCallback(async () => {
    setFleetLoading(true);
    setFleetError(null);
    const res = await fetch('/api/wialon/fleet-snapshot');
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      setFleet(data.vehicles ?? []);
    } else {
      setFleetError(data?.error ?? 'Не удалось загрузить статус парка');
    }
    setFleetLoading(false);
  }, []);

  useEffect(() => { loadStatus(); loadFleet(); }, [loadStatus, loadFleet]);

  const saveToken = async () => {
    if (tokenInput.trim().length < 10) { setSaveError('Токен слишком короткий'); return; }
    setSaving(true);
    setSaveError(null);
    const res = await fetch('/api/wialon/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenInput.trim() }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { setSaveError(data?.error ?? 'Не удалось сохранить'); return; }
    setTokenInput('');
    setTestResult(null);
    await loadStatus();
  };

  const clearToken = async () => {
    if (!confirm('Удалить сохранённый в БД токен? Подключение переключится обратно на .env (если там задан).')) return;
    setSaving(true);
    await fetch('/api/wialon/config', { method: 'DELETE' });
    setSaving(false);
    await loadStatus();
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await fetch('/api/wialon/test-connection', { method: 'POST' });
    const data = await res.json().catch(() => ({ ok: false, error: 'Пустой ответ сервера' }));
    setTestResult(data);
    setTesting(false);
  };

  const syncVehicles = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    const res = await fetch('/api/wialon/sync-vehicles', { method: 'POST' });
    const data = await res.json().catch(() => null);
    setSyncing(false);
    if (!res.ok) { setSyncError(data?.error ?? 'Не удалось синхронизировать'); return; }
    setSyncResult(data);
    await loadFleet();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Satellite className="w-5 h-5" /> {'Телематика (Wialon)'}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{'Подключение, синхронизация машин и статус парка по GPS/топливным датчикам'}</p>
      </div>

      {/* Connection card */}
      <div className="bg-card rounded-xl border p-4 space-y-3">
        <h2 className="text-sm font-semibold">{'Подключение'}</h2>
        {statusLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> {'Загрузка статуса...'}</div>
        ) : status ? (
          <div className="text-sm flex items-center gap-2">
            {status.configured ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
            <span>
              {status.configured
                ? `Токен настроен (${status.maskedToken}), источник: ${status.source === 'db' ? 'сохранён в системе' : '.env файл сервера'}`
                : 'Токен не настроен'}
            </span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs text-muted-foreground">{'Новый API-токен Wialon'}</label>
            <div className="flex gap-1 mt-0.5">
              <input
                type={showToken ? 'text' : 'password'}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={'Вставьте токен из личного кабинета Wialon'}
                className="border rounded-lg px-3 py-2 text-sm w-full font-mono"
              />
              <button type="button" onClick={() => setShowToken((v) => !v)} className="p-2 border rounded-lg hover:bg-muted" title={showToken ? 'Скрыть' : 'Показать'}>
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button type="button" onClick={saveToken} disabled={saving || tokenInput.trim().length < 10}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить'}
          </button>
          {status?.source === 'db' && (
            <button type="button" onClick={clearToken} disabled={saving} className="px-3 py-2 text-sm border rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> {'Удалить'}
            </button>
          )}
        </div>
        {saveError && <p className="text-xs text-red-600">{saveError}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={testConnection} disabled={testing}
            className="px-3 py-1.5 text-xs border rounded-lg hover:bg-muted flex items-center gap-1.5 disabled:opacity-50">
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {'Проверить соединение'}
          </button>
          {testResult && (
            <span className={`text-xs flex items-center gap-1 ${testResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {testResult.ok
                ? `OK — авторизован как "${testResult.authorizedAs}", объектов в аккаунте: ${testResult.unitsCount}`
                : testResult.error}
            </span>
          )}
        </div>
      </div>

      {/* Sync card */}
      <div className="bg-card rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{'Синхронизация машин'}</h2>
          <button type="button" onClick={syncVehicles} disabled={syncing}
            className="px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50">
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {'Синхронизировать по гос.номеру'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{'Сопоставляет машины TMS с объектами Wialon по гос.номеру. Уже связанные машины не трогает, новых не создаёт.'}</p>
        {syncError && <p className="text-xs text-red-600">{syncError}</p>}
        {syncResult && (
          <div className="text-xs space-y-1">
            <p className="text-emerald-600">{'Сопоставлено: '}{syncResult.matched.length}{syncResult.matched.length > 0 && ' — ' + syncResult.matched.map((m) => `${m.plateNumber}→${m.wialonName}`).join(', ')}</p>
            <p className="text-muted-foreground">{'Уже было связано: '}{syncResult.alreadyLinked.length}</p>
            {syncResult.notFoundInWialon.length > 0 && (
              <p className="text-amber-600">{'Не найдены в Wialon (проверьте написание гос.номера): '}{syncResult.notFoundInWialon.map((v) => v.plateNumber).join(', ')}</p>
            )}
          </div>
        )}
      </div>

      {/* Fleet status */}
      <div className="bg-card rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{'Статус парка'}</h2>
          <button type="button" onClick={loadFleet} disabled={fleetLoading} className="p-1.5 rounded-lg hover:bg-muted" title={'Обновить'}>
            {fleetLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
        </div>
        {fleetError && <p className="text-xs text-red-600">{fleetError}</p>}
        {fleet.length === 0 && !fleetLoading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">{'Нет машин, связанных с Wialon — сначала выполните синхронизацию выше.'}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="py-2 px-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground">{'Машина'}</th>
                  <th className="py-2 px-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground">{'Водитель'}</th>
                  <th className="py-2 px-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground">{'Пробег'}</th>
                  <th className="py-2 px-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground">{'Топливо'}</th>
                  <th className="py-2 px-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground">{'Скорость'}</th>
                  <th className="py-2 px-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground">{'Координаты'}</th>
                  <th className="py-2 px-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground">{'Связь'}</th>
                </tr>
              </thead>
              <tbody>
                {fleet.map((v) => {
                  const activity = getVehicleActivityStatus(v.speedKmh, v.lastMessageAt);
                  const stale = activity === 'no_signal';
                  const moving = activity === 'moving';
                  return (
                    <tr key={v.vehicleId} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-1.5 px-3">
                        <span className="font-medium">{v.plateNumber}</span>
                        <span className="text-muted-foreground ml-1">{v.brand} {v.model}</span>
                      </td>
                      <td className="py-1.5 px-3">{v.driverName ?? '—'}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{v.mileageKm != null ? `${v.mileageKm.toLocaleString('ru-RU')} км` : '—'}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{v.fuelLevelL != null ? `${v.fuelLevelL} л` : '—'}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{v.speedKmh != null ? `${v.speedKmh} км/ч` : '—'}</td>
                      <td className="py-1.5 px-3 font-mono">{v.lat != null && v.lon != null ? `${v.lat.toFixed(4)}, ${v.lon.toFixed(4)}` : '—'}</td>
                      <td className="py-1.5 px-3">
                        {stale ? (
                          <span className="inline-flex items-center gap-1 text-slate-500"><WifiOff className="w-3 h-3" /> {'Нет связи'} ({fmtAgo(v.lastMessageAt)})</span>
                        ) : moving ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {'Движется'}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-blue-600"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {'Стоит'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
