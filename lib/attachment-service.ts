import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export type StorageCategory =
  | 'contracts'
  | 'invoices'
  | 'acts'
  | 'signed'
  | 'other'
  | 'client-contracts';

const STORAGE_ROOT = path.join(process.cwd(), 'storage');
const UPLOADS_DIR = 'uploads';
const LOCAL_PREFIX = 'local://';

const ALLOWED_CATEGORIES: StorageCategory[] = [
  'contracts',
  'invoices',
  'acts',
  'signed',
  'other',
  'client-contracts',
];

function logStorageIssue(context: string, storagePath: string, error?: unknown) {
  console.error('[attachment-service]', context, storagePath, error ?? '');
}

function sanitizeName(name: string): string {
  return (name || 'file')
    .replace(/[^\w.\-()\u0400-\u04FF ]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueName(originalName: string): string {
  const safe = sanitizeName(originalName);
  const stamp = Date.now();
  const rnd = crypto.randomBytes(4).toString('hex');
  return `${stamp}_${rnd}_${safe}`;
}

export function normalizeStorageCategory(input?: string | null): StorageCategory {
  if (!input) return 'other';
  if (ALLOWED_CATEGORIES.includes(input as StorageCategory)) {
    return input as StorageCategory;
  }
  return 'other';
}

export async function ensureStorageStructure() {
  await fs.mkdir(path.join(STORAGE_ROOT, UPLOADS_DIR), { recursive: true });
  await Promise.all(
    ALLOWED_CATEGORIES.map((category) =>
      fs.mkdir(path.join(STORAGE_ROOT, UPLOADS_DIR, category), { recursive: true })
    )
  );
}

export function buildStoragePath(category: StorageCategory, fileName: string): string {
  return `${LOCAL_PREFIX}${UPLOADS_DIR}/${category}/${fileName}`;
}

export async function createUploadTarget(fileName: string, storageCategory?: string | null) {
  await ensureStorageStructure();
  const category = normalizeStorageCategory(storageCategory);
  const localName = uniqueName(fileName);
  const cloud_storage_path = buildStoragePath(category, localName);
  const uploadUrl = `/api/upload/local?path=${encodeURIComponent(cloud_storage_path)}`;
  return { uploadUrl, cloud_storage_path };
}

function parseLocalSegments(cloudStoragePath: string): string[] | null {
  if (!cloudStoragePath.startsWith(LOCAL_PREFIX)) return null;
  const relative = cloudStoragePath.slice(LOCAL_PREFIX.length);
  const segments = relative.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  if (segments.some((segment) => segment.includes('..') || segment.includes('\\'))) return null;
  return segments;
}

export function isLocalStoragePath(cloudStoragePath: string | null | undefined): boolean {
  return !!cloudStoragePath && cloudStoragePath.startsWith(LOCAL_PREFIX);
}

export function isUploadsStoragePath(cloudStoragePath: string | null | undefined): boolean {
  return !!cloudStoragePath && cloudStoragePath.startsWith(`${LOCAL_PREFIX}${UPLOADS_DIR}/`);
}

export function isLegacyS3StoragePath(cloudStoragePath: string | null | undefined): boolean {
  return !!cloudStoragePath && !isLocalStoragePath(cloudStoragePath);
}

export function localFileAbsolutePath(cloudStoragePath: string): string | null {
  const segments = parseLocalSegments(cloudStoragePath);
  if (!segments) return null;
  return path.join(STORAGE_ROOT, ...segments);
}

export async function verifyStoredAttachmentReadable(cloudStoragePath: string): Promise<boolean> {
  if (!isLocalStoragePath(cloudStoragePath)) return false;
  const absolute = localFileAbsolutePath(cloudStoragePath);
  if (!absolute) {
    logStorageIssue('invalid-local-path', cloudStoragePath);
    return false;
  }
  try {
    await fs.access(absolute);
    return true;
  } catch (error) {
    logStorageIssue('missing-local-file', cloudStoragePath, error);
    return false;
  }
}

export async function saveBufferToStorage(
  fileName: string,
  buffer: Buffer,
  storageCategory?: string | null
): Promise<{ cloudStoragePath: string; absolutePath: string }> {
  const category = normalizeStorageCategory(storageCategory);
  const localName = uniqueName(fileName);
  const cloudStoragePath = buildStoragePath(category, localName);
  const absolutePath = localFileAbsolutePath(cloudStoragePath);
  if (!absolutePath) throw new Error('Invalid storage path');
  await ensureStorageStructure();
  await fs.writeFile(absolutePath, buffer);
  const readable = await verifyStoredAttachmentReadable(cloudStoragePath);
  if (!readable) {
    throw new Error('Uploaded file is missing after save');
  }
  return { cloudStoragePath, absolutePath };
}

export async function resolveAttachmentDownloadUrl(
  cloudStoragePath: string
): Promise<{ downloadUrl: string | null; downloadAvailable: boolean; storage: 'local' | 'unavailable' }> {
  if (!isLocalStoragePath(cloudStoragePath)) {
    logStorageIssue('non-local-path', cloudStoragePath);
    return { downloadUrl: null, downloadAvailable: false, storage: 'unavailable' };
  }

  const readable = await verifyStoredAttachmentReadable(cloudStoragePath);
  if (!readable) {
    return { downloadUrl: null, downloadAvailable: false, storage: 'unavailable' };
  }

  return {
    downloadUrl: `/api/files?path=${encodeURIComponent(cloudStoragePath)}`,
    downloadAvailable: true,
    storage: 'local',
  };
}

export async function getStoredFileSizeBytes(cloudStoragePath: string): Promise<number | null> {
  if (!isLocalStoragePath(cloudStoragePath)) return null;
  const absolute = localFileAbsolutePath(cloudStoragePath);
  if (!absolute) return null;
  try {
    const stat = await fs.stat(absolute);
    return Number.isFinite(stat.size) ? stat.size : null;
  } catch {
    return null;
  }
}

export function buildTripAttachmentDownloadUrl(attachmentId: string): string {
  return `/api/trips/attachments/download?attachmentId=${encodeURIComponent(attachmentId)}`;
}

export async function enrichTripAttachmentDownload<T extends { id: string; cloudStoragePath: string; isPublic: boolean }>(
  attachment: T
): Promise<T & {
  downloadUrl: string;
  downloadAvailable: boolean;
  storage: 'local' | 'unavailable';
  fileSizeBytes: number | null;
  storageReadable: boolean;
}> {
  const resolved = await resolveAttachmentDownloadUrl(attachment.cloudStoragePath);
  const fileSizeBytes = await getStoredFileSizeBytes(attachment.cloudStoragePath);
  const downloadUrl = resolved.downloadUrl ?? buildTripAttachmentDownloadUrl(attachment.id);
  if (!resolved.downloadAvailable) {
    logStorageIssue('attachment-not-readable', attachment.cloudStoragePath);
  }
  return {
    ...attachment,
    downloadUrl,
    downloadAvailable: resolved.downloadAvailable,
    storage: resolved.storage,
    fileSizeBytes,
    storageReadable: resolved.downloadAvailable,
  };
}

export async function readStoredAttachmentFile(cloudStoragePath: string): Promise<Buffer> {
  if (!isLocalStoragePath(cloudStoragePath)) {
    logStorageIssue('read-non-local-path', cloudStoragePath);
    throw new Error('Файл доступен только из локального хранилища');
  }

  const absolute = localFileAbsolutePath(cloudStoragePath);
  if (!absolute) throw new Error('Invalid local storage path');
  return fs.readFile(absolute);
}

export async function deleteStoredFile(cloudStoragePath: string | null | undefined) {
  if (!cloudStoragePath) return;
  if (isLocalStoragePath(cloudStoragePath)) {
    const absolute = localFileAbsolutePath(cloudStoragePath);
    if (!absolute) return;
    try {
      await fs.unlink(absolute);
    } catch {
      // ignore missing files for idempotent delete
    }
    return;
  }
  logStorageIssue('delete-non-local-path', cloudStoragePath);
}
