import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

const SOFFICE_CANDIDATES = [
  process.env.SOFFICE_PATH,
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'soffice',
].filter((p): p is string => !!p);

/**
 * Аудит 2026-08-09: цикл по кандидатам soffice глотал реальную ошибку — если ПЕРВЫЙ
 * (существующий) путь падал по таймауту, код на это тихо пробовал следующие кандидаты
 * (которых на этой машине физически нет), и в логе оставалась только последняя, вводящая
 * в заблуждение ошибка "ENOENT" вместо настоящей "таймаут". Дальше по кандидатам идём
 * ТОЛЬКО если бинарник не найден/не запускается (ENOENT/EACCES) — любая другая ошибка
 * (таймаут, сбой самой конвертации) получена от реально запустившегося soffice, и её
 * нужно показать как есть, а не маскировать попыткой запустить несуществующий путь.
 */
async function execSoffice(args: string[], timeoutMs = 60_000): Promise<void> {
  let lastError: unknown = null;
  for (const soffice of SOFFICE_CANDIDATES) {
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(soffice, args, { timeout: timeoutMs }, (err) => {
          if (err) reject(err); else resolve();
        });
      });
      return;
    } catch (e: any) {
      lastError = e;
      if (e?.code !== 'ENOENT' && e?.code !== 'EACCES') break;
    }
  }
  throw lastError;
}

/**
 * Прогретый профиль LibreOffice, переиспользуемый между вызовами (аудит 2026-08-07:
 * реальная генерация счёта/акта занимала ~40 сек на документ вместо документированных
 * 13-14 — -env:UserInstallation каждый раз указывал на только что созданную ПУСТУЮ
 * директорию, и LibreOffice заново строил профиль с нуля — реестр UNO, кэш шрифтов и
 * т.п. Измерено: постройка профиля с нуля ~40 сек, конвертация с готовым профилем ~5 сек,
 * при 4 параллельных вызовах с копией одного и того же прогретого профиля — тоже без
 * ошибок и с корректным непустым результатом у каждого (см. диагностику).
 *
 * Templates-директория переживает перезапуск сервера (лежит в .runtime/, не в os.tmpdir()) —
 * первый вызов после деплоя платит ~40 сек один раз, все последующие — уже быстрые.
 * Сам прогретый профиль НИКОГДА не передаётся в soffice напрямую — только его копия в
 * tmpDir конкретного вызова, иначе конкурентные вызовы будут писать в один и тот же
 * профиль и ловить блокировку — тот самый баг, из-за которого профиль вообще стал
 * одноразовым на вызов. Если профиль когда-нибудь испортится (например, после апгрейда
 * LibreOffice на машине) — просто удалить .runtime/soffice-profile-template, он
 * перестроится сам при следующем вызове.
 */
const TEMPLATE_PROFILE_DIR = path.join(process.cwd(), '.runtime', 'soffice-profile-template');
let templateReady: Promise<void> | null = null;

async function ensureTemplateProfile(): Promise<void> {
  if (!templateReady) {
    templateReady = buildTemplateProfile().catch((e) => {
      templateReady = null; // allow retry on the next call if building failed
      throw e;
    });
  }
  return templateReady;
}

async function buildTemplateProfile(): Promise<void> {
  try {
    await fs.access(TEMPLATE_PROFILE_DIR);
    return; // already built by this process or an earlier server run
  } catch {}

  const buildTmp = await fs.mkdtemp(path.join(os.tmpdir(), 'levav-pdf-warmup-'));
  try {
    const htmlPath = path.join(buildTmp, 'warmup.html');
    await fs.writeFile(htmlPath, '<!DOCTYPE html><html><body>warmup</body></html>', 'utf-8');
    const builtProfile = path.join(buildTmp, 'profile');
    const profileUrl = 'file:///' + builtProfile.replace(/\\/g, '/');
    // Первая когда-либо сборка профиля — самая медленная и самая непредсказуемая по
    // времени операция во всём модуле (наблюдалось от ~40 сек до полного таймаута под
    // нагрузкой) — даём ей отдельный, более щедрый бюджет, а не общий 60-секундный,
    // рассчитанный на обычную конвертацию с уже готовым профилем.
    await execSoffice([
      `-env:UserInstallation=${profileUrl}`,
      '--headless', '--convert-to', 'pdf', '--outdir', buildTmp, htmlPath,
    ], 150_000);
    await fs.mkdir(path.dirname(TEMPLATE_PROFILE_DIR), { recursive: true });
    await fs.rm(TEMPLATE_PROFILE_DIR, { recursive: true, force: true }).catch(() => {});
    try {
      await fs.rename(builtProfile, TEMPLATE_PROFILE_DIR);
    } catch {
      // rename can fail across filesystems/drives — fall back to copy.
      await fs.cp(builtProfile, TEMPLATE_PROFILE_DIR, { recursive: true });
    }
  } finally {
    await fs.rm(buildTmp, { recursive: true, force: true }).catch(() => {});
  }
}

// Converts a source file to PDF locally via LibreOffice headless — no external/paid service required.
// Each call gets its own COPY of the warmed-up profile — running multiple headless instances against
// the shared default profile causes the second one to fail to acquire the profile lock and exit silently.
async function convertFileToPdf(sourcePath: string, tmpDir: string): Promise<Buffer> {
  const pdfPath = path.join(tmpDir, `${path.parse(sourcePath).name}.pdf`);
  const profileDir = path.join(tmpDir, 'profile');

  await ensureTemplateProfile();
  await fs.cp(TEMPLATE_PROFILE_DIR, profileDir, { recursive: true });

  const profileUrl = 'file:///' + profileDir.replace(/\\/g, '/');
  await execSoffice([
    `-env:UserInstallation=${profileUrl}`,
    '--headless', '--convert-to', 'pdf', '--outdir', tmpDir, sourcePath,
  ]);

  return await fs.readFile(pdfPath);
}

export async function convertDocxBufferToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'levav-pdf-'));
  const docxPath = path.join(tmpDir, `${randomUUID()}.docx`);
  try {
    await fs.writeFile(docxPath, docxBuffer);
    return await convertFileToPdf(docxPath, tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function convertHtmlToPdf(html: string): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'levav-pdf-'));
  const htmlPath = path.join(tmpDir, `${randomUUID()}.html`);
  try {
    await fs.writeFile(htmlPath, html, 'utf-8');
    return await convertFileToPdf(htmlPath, tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
