'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import CrumbLink from '@/components/nav/crumb-link';
import {
  FolderOpen, FolderClosed, FileText, ChevronRight, ChevronDown,
  Download, Loader2, FileUp, Trash2, Paperclip, Search, Users
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  description: string | null;
  uploadedAt: string;
  downloadUrl: string;
}

interface TripData {
  id: string;
  tripNumber: string;
  routeFrom: string;
  routeTo: string;
  tripDate: string;
  tripType: string;
  clientRate: number;
  carrierRate: number | null;
  profit: number;
  status: string;
  attachments: Attachment[];
  carrier?: { name: string } | null;
  vehicle?: { plateNumber: string; brand: string; model: string } | null;
  driver?: { fullName: string } | null;
}

interface ClientFolder {
  id: string;
  name: string;
  contactPerson: string | null;
  trips: TripData[];
}

export default function DocumentsPage() {
  const [clients, setClients] = useState<ClientFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openClients, setOpenClients] = useState<Set<string>>(new Set());
  const [openTrips, setOpenTrips] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTripId, setUploadTripId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/documents/by-client');
      const data = await res.json();
      if (Array.isArray(data)) setClients(data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleClient = (id: string) => {
    setOpenClients(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleTrip = (id: string) => {
    setOpenTrips(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleUploadClick = (tripId: string) => {
    setUploadTripId(tripId);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !uploadTripId) return;
    setUploading(uploadTripId);
    try {
      for (const file of Array.from(files)) {
        const presignRes = await fetch('/api/upload/presigned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type || 'application/octet-stream', isPublic: false }),
        });
        if (!presignRes.ok) throw new Error('Ошибка');
        const { uploadUrl, cloud_storage_path } = await presignRes.json();

        const uploadHeaders: Record<string, string> = { 'Content-Type': file.type || 'application/octet-stream' };
        const urlObj = new URL(uploadUrl);
        const signedHeaders = urlObj.searchParams.get('X-Amz-SignedHeaders') || '';
        if (signedHeaders.includes('content-disposition')) uploadHeaders['Content-Disposition'] = 'attachment';
        const uploadRes = await fetch(uploadUrl, { method: 'PUT', headers: uploadHeaders, body: file });
        if (!uploadRes.ok) throw new Error('Ошибка загрузки');

        await fetch(`/api/trips/${uploadTripId}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type || 'application/octet-stream',
            cloudStoragePath: cloud_storage_path,
            isPublic: false,
            description: 'Заявка клиента',
          }),
        });
      }
      await load();
    } catch (err: any) {
      alert(err.message || 'Ошибка загрузки');
    } finally {
      setUploading(null);
      setUploadTripId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAttachment = async (tripId: string, attachmentId: string) => {
    if (!confirm('Удалить файл?')) return;
    try {
      await fetch(`/api/trips/${tripId}/attachments?attachmentId=${attachmentId}`, { method: 'DELETE' });
      await load();
    } catch { alert('Ошибка удаления'); }
  };



  const filteredClients = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.trips.some(t => t.tripNumber.toLowerCase().includes(search.toLowerCase()))
  );

  const totalTrips = clients.reduce((s, c) => s + c.trips.length, 0);
  const totalFiles = clients.reduce((s, c) => s + c.trips.reduce((ts, t) => ts + t.attachments.length, 0), 0);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Загрузка...</div>;

  const fileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['pdf'].includes(ext)) return 'text-red-500';
    if (['doc','docx'].includes(ext)) return 'text-blue-500';
    if (['xls','xlsx','csv'].includes(ext)) return 'text-green-500';
    if (['jpg','jpeg','png'].includes(ext)) return 'text-orange-500';
    return 'text-gray-500';
  };

  return (
    <div className="space-y-6">
      <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv" className="hidden" onChange={(e) => handleFileUpload(e.target.files)} />

      <div>
        <h1 className="text-xl lg:text-2xl font-display font-bold tracking-tight">Документы</h1>
        <p className="text-sm text-muted-foreground">Файлы по клиентам — заявки, счета, акты</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-primary">{clients.length}</p>
          <p className="text-xs text-muted-foreground">клиентов</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-primary">{totalTrips}</p>
          <p className="text-xs text-muted-foreground">заявок</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-primary">{totalFiles}</p>
          <p className="text-xs text-muted-foreground">файлов</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по клиенту или номеру заявки..."
          className="w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm bg-background"
        />
      </div>

      {/* Folder Tree */}
      {filteredClients.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Нет клиентов с заявками</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredClients.map(client => {
            const isClientOpen = openClients.has(client.id);
            const clientFileCount = client.trips.reduce((s, t) => s + t.attachments.length, 0);

            return (
              <div key={client.id} className="bg-card rounded-xl shadow-sm overflow-hidden">
                {/* Client folder header */}
                <button
                  onClick={() => toggleClient(client.id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition text-left"
                >
                  {isClientOpen ? <FolderOpen className="w-5 h-5 text-amber-500 shrink-0" /> : <FolderClosed className="w-5 h-5 text-amber-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{client.name}</p>
                    <p className="text-xs text-muted-foreground">{client.trips.length} заявок · {clientFileCount} файлов</p>
                  </div>
                  {isClientOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>

                {/* Trips inside client */}
                {isClientOpen && (
                  <div className="border-t">
                    {client.trips.map(trip => {
                      const isTripOpen = openTrips.has(trip.id);
                      const tripKey = trip.id;

                      return (
                        <div key={trip.id} className="border-b last:border-b-0">
                          {/* Trip folder header */}
                          <button
                            onClick={() => toggleTrip(trip.id)}
                            className="w-full flex items-center gap-3 pl-10 pr-4 py-3 hover:bg-muted/30 transition text-left"
                          >
                            {isTripOpen ? <FolderOpen className="w-4 h-4 text-blue-500 shrink-0" /> : <FolderClosed className="w-4 h-4 text-blue-500 shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">
                                <span className="font-mono text-primary">{trip.tripNumber}</span>
                                <span className="text-muted-foreground ml-2">{trip.routeFrom} → {trip.routeTo}</span>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(trip.tripDate)} · {formatCurrency(trip.clientRate)} · {trip.attachments.length} файлов
                              </p>
                            </div>
                            {isTripOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                          </button>

                          {/* Trip content: files + doc generation */}
                          {isTripOpen && (
                            <div className="pl-16 pr-4 pb-4 space-y-3">
                              {/* Upload + Generate buttons */}
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => handleUploadClick(trip.id)}
                                  disabled={uploading === trip.id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-primary/40 text-primary text-xs font-medium rounded-lg hover:bg-primary/5 disabled:opacity-60 transition"
                                >
                                  {uploading === trip.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileUp className="w-3 h-3" />}
                                  Загрузить заявку
                                </button>

                                <CrumbLink href={`/trips/${trip.id}`} fromLabel="Документы" fromKey="documents" className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition">
                                  Открыть заявку →
                                </CrumbLink>
                              </div>

                              {/* Files list */}
                              {trip.attachments.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">Нет прикреплённых файлов</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {trip.attachments.map(att => (
                                    <div key={att.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 hover:bg-muted/70 transition group">
                                      <FileText className={`w-4 h-4 shrink-0 ${fileIcon(att.fileName)}`} />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium truncate">{att.fileName}</p>
                                        <p className="text-[10px] text-muted-foreground">
                                          {att.description && `${att.description} · `}{new Date(att.uploadedAt).toLocaleDateString('ru-RU')}
                                        </p>
                                      </div>
                                      <a
                                        href={att.downloadUrl}
                                        className="p-1 hover:bg-primary/10 rounded transition opacity-0 group-hover:opacity-100"
                                        title="Скачать"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          const link = document.createElement('a');
                                          link.href = att.downloadUrl;
                                          link.download = att.fileName;
                                          document.body.appendChild(link);
                                          link.click();
                                          document.body.removeChild(link);
                                        }}
                                      >
                                        <Download className="w-3.5 h-3.5 text-primary" />
                                      </a>
                                      <button
                                        onClick={() => handleDeleteAttachment(trip.id, att.id)}
                                        className="p-1 hover:bg-red-100 rounded transition opacity-0 group-hover:opacity-100"
                                        title="Удалить"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
