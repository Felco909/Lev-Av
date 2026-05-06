import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { prisma } from '@/lib/prisma';
import { getFileBuffer } from '@/lib/s3';

/**
 * Check if a custom template exists for the given document type.
 * Returns the template buffer if found, null otherwise.
 */
export async function getCustomTemplate(documentType: string): Promise<Buffer | null> {
  try {
    const template = await prisma.documentTemplate.findUnique({
      where: { documentType },
    });
    if (!template) return null;
    const buffer = await getFileBuffer(template.cloudStoragePath);
    return buffer;
  } catch (error) {
    console.error(`Error fetching template ${documentType}:`, error);
    return null;
  }
}

/**
 * Get client-specific template for a document type.
 * Falls back to global template if client doesn't have one.
 */
export async function getClientTemplate(clientId: string | null | undefined, documentType: string): Promise<Buffer | null> {
  if (clientId) {
    try {
      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (client) {
        const pathField = documentType === 'invoice' ? 'invoiceTemplatePath' : documentType === 'act' ? 'actTemplatePath' : null;
        const path = pathField ? (client as any)[pathField] : null;
        if (path) {
          try {
            const buffer = await getFileBuffer(path);
            return buffer;
          } catch (e) {
            console.error(`Error fetching client template ${documentType} for client ${clientId}:`, e);
          }
        }
      }
    } catch (e) {
      console.error(`Error looking up client template:`, e);
    }
  }
  // Fallback to global template
  return getCustomTemplate(documentType);
}

/**
 * Process a .docx template with docxtemplater, replacing {placeholders} with data.
 * Uses single curly brace delimiters: {placeholder_name}
 */
export function processDocxTemplate(templateBuffer: Buffer, data: Record<string, string>): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  doc.render(data);

  const buf = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  return buf as Buffer;
}

/**
 * Load company settings from the database.
 */
export async function getCompanySettings(): Promise<Record<string, string>> {
  try {
    const settings = await prisma.setting.findMany();
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    return result;
  } catch {
    return {};
  }
}
