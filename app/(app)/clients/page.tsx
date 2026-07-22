'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, Pencil, Trash2, Users, Phone, Mail, MapPin, X, FileText, Upload, Loader2, ChevronDown, ChevronUp, FileDown, UserPlus, User } from 'lucide-react';

const TEMPLATE_TYPES = [
  { key: 'invoice', label: 'Шаблон счёта', pathField: 'invoiceTemplatePath', nameField: 'invoiceTemplateName' },
  { key: 'act', label: 'Шаблон акта', pathField: 'actTemplatePath', nameField: 'actTemplateName' },
] as const;

export default function ClientsPage() {
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Инициализация из ?search= — ссылка "Аналитика по клиентам" -> клиент раньше вела на
  // несуществующую /clients/[id] (такой страницы нет, только список); теперь ведёт сюда
  // с готовым поиском по имени вместо 404.
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: '', contactPerson: '', phone: '', email: '', inn: '', address: '', invoicePrefix: '\u0421\u0427', actPrefix: '\u0410\u041A\u0422', numberFormat: '{prefix}-{number}', resetNumberingYearly: false, paymentTermsDays: '' });
  const [saving, setSaving] = useState(false);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [uploadingTpl, setUploadingTpl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingUpload, setPendingUpload] = useState<{ clientId: string; templateType: string } | null>(null);
  const [reconClient, setReconClient] = useState<any>(null);
  const [reconFrom, setReconFrom] = useState('');
  const [reconTo, setReconTo] = useState('');
  const [reconLoading, setReconLoading] = useState(false);
  // Contacts state
  const [expandedContacts, setExpandedContacts] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({ id: '', name: '', phone: '', email: '' });
  const [showContactForm, setShowContactForm] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const contractFileRef = useRef<HTMLInputElement>(null);
  const [pendingContractClientId, setPendingContractClientId] = useState<string | null>(null);
  const [contractUploading, setContractUploading] = useState<string | null>(null);

  const downloadRecon = async () => {
    if (!reconClient?.id) return;
    setReconLoading(true);
    try {
      const sp = new URLSearchParams({ clientId: reconClient.id });
      if (reconFrom) sp.set('dateFrom', reconFrom);
      if (reconTo) sp.set('dateTo', reconTo);
      const res = await fetch(`/api/reports/reconciliation?${sp.toString()}`);
      if (!res.ok) { alert('\u041e\u0448\u0438\u0431\u043a\u0430 \u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u0438 PDF'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `reconciliation_${reconClient.name}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setReconClient(null);
    } catch { alert('\u041e\u0448\u0438\u0431\u043a\u0430'); } finally { setReconLoading(false); }
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/clients');
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = (clients ?? []).filter((c: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    if ((c?.name ?? '').toLowerCase().includes(s)) return true;
    if ((c?.inn ?? '').includes(s)) return true;
    if ((c?.contactPerson ?? '').toLowerCase().includes(s)) return true;
    if ((c?.contacts ?? []).some((ct: any) => (ct?.name ?? '').toLowerCase().includes(s))) return true;
    return false;
  });

  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  // Reset page on search change
  useEffect(() => { setPage(1); }, [search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openModal = (item?: any) => {
    if (item) {
      setEditItem(item);
      setForm({ name: item?.name ?? '', contactPerson: item?.contactPerson ?? '', phone: item?.phone ?? '', email: item?.email ?? '', inn: item?.inn ?? '', address: item?.address ?? '', invoicePrefix: item?.invoicePrefix ?? '\u0421\u0427', actPrefix: item?.actPrefix ?? '\u0410\u041A\u0422', numberFormat: item?.numberFormat ?? '{prefix}-{number}', resetNumberingYearly: item?.resetNumberingYearly ?? false, paymentTermsDays: item?.paymentTermsDays?.toString() ?? '' });
    } else {
      setEditItem(null);
      setForm({ name: '', contactPerson: '', phone: '', email: '', inn: '', address: '', invoicePrefix: '\u0421\u0427', actPrefix: '\u0410\u041A\u0422', numberFormat: '{prefix}-{number}', resetNumberingYearly: false, paymentTermsDays: '' });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const url = editItem ? `/api/clients/${editItem.id}` : '/api/clients';
      const method = editItem ? 'PUT' : 'POST';
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, paymentTermsDays: form.paymentTermsDays !== '' ? parseInt(form.paymentTermsDays as string) : null }) });
      setShowModal(false);
      load();
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0430?')) return;
    try {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || '\u041E\u0448\u0438\u0431\u043A\u0430 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u044F');
        return;
      }
      load();
    } catch { alert('\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0442\u0438'); }
  };

  const triggerUpload = (clientId: string, templateType: string) => {
    setPendingUpload({ clientId, templateType });
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingUpload) return;
    const { clientId, templateType } = pendingUpload;
    const key = `${templateType}_${clientId}`;
    setUploadingTpl(key);
    try {
      // Get presigned URL
      const presRes = await fetch('/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, isPublic: false }),
      });
      const { uploadUrl, cloud_storage_path } = await presRes.json();

      // Upload to S3
      const headers: Record<string, string> = { 'Content-Type': file.type };
      if (uploadUrl.includes('content-disposition')) {
        headers['Content-Disposition'] = 'attachment';
      }
      await fetch(uploadUrl, { method: 'PUT', headers, body: file });

      // Save template reference
      await fetch(`/api/clients/${clientId}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateType, fileName: file.name, cloudStoragePath: cloud_storage_path }),
      });
      load();
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploadingTpl(null);
      setPendingUpload(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Contact CRUD
  const openContactForm = (clientId: string, contact?: any) => {
    setExpandedContacts(clientId);
    if (contact) {
      setContactForm({ id: contact.id, name: contact.name || '', phone: contact.phone || '', email: contact.email || '' });
    } else {
      setContactForm({ id: '', name: '', phone: '', email: '' });
    }
    setShowContactForm(true);
  };

  const handleSaveContact = async (clientId: string) => {
    if (!contactForm.name.trim()) return;
    setSavingContact(true);
    try {
      const url = `/api/clients/${clientId}/contacts`;
      const method = contactForm.id ? 'PUT' : 'POST';
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contactForm) });
      setShowContactForm(false);
      setContactForm({ id: '', name: '', phone: '', email: '' });
      load();
    } catch {} finally { setSavingContact(false); }
  };

  const handleDeleteContact = async (clientId: string, contactId: string) => {
    if (!confirm('\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043D\u043E\u0435 \u043B\u0438\u0446\u043E?')) return;
    try {
      await fetch(`/api/clients/${clientId}/contacts?contactId=${contactId}`, { method: 'DELETE' });
      load();
    } catch {}
  };

  const handleDeleteTemplate = async (clientId: string, templateType: string) => {
    if (!confirm('Удалить шаблон?')) return;
    const key = `${templateType}_${clientId}`;
    setUploadingTpl(key);
    try {
      await fetch(`/api/clients/${clientId}/templates?templateType=${templateType}`, { method: 'DELETE' });
      load();
    } catch {} finally { setUploadingTpl(null); }
  };

  const triggerContractUpload = (clientId: string) => {
    setPendingContractClientId(clientId);
    contractFileRef.current?.click();
  };

  const handleContractFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingContractClientId) return;
    const cid = pendingContractClientId;
    setContractUploading(cid);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await fetch(`/api/clients/${cid}/contract`, { method: 'POST', body: fd });
      load();
    } catch (err) { console.error(err); } finally {
      setContractUploading(null);
      setPendingContractClientId(null);
      if (contractFileRef.current) contractFileRef.current.value = '';
    }
  };

  const handleContractDelete = async (clientId: string) => {
    if (!confirm('Удалить договор?')) return;
    try {
      await fetch(`/api/clients/${clientId}/contract`, { method: 'DELETE' });
      load();
    } catch {}
  };

  return (
    <div className="space-y-4">
      <input type="file" ref={fileInputRef} className="hidden" accept=".docx,.doc,.pdf" onChange={handleFileChange} />
      <input type="file" ref={contractFileRef} className="hidden" accept=".pdf,.doc,.docx" onChange={handleContractFileChange} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Клиенты</h1>
          <p className="text-sm text-muted-foreground">База клиентов компании</p>
        </div>
        <button type="button" onClick={() => openModal()} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition">
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" placeholder={"\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044E, \u0418\u041D\u041D, \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u0443..."} value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-card" />
      </div>

      {loading ? <div className="p-8 text-center text-muted-foreground">Загрузка...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(paginated ?? []).map((c: any) => {
            const isExpanded = expandedClient === c?.id;
            const hasInvoiceTpl = !!c?.invoiceTemplatePath;
            const hasActTpl = !!c?.actTemplatePath;
            const tplCount = (hasInvoiceTpl ? 1 : 0) + (hasActTpl ? 1 : 0);
            return (
              <div key={c?.id} className="bg-card rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center"><Users className="w-5 h-5 text-blue-600" /></div>
                    <div>
                      <h3 className="font-semibold text-sm">{c?.name ?? '—'}</h3>
                      {c?.contactPerson && <p className="text-xs text-muted-foreground">{c.contactPerson}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setReconClient(c); setReconFrom(''); setReconTo(''); }} className="p-1.5 hover:bg-green-50 rounded-md transition" title={"\u0410\u043A\u0442 \u0441\u0432\u0435\u0440\u043A\u0438"}><FileDown className="w-3.5 h-3.5 text-green-600" /></button>
                    <button onClick={() => openModal(c)} className="p-1.5 hover:bg-muted rounded-md transition"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => handleDelete(c?.id)} className="p-1.5 hover:bg-red-50 rounded-md transition"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {c?.phone && <div className="flex items-center gap-2"><Phone className="w-3 h-3" />{c.phone}</div>}
                  {c?.email && <div className="flex items-center gap-2"><Mail className="w-3 h-3" />{c.email}</div>}
                  {c?.inn && <div className="flex items-center gap-2">ИНН: {c.inn}</div>}
                  {c?.address && <div className="flex items-center gap-2"><MapPin className="w-3 h-3" /><span className="truncate">{c.address}</span></div>}
                  {c?.paymentTermsDays != null && <div className="flex items-center gap-2">Срок оплаты: <span className="font-medium">{c.paymentTermsDays} дн.</span></div>}
                </div>

                {/* Contacts section */}
                <div className="mt-3 pt-2 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => { setExpandedContacts(expandedContacts === c?.id ? null : c?.id); setShowContactForm(false); }}
                      className="text-xs font-semibold flex items-center gap-1 hover:text-primary transition">
                      <User className="w-3.5 h-3.5" />
                      {"\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u043D\u044B\u0435 \u043B\u0438\u0446\u0430"} ({(c?.contacts ?? []).length})
                      {expandedContacts === c?.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    <button onClick={() => openContactForm(c?.id)}
                      className="p-1 hover:bg-blue-50 rounded-md transition" title={"\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043A\u043E\u043D\u0442\u0430\u043A\u0442"}>
                      <UserPlus className="w-3.5 h-3.5 text-blue-600" />
                    </button>
                  </div>
                  {expandedContacts === c?.id && (
                    <div className="space-y-2">
                      {(c?.contacts ?? []).map((ct: any) => (
                        <div key={ct.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium">{ct.name}</p>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                              {ct.phone && (
                                <a href={`tel:${ct.phone}`} className="flex items-center gap-0.5 hover:text-primary">
                                  <Phone className="w-2.5 h-2.5" />{ct.phone}
                                </a>
                              )}
                              {ct.email && (
                                <a href={`mailto:${ct.email}`} className="flex items-center gap-0.5 hover:text-primary">
                                  <Mail className="w-2.5 h-2.5" />{ct.email}
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-0.5 flex-shrink-0">
                            <button onClick={() => openContactForm(c?.id, ct)} className="p-1 hover:bg-muted rounded" title={"\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C"}>
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                            </button>
                            <button onClick={() => handleDeleteContact(c?.id, ct.id)} className="p-1 hover:bg-red-50 rounded" title={"\u0423\u0434\u0430\u043B\u0438\u0442\u044C"}>
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {(c?.contacts ?? []).length === 0 && !showContactForm && (
                        <p className="text-[10px] text-muted-foreground text-center py-1">{"\u041D\u0435\u0442 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043D\u044B\u0445 \u043B\u0438\u0446"}</p>
                      )}
                      {showContactForm && expandedContacts === c?.id && (
                        <div className="space-y-2 p-2 rounded-lg bg-muted/40 border">
                          <input type="text" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                            placeholder={"\u0418\u043C\u044F *"} className="w-full border rounded px-2 py-1.5 text-xs bg-background" />
                          <div className="grid grid-cols-2 gap-2">
                            <input type="text" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                              placeholder={"\u0422\u0435\u043B\u0435\u0444\u043E\u043D"} className="w-full border rounded px-2 py-1.5 text-xs bg-background" />
                            <input type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                              placeholder="Email" className="w-full border rounded px-2 py-1.5 text-xs bg-background" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveContact(c?.id)} disabled={savingContact || !contactForm.name.trim()}
                              className="px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary/90 disabled:opacity-50">
                              {savingContact ? '...' : (contactForm.id ? '\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C' : '\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C')}
                            </button>
                            <button onClick={() => { setShowContactForm(false); setContactForm({ id: '', name: '', phone: '', email: '' }); }}
                              className="px-3 py-1 border text-xs rounded hover:bg-muted">{"\u041E\u0442\u043C\u0435\u043D\u0430"}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-2 pt-2 border-t flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    {c?._count?.trips != null && <span className="text-xs text-muted-foreground">{"\u0420\u0435\u0439\u0441\u043E\u0432"}: {c._count.trips}</span>}
                    {(c?.lastInvoiceNum > 0 || c?.lastActNum > 0) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                        {"\u0421\u0427"}:{c.lastInvoiceNum} {"\u0410\u041A\u0422"}:{c.lastActNum}
                      </span>
                    )}
                    {tplCount > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 font-medium">
                        <FileText className="w-3 h-3 inline -mt-0.5" /> {tplCount} шабл.
                      </span>
                    )}
                  </div>
                  <button onClick={() => setExpandedClient(isExpanded ? null : c?.id)}
                    className="text-xs text-primary hover:underline flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    {"\u0428\u0430\u0431\u043B\u043E\u043D\u044B"}
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {/* Template section */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t space-y-3">
                    {/* Contract upload */}
                    <div className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-muted/40">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className={`w-4 h-4 flex-shrink-0 ${c?.contractFile ? 'text-green-600' : 'text-muted-foreground'}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium">Договор</p>
                          {c?.contractFile ? (
                            <a href={`/api/files?path=${encodeURIComponent(c.contractFile)}`} target="_blank" rel="noreferrer" className="text-[10px] text-green-600 truncate hover:underline block max-w-[180px]">
                              {c.contractFileName || 'Скачать договор'}
                            </a>
                          ) : (
                            <p className="text-[10px] text-muted-foreground">Не загружен</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {contractUploading === c?.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : (
                          <>
                            <button onClick={() => triggerContractUpload(c?.id)} className="p-1.5 hover:bg-muted rounded-md transition" title={c?.contractFile ? 'Заменить договор' : 'Загрузить договор'}>
                              <Upload className="w-3.5 h-3.5 text-primary" />
                            </button>
                            {c?.contractFile && (
                              <button onClick={() => handleContractDelete(c?.id)} className="p-1.5 hover:bg-red-50 rounded-md transition" title="Удалить договор">
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Загрузите .docx шаблоны с переменными: {'{'}client_name{'}'}, {'{'}date{'}'}, {'{'}route_from{'}'}, {'{'}route_to{'}'}, {'{'}client_rate{'}'}, {'{'}vehicle_plate{'}'}, {'{'}driver_name{'}'}
                    </p>
                    {TEMPLATE_TYPES.map((tt) => {
                      const hasTemplate = !!c?.[tt.pathField];
                      const fileName = c?.[tt.nameField] || '';
                      const uploading = uploadingTpl === `${tt.key}_${c?.id}`;
                      return (
                        <div key={tt.key} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-muted/40">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className={`w-4 h-4 flex-shrink-0 ${hasTemplate ? 'text-violet-600' : 'text-muted-foreground'}`} />
                            <div className="min-w-0">
                              <p className="text-xs font-medium">{tt.label}</p>
                              {hasTemplate ? (
                                <p className="text-[10px] text-violet-600 truncate">{fileName}</p>
                              ) : (
                                <p className="text-[10px] text-muted-foreground">Не загружен (исп. по умолчанию)</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {uploading ? (
                              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            ) : (
                              <>
                                <button onClick={() => triggerUpload(c?.id, tt.key)}
                                  className="p-1.5 hover:bg-muted rounded-md transition" title={hasTemplate ? 'Заменить' : 'Загрузить'}>
                                  <Upload className="w-3.5 h-3.5 text-primary" />
                                </button>
                                {hasTemplate && (
                                  <button onClick={() => handleDeleteTemplate(c?.id, tt.key)}
                                    className="p-1.5 hover:bg-red-50 rounded-md transition" title="Удалить">
                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {(filtered?.length ?? 0) === 0 && <p className="col-span-full text-center text-muted-foreground py-8">Клиенты не найдены</p>}
          {totalPages > 1 && (
            <div className="col-span-full flex items-center justify-center gap-2 pt-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm rounded-lg border hover:bg-muted transition disabled:opacity-40">←</button>
              <span className="text-sm text-muted-foreground">{page} / {totalPages} <span className="text-xs">({filtered.length} всего)</span></span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-sm rounded-lg border hover:bg-muted transition disabled:opacity-40">→</button>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-xl shadow-lg w-full max-w-lg p-6 space-y-4" onClick={(e) => e?.stopPropagation?.()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editItem ? 'Редактировать' : 'Новый клиент'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="text-xs text-muted-foreground">Название *</label><input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground">Контактное лицо</label><input type="text" value={form.contactPerson} onChange={(e) => setForm({...form, contactPerson: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
                <div><label className="text-xs text-muted-foreground">Телефон</label><input type="text" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground">Email</label><input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
                <div><label className="text-xs text-muted-foreground">ИНН</label><input type="text" value={form.inn} onChange={(e) => setForm({...form, inn: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
              </div>
              <div><label className="text-xs text-muted-foreground">{"\u0410\u0434\u0440\u0435\u0441"}</label><input type="text" value={form.address} onChange={(e) => setForm({...form, address: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>
              <div><label className="text-xs text-muted-foreground">Срок оплаты после выгрузки (дней)</label><input type="number" min="0" value={form.paymentTermsDays} onChange={(e) => setForm({...form, paymentTermsDays: e.target.value})} placeholder="например 7" className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" /></div>

              {/* Numbering Settings */}
              <div className="border-t pt-3 mt-1">
                <p className="text-xs font-semibold mb-2">{"\u041D\u0443\u043C\u0435\u0440\u0430\u0446\u0438\u044F \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432"}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">{"\u041F\u0440\u0435\u0444\u0438\u043A\u0441 \u0441\u0447\u0451\u0442\u0430"}</label>
                    <input type="text" value={form.invoicePrefix} onChange={(e) => setForm({...form, invoicePrefix: e.target.value})} placeholder={"\u0421\u0427"} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{"\u041F\u0440\u0435\u0444\u0438\u043A\u0441 \u0430\u043A\u0442\u0430"}</label>
                    <input type="text" value={form.actPrefix} onChange={(e) => setForm({...form, actPrefix: e.target.value})} placeholder={"\u0410\u041A\u0422"} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background" />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="text-xs text-muted-foreground">{"\u0424\u043E\u0440\u043C\u0430\u0442 \u043D\u043E\u043C\u0435\u0440\u0430"}</label>
                  <select value={form.numberFormat} onChange={(e) => setForm({...form, numberFormat: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 bg-background">
                    <option value="{prefix}-{number}">{form.invoicePrefix || 'СЧ'}-001</option>
                    <option value="{number}/{year}">001/2026</option>
                    <option value="{prefix}-{number}/{year}">{form.invoicePrefix || 'СЧ'}-001/2026</option>
                    <option value="{prefix}/{number}">{form.invoicePrefix || 'СЧ'}/001</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 mt-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={form.resetNumberingYearly} onChange={(e) => setForm({...form, resetNumberingYearly: e.target.checked})} className="rounded border-gray-300" />
                  {"\u0421\u0431\u0440\u0430\u0441\u044B\u0432\u0430\u0442\u044C \u043D\u0443\u043C\u0435\u0440\u0430\u0446\u0438\u044E \u043A\u0430\u0436\u0434\u044B\u0439 \u0433\u043E\u0434"}
                </label>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving || !form.name} className="px-5 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60 transition">{saving ? 'Сохранение...' : 'Сохранить'}</button>
              <button onClick={() => setShowModal(false)} className="px-5 py-2 border rounded-lg text-sm hover:bg-muted transition">Отмена</button>
            </div>
          </div>
        </div>
      )}
      {/* Reconciliation modal */}
      {reconClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !reconLoading && setReconClient(null)}>
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold">{"\u0410\u043A\u0442 \u0441\u0432\u0435\u0440\u043A\u0438"}: {reconClient.name}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{"\u041F\u0435\u0440\u0438\u043E\u0434 \u0441"}</label>
                <input type="date" value={reconFrom} onChange={e => setReconFrom(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{"\u041F\u0435\u0440\u0438\u043E\u0434 \u043F\u043E"}</label>
                <input type="date" value={reconTo} onChange={e => setReconTo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">{"\u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C \u0434\u043B\u044F \u0432\u0441\u0435\u0433\u043E \u043F\u0435\u0440\u0438\u043E\u0434\u0430"}</p>
            <div className="flex gap-3">
              <button onClick={downloadRecon} disabled={reconLoading} className="flex-1 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition">
                {reconLoading ? <><Loader2 className="w-4 h-4 animate-spin inline mr-1" />{"\u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F..."}</> : <><FileDown className="w-4 h-4 inline mr-1" />{"\u0421\u043A\u0430\u0447\u0430\u0442\u044C PDF"}</>}
              </button>
              <button onClick={() => setReconClient(null)} disabled={reconLoading} className="px-4 py-2 border rounded-lg text-sm hover:bg-muted transition">{"\u041E\u0442\u043C\u0435\u043D\u0430"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
