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

// Converts a source file to PDF locally via LibreOffice headless — no external/paid service required.
// Each call gets its own LibreOffice user profile — running multiple headless instances against the
// shared default profile causes the second one to fail to acquire the profile lock and exit silently.
async function convertFileToPdf(sourcePath: string, tmpDir: string): Promise<Buffer> {
  const pdfPath = path.join(tmpDir, `${path.parse(sourcePath).name}.pdf`);
  const profileDir = path.join(tmpDir, 'profile');
  const profileUrl = 'file:///' + profileDir.replace(/\\/g, '/');

  let lastError: unknown = null;
  for (const soffice of SOFFICE_CANDIDATES) {
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(soffice, [
          `-env:UserInstallation=${profileUrl}`,
          '--headless', '--convert-to', 'pdf', '--outdir', tmpDir, sourcePath,
        ], { timeout: 60_000 }, (err) => {
          if (err) reject(err); else resolve();
        });
      });
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError) throw lastError;

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
