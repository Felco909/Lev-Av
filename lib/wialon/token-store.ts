/**
 * Хранение Wialon API-токена в БД (таблица Setting, ключ WIALON_TOKEN_SETTING_KEY) вместо
 * только .env — чтобы токен можно было менять через UI («Телематика») без редеплоя.
 * Шифруется AES-256-GCM ключом, выведенным из NEXTAUTH_SECRET (уже обязателен для NextAuth,
 * отдельный секрет заводить не нужно). Если в БД токена нет — вызывающая сторона сама
 * падает обратно на process.env.WIALON_TOKEN (см. lib/wialon/client.ts login()).
 */
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

const SETTING_KEY = 'wialon_api_token';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // стандартная длина IV для GCM
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET не задан — нужен для шифрования Wialon-токена в БД');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptToken(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptToken(payload: string): string {
  const key = getEncryptionKey();
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/** Токен из БД (расшифрованный) — null, если не задан или не удалось расшифровать. */
export async function getStoredWialonToken(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return null;
  try {
    return decryptToken(row.value);
  } catch (e) {
    console.error('[wialon/token-store] Не удалось расшифровать сохранённый токен:', e);
    return null;
  }
}

export async function saveWialonToken(plainToken: string): Promise<void> {
  const encrypted = encryptToken(plainToken);
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value: encrypted },
    create: { key: SETTING_KEY, value: encrypted },
  });
}

export async function clearWialonToken(): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: SETTING_KEY } });
}

/** Токен для отображения в UI — не палим значение целиком. */
export function maskToken(token: string): string {
  if (token.length <= 8) return '••••••••';
  return `••••${token.slice(-4)}`;
}
