'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Save, Loader2, RotateCcw, FileText, Upload, Trash2, Download, CheckCircle2, FileUp, MapPin } from 'lucide-react';

/* ---- Document template types ---- */
const TEMPLATE_TYPES = [
  {
    key: 'invoice',
    label: 'Счёт клиенту',
    description: 'Word-шаблон счёта на оплату (.docx)',
    accept: '.docx',
    placeholders: '{{trip_number}}, {{client_name}}, {{client_inn}}, {{route_from}}, {{route_to}}, {{trip_date}}, {{client_rate}}, {{company_name}}, {{company_inn}}, {{company_address}}, {{company_bank}}, {{company_director}}',
  },
  {
    key: 'act',
    label: 'Акт выполненных работ',
    description: 'Word-шаблон акта (.docx)',
    accept: '.docx',
    placeholders: '{{trip_number}}, {{client_name}}, {{route_from}}, {{route_to}}, {{trip_date}}, {{client_rate}}, {{company_name}}, {{company_director}}',
  },
  {
    key: 'carrier_request',
    label: 'Заявка перевозчику',
    description: 'Word-шаблон заявки перевозчику (.docx)',
    accept: '.docx',
    placeholders: '{{trip_number}}, {{carrier_name}}, {{carrier_inn}}, {{route_from}}, {{route_to}}, {{trip_date}}, {{carrier_rate}}, {{company_name}}',
  },
  {
    key: 'waybill',
    label: 'Путевой лист',
    description: 'Word-шаблон путевого листа (.docx)',
    accept: '.docx',
    placeholders: '{{driver_name}}, {{license_number}}, {{vehicle_plate}}, {{vehicle_brand}}, {{vehicle_model}}, {{date}}, {{company_name}}, {{company_director}}',
  },
  {
    key: 'employment_contract',
    label: 'Трудовой договор',
    description: 'Word-шаблон трудового договора (.docx)',
    accept: '.docx',
    placeholders: '{{driver_name}}, {{phone}}, {{license_number}}, {{date}}, {{company_name}}, {{company_inn}}, {{company_address}}, {{company_director}}',
  },
  {
    key: 'power_of_attorney',
    label: 'Доверенность',
    description: 'Word-шаблон доверенности (.docx)',
    accept: '.docx',
    placeholders: '{{driver_name}}, {{license_number}}, {{vehicle_plate}}, {{vehicle_brand}}, {{vehicle_model}}, {{date}}, {{company_name}}, {{company_director}}',
  },
];

interface CompanyZone {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  radiusMeters: number;
  isActive: boolean;
}

interface TemplateInfo {
  id: string;
  documentType: string;
  fileName: string;
  cloudStoragePath: string;
  isPublic: boolean;
  uploadedAt: string;
}

/* ---- Company Settings ---- */
const COMPANY_FIELDS: { key: string; label: string; description: string; defaultValue: string; multiline?: boolean }[] = [
  { key: 'company_name', label: '\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438', description: '\u0418\u041F/\u041E\u041E\u041E \u2014 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u0432 \u0448\u0430\u043F\u043A\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432', defaultValue: '' },
  { key: 'company_inn', label: '\u0418\u041D\u041D \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438', description: '\u0414\u043B\u044F \u0440\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u043E\u0432 \u0432 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u0445', defaultValue: '' },
  { key: 'company_address', label: '\u042E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0430\u0434\u0440\u0435\u0441', description: '\u0410\u0434\u0440\u0435\u0441 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438', defaultValue: '' },
  { key: 'company_bank_name', label: '\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0431\u0430\u043D\u043A\u0430', description: '\u041D\u0430\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u0431\u0430\u043D\u043A\u0430', defaultValue: '' },
  { key: 'company_account', label: '\u0420\u0430\u0441\u0447\u0451\u0442\u043D\u044B\u0439 \u0441\u0447\u0451\u0442', description: '\u041D\u043E\u043C\u0435\u0440 \u0441\u0447\u0451\u0442\u0430', defaultValue: '' },
  { key: 'company_swift', label: 'SWIFT / IBAN', description: '\u0414\u043B\u044F \u043C\u0435\u0436\u0434\u0443\u043D\u0430\u0440\u043E\u0434\u043D\u044B\u0445 \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u043E\u0432', defaultValue: '' },
  { key: 'company_phone', label: '\u0422\u0435\u043B\u0435\u0444\u043E\u043D', description: '\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u043D\u044B\u0439 \u0442\u0435\u043B\u0435\u0444\u043E\u043D \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438', defaultValue: '' },
  { key: 'company_bank', label: '\u0411\u0430\u043D\u043A\u043E\u0432\u0441\u043A\u0438\u0435 \u0440\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B (\u043F\u043E\u043B\u043D\u044B\u0439 \u0431\u043B\u043E\u043A)', description: '\u0412\u0435\u0441\u044C \u0442\u0435\u043A\u0441\u0442 \u0431\u043B\u043E\u043A\u0430 \u0431\u0430\u043D\u043A\u043E\u0432\u0441\u043A\u0438\u0445 \u0440\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u043E\u0432 \u0434\u043B\u044F \u0441\u0447\u0451\u0442\u0430', defaultValue: '', multiline: true },
  { key: 'company_director', label: '\u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044C', description: '\u0424\u0418\u041E \u0438 \u0434\u043E\u043B\u0436\u043D\u043E\u0441\u0442\u044C \u0440\u0443\u043A\u043E\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044F', defaultValue: '' },
];

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Daily exchange rates
  const [rates, setRates] = useState<Record<string, string>>({ USD: '', EUR: '', RUB: '', GEL: '' });
  const [savingRates, setSavingRates] = useState(false);
  const [ratesSaved, setRatesSaved] = useState(false);

  // Company base zones (замена Wialon-геозон — см. lib/company-base/baseCheck.ts)
  const [zones, setZones] = useState<CompanyZone[]>([]);
  const [zoneForm, setZoneForm] = useState({ name: 'База', lat: '', lon: '', radiusMeters: '200' });
  const [savingZone, setSavingZone] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      const initial: Record<string, string> = {};
      for (const f of COMPANY_FIELDS) {
        initial[f.key] = data[f.key] ?? f.defaultValue;
      }
      setValues(initial);
    } catch {} finally { setLoading(false); }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      if (Array.isArray(data)) setTemplates(data);
    } catch {}
  }, []);

  const loadRates = useCallback(async () => {
    try {
      const res = await fetch('/api/exchange-rates');
      const data = await res.json();
      if (data.rates) {
        setRates({
          USD: data.rates.USD != null ? String(data.rates.USD) : '',
          EUR: data.rates.EUR != null ? String(data.rates.EUR) : '',
          RUB: data.rates.RUB != null ? String(data.rates.RUB) : '',
          GEL: data.rates.GEL != null ? String(data.rates.GEL) : '',
        });
      }
    } catch {}
  }, []);

  const handleSaveRates = async () => {
    setSavingRates(true);
    try {
      const rateObj: Record<string, number> = {};
      Object.entries(rates).forEach(([k, v]) => { if (v) rateObj[k] = parseFloat(v); });
      await fetch('/api/exchange-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates: rateObj }),
      });
      setRatesSaved(true);
      setTimeout(() => setRatesSaved(false), 2000);
    } catch { alert('\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F'); }
    finally { setSavingRates(false); }
  };

  const loadZones = useCallback(async () => {
    try {
      const res = await fetch('/api/company-zones');
      const data = await res.json();
      if (Array.isArray(data)) setZones(data);
    } catch {}
  }, []);

  useEffect(() => { loadSettings(); loadTemplates(); loadRates(); loadZones(); }, [loadSettings, loadTemplates, loadRates, loadZones]);

  const handleAddZone = async () => {
    const lat = parseFloat(zoneForm.lat);
    const lon = parseFloat(zoneForm.lon);
    const radiusMeters = parseInt(zoneForm.radiusMeters, 10);
    if (!zoneForm.name.trim() || Number.isNaN(lat) || Number.isNaN(lon) || !radiusMeters) {
      alert('Заполните название, широту, долготу и радиус (м)');
      return;
    }
    setSavingZone(true);
    try {
      const res = await fetch('/api/company-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: zoneForm.name.trim(), lat, lon, radiusMeters }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Ошибка сохранения');
      setZoneForm({ name: 'База', lat: '', lon: '', radiusMeters: '200' });
      await loadZones();
    } catch (e: any) {
      alert(e.message || 'Ошибка сохранения');
    } finally {
      setSavingZone(false);
    }
  };

  const handleDeleteZone = async (id: string) => {
    if (!confirm('Удалить зону базы компании?')) return;
    try {
      await fetch(`/api/company-zones?id=${id}`, { method: 'DELETE' });
      await loadZones();
    } catch { alert('Ошибка удаления'); }
  };

  const handleToggleZoneActive = async (zone: CompanyZone) => {
    try {
      await fetch('/api/company-zones', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: zone.id, isActive: !zone.isActive }),
      });
      await loadZones();
    } catch { alert('Ошибка сохранения'); }
  };

  const handleSave = async (key: string) => {
    setSaving(key);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: values[key] || '' }),
      });
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } catch { alert('Ошибка сохранения'); } finally { setSaving(null); }
  };

  const handleUpload = async (templateKey: string, file: File) => {
    setUploading(templateKey);
    try {
      // 1. Get presigned URL
      const presignRes = await fetch('/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          isPublic: false,
        }),
      });
      if (!presignRes.ok) throw new Error('Ошибка получения URL');
      const { uploadUrl, cloud_storage_path } = await presignRes.json();

      // 2. Upload file to S3
      const uploadHeaders: Record<string, string> = {
        'Content-Type': file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      // Check if content-disposition is in signed headers
      const urlObj = new URL(uploadUrl);
      const signedHeaders = urlObj.searchParams.get('X-Amz-SignedHeaders') || '';
      if (signedHeaders.includes('content-disposition')) {
        uploadHeaders['Content-Disposition'] = 'attachment';
      }
      const uploadRes = await fetch(uploadUrl, { method: 'PUT', headers: uploadHeaders, body: file });
      if (!uploadRes.ok) throw new Error('Ошибка загрузки файла');

      // 3. Save template record
      const saveRes = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType: templateKey,
          fileName: file.name,
          cloudStoragePath: cloud_storage_path,
          isPublic: false,
        }),
      });
      if (!saveRes.ok) throw new Error('Ошибка сохранения');

      await loadTemplates();
      setUploadSuccess(templateKey);
      setTimeout(() => setUploadSuccess(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Ошибка загрузки шаблона');
    } finally {
      setUploading(null);
      // Reset file input
      const input = fileInputRefs.current[templateKey];
      if (input) input.value = '';
    }
  };

  const handleDelete = async (templateKey: string) => {
    if (!confirm('Удалить шаблон? Будет использоваться стандартный шаблон.')) return;
    try {
      await fetch(`/api/templates?documentType=${templateKey}`, { method: 'DELETE' });
      await loadTemplates();
    } catch { alert('Ошибка удаления'); }
  };

  const getTemplate = (key: string) => templates.find(t => t.documentType === key);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Загрузка...</div>;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Настройки</h1>
        <p className="text-sm text-muted-foreground">Реквизиты компании и шаблоны документов</p>
      </div>

      {/* ---- Company details ---- */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" /> Реквизиты компании
        </h2>
        {COMPANY_FIELDS.map(f => (
          <div key={f.key} className="bg-card rounded-xl p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{f.label}</p>
                <p className="text-xs text-muted-foreground">{f.description}</p>
              </div>
              <button
                onClick={() => handleSave(f.key)}
                disabled={saving === f.key}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition"
              >
                {saving === f.key ? <Loader2 className="w-3 h-3 animate-spin" /> : saved === f.key ? '✓' : <Save className="w-3 h-3" />}
                {saved === f.key ? 'Сохранено' : 'Сохранить'}
              </button>
            </div>
            {f.multiline ? (
              <textarea
                rows={5}
                value={values[f.key] || ''}
                onChange={(e) => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.label + '...'}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono"
              />
            ) : (
              <input
                type="text"
                value={values[f.key] || ''}
                onChange={(e) => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.label + '...'}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              />
            )}
          </div>
        ))}
      </div>

      {/* ---- Daily Exchange Rates ---- */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-amber-600" /> {"\u041A\u0443\u0440\u0441\u044B \u0432\u0430\u043B\u044E\u0442 (\u043A \u0434\u0440\u0430\u043C\u0443)"}
        </h2>
        <div className="bg-card rounded-xl p-4 shadow-sm space-y-3">
          <p className="text-xs text-muted-foreground">{"\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0442\u0435\u043A\u0443\u0449\u0438\u0435 \u043A\u0443\u0440\u0441\u044B \u0432\u0430\u043B\u044E\u0442 \u043A AMD. \u041F\u0440\u0438 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0438 \u0437\u0430\u044f\u0432\u043a\u0438 \u043A\u0443\u0440\u0441 \u0431\u0443\u0434\u0435\u0442 \u043F\u043E\u0434\u0441\u0442\u0430\u0432\u043B\u044F\u0442\u044C\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438."}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: 'USD', label: '$ USD', placeholder: '387.50' },
              { key: 'EUR', label: '\u20AC EUR', placeholder: '420.00' },
              { key: 'RUB', label: '\u20BD RUB', placeholder: '4.20' },
              { key: 'GEL', label: '\u20BE GEL', placeholder: '140.00' },
            ].map(c => (
              <div key={c.key}>
                <label className="text-xs text-muted-foreground mb-1 block">{c.label}</label>
                <input
                  type="number" step="0.01" min="0"
                  placeholder={c.placeholder}
                  value={rates[c.key] || ''}
                  onChange={e => setRates(prev => ({ ...prev, [c.key]: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-mono"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSaveRates} disabled={savingRates}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition">
              {savingRates ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {"\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043A\u0443\u0440\u0441\u044B"}
            </button>
            {ratesSaved && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {"\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E"}</span>}
          </div>
        </div>
      </div>

      {/* ---- Company Base (замена Wialon-геозон) ---- */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <MapPin className="w-4 h-4 text-emerald-600" /> База компании
        </h2>
        <div className="bg-card rounded-xl p-4 shadow-sm space-y-4">
          <p className="text-xs text-muted-foreground">
            Укажите координаты и радиус базы — TMS будет сама определять выезд/возврат машины по GPS из Wialon,
            без создания геозон в самом Wialon. Автозакрытие рейса и продолжительность считаются по этим зонам.
          </p>

          {zones.length > 0 && (
            <div className="space-y-2">
              {zones.map(z => (
                <div key={z.id} className="flex items-center justify-between gap-3 bg-muted/30 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{z.name}{!z.isActive && <span className="ml-2 text-xs text-muted-foreground">(отключена)</span>}</p>
                    <p className="text-xs text-muted-foreground font-mono">{z.lat.toFixed(6)}, {z.lon.toFixed(6)} · радиус {z.radiusMeters} м</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleToggleZoneActive(z)} className="text-xs px-2 py-1 rounded-md hover:bg-muted transition">
                      {z.isActive ? 'Отключить' : 'Включить'}
                    </button>
                    <button onClick={() => handleDeleteZone(z.id)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition">
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Название</label>
              <input type="text" value={zoneForm.name} onChange={e => setZoneForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Широта (Latitude)</label>
              <input type="number" step="0.000001" placeholder="40.187200" value={zoneForm.lat} onChange={e => setZoneForm(p => ({ ...p, lat: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Долгота (Longitude)</label>
              <input type="number" step="0.000001" placeholder="44.509100" value={zoneForm.lon} onChange={e => setZoneForm(p => ({ ...p, lon: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Радиус (м)</label>
              <input type="number" step="1" min="10" placeholder="200" value={zoneForm.radiusMeters} onChange={e => setZoneForm(p => ({ ...p, radiusMeters: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono" />
            </div>
          </div>
          <button onClick={handleAddZone} disabled={savingZone}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition">
            {savingZone ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Добавить зону
          </button>
        </div>
      </div>

      {/* ---- Document Templates Upload ---- */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Upload className="w-4 h-4 text-primary" /> Шаблоны документов (Word)
        </h2>
        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-4 text-sm space-y-2">
          <p className="font-semibold text-blue-700 dark:text-blue-400">Как создать шаблон:</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-600 dark:text-blue-300 text-xs">
            <li>Создайте документ в Word с нужным оформлением (шрифты, логотип, таблицы)</li>
            <li>Вместо данных вставьте <strong>метки</strong> в фигурных скобках, например: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">{'{'}client_name{'}'}</code></li>
            <li>Сохраните как .docx и загрузите ниже</li>
          </ol>
        </div>

        {TEMPLATE_TYPES.map(tmpl => {
          const existing = getTemplate(tmpl.key);
          const isUploading = uploading === tmpl.key;
          const justUploaded = uploadSuccess === tmpl.key;

          return (
            <div key={tmpl.key} className="bg-card rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{tmpl.label}</p>
                  <p className="text-xs text-muted-foreground">{tmpl.description}</p>
                </div>
                {existing && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleDelete(tmpl.key)}
                      className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition"
                      title="Удалить шаблон"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                )}
              </div>

              {/* Current status */}
              {existing ? (
                <div className="flex items-center gap-2 text-xs bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Загружен: <strong>{existing.fileName}</strong></span>
                  <span className="text-green-500 shrink-0">• {new Date(existing.uploadedAt).toLocaleDateString('ru-RU')}</span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  Стандартный шаблон — загрузите свой .docx для кастомизации
                </div>
              )}

              {/* Upload button */}
              <div className="flex items-center gap-2">
                <input
                  ref={el => { fileInputRefs.current[tmpl.key] = el; }}
                  type="file"
                  accept={tmpl.accept}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(tmpl.key, file);
                  }}
                />
                <button
                  onClick={() => fileInputRefs.current[tmpl.key]?.click()}
                  disabled={isUploading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-primary/40 text-primary text-xs font-medium rounded-lg hover:bg-primary/5 disabled:opacity-60 transition"
                >
                  {isUploading ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Загрузка...</>
                  ) : justUploaded ? (
                    <><CheckCircle2 className="w-3 h-3" /> Загружено!</>
                  ) : (
                    <><FileUp className="w-3 h-3" /> {existing ? 'Заменить шаблон' : 'Загрузить .docx'}</>
                  )}
                </button>
              </div>

              {/* Available placeholders */}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition">Доступные метки</summary>
                <div className="mt-1 flex flex-wrap gap-1">
                  {tmpl.placeholders.split(', ').map(p => (
                    <code key={p} className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{p}</code>
                  ))}
                </div>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
