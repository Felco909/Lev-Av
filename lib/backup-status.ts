import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Проверка свежести бэкапа БД — локального pg_dump и его копии на Google Drive
 * (см. scripts/pg-backup-daily.ps1, scripts/copy-sql-backup-to-google-drive.ps1).
 * Копирование на Google Drive может простаивать сутками без единого видимого предупреждения —
 * авто-remount диска G: при сбое просто пишет WARN/SKIP в лог-файл, который никто проактивно
 * не читает (TMS-AUDIT-0042, живой инцидент: разрыв 4 дня, 05-09.08.2026, найден и устранён
 * вручную во время аудита). Локальный pg_dump при этом не зависит от Google Drive и продолжает
 * идти исправно — это ДВА независимых сигнала, не один.
 */

export interface SingleBackupStatus {
  lastAt: Date | null;
  ageHours: number | null;
}

export interface BackupStatus {
  /** Путь, из которого читались логи/дампы — для диагностики, если что-то не совпало. */
  backupRoot: string;
  local: SingleBackupStatus;
  googleDrive: SingleBackupStatus;
}

/** Та же логика, что в scripts/pg-backup-daily.ps1 (param $BackupRoot) — env var, иначе
 *  D:\LevAv_Backups, а если диска D: нет — %USERPROFILE%\LevAv_Postgres_Backups. */
function resolveBackupRoot(): string {
  const envRoot = process.env.LEVAV_PG_BACKUP_ROOT;
  if (envRoot) return envRoot;
  const defaultRoot = 'D:\\LevAv_Backups';
  try {
    fs.accessSync('D:\\');
    return defaultRoot;
  } catch {
    return path.join(os.homedir(), 'LevAv_Postgres_Backups');
  }
}

function ageHoursSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

function getLocalBackupStatus(backupRoot: string): SingleBackupStatus {
  try {
    const dbDir = path.join(backupRoot, 'db');
    const files = fs.readdirSync(dbDir).filter((f) => /^levav_prod_local_.*\.sql$/.test(f));
    if (files.length === 0) return { lastAt: null, ageHours: null };
    let newest: Date | null = null;
    for (const f of files) {
      const stat = fs.statSync(path.join(dbDir, f));
      if (!newest || stat.mtime > newest) newest = stat.mtime;
    }
    return newest ? { lastAt: newest, ageHours: ageHoursSince(newest) } : { lastAt: null, ageHours: null };
  } catch {
    return { lastAt: null, ageHours: null };
  }
}

const OK_LINE_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) OK copied to Google Drive:/;

function getGoogleDriveBackupStatus(backupRoot: string): SingleBackupStatus {
  try {
    const logPath = path.join(backupRoot, 'logs', 'google_drive_backup.log');
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    let lastAt: Date | null = null;
    for (const line of lines) {
      const m = line.match(OK_LINE_RE);
      if (!m) continue;
      // "yyyy-MM-dd HH:mm:ss" — локальное время машины, парсим вручную (не ISO, new Date()
      // сам по себе на некоторых платформах трактует пробел-разделённые даты непредсказуемо).
      const d = new Date(m[1].replace(' ', 'T'));
      if (!isNaN(d.getTime()) && (!lastAt || d > lastAt)) lastAt = d;
    }
    return lastAt ? { lastAt, ageHours: ageHoursSince(lastAt) } : { lastAt: null, ageHours: null };
  } catch {
    return { lastAt: null, ageHours: null };
  }
}

export function getBackupStatus(): BackupStatus {
  const backupRoot = resolveBackupRoot();
  return {
    backupRoot,
    local: getLocalBackupStatus(backupRoot),
    googleDrive: getGoogleDriveBackupStatus(backupRoot),
  };
}
