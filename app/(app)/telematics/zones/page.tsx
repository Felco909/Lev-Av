'use client';
import { useEffect, useState, useCallback } from 'react';
import { MapPin, Loader2, RefreshCw } from 'lucide-react';

interface Zone { id: number; name: string; type: number; role: string | null }

const ROLE_LABEL: Record<string, string> = { garage: 'Гараж', loading: 'Погрузка', unloading: 'Выгрузка' };
const ZONE_TYPE_LABEL: Record<number, string> = { 1: 'Линия', 2: 'Полигон', 3: 'Круг' };

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch('/api/wialon/zones');
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      setZones(data.zones ?? []);
    } else {
      setError(data?.error ?? 'Не удалось загрузить геозоны');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setRole = async (zone: Zone, role: string | null) => {
    setSaving(zone.id);
    await fetch(`/api/wialon/zones/${zone.id}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoneName: zone.name, role }),
    });
    setSaving(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><MapPin className="w-5 h-5" /> Геозоны</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Зоны рисуются в веб-кабинете Wialon — здесь только назначаете роль (гараж/погрузка/выгрузка) для автосмены статуса рейса.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg hover:bg-muted transition disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Обновить
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="bg-card rounded-xl border overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : zones.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            В аккаунте Wialon пока не нарисовано ни одной геозоны — создайте хотя бы одну в веб-кабинете Wialon (Геозоны), затем обновите эту страницу.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="py-2 px-4 text-left text-[10px] uppercase tracking-wider text-muted-foreground">Зона</th>
                <th className="py-2 px-4 text-left text-[10px] uppercase tracking-wider text-muted-foreground">Тип</th>
                <th className="py-2 px-4 text-left text-[10px] uppercase tracking-wider text-muted-foreground">Роль в TMS</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id} className="border-b last:border-0">
                  <td className="py-2 px-4 font-medium">{z.name}</td>
                  <td className="py-2 px-4 text-xs text-muted-foreground">{ZONE_TYPE_LABEL[z.type] ?? z.type}</td>
                  <td className="py-2 px-4">
                    <select
                      value={z.role ?? ''}
                      onChange={(e) => setRole(z, e.target.value || null)}
                      disabled={saving === z.id}
                      className="border rounded-lg px-2 py-1 text-xs"
                    >
                      <option value="">— без роли —</option>
                      {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
