import { prisma } from '@/lib/prisma';

/**
 * Atomically generates the next document number for a client.
 * Uses a UNIFIED counter: max(lastInvoiceNum, lastActNum) + 1,
 * so invoice and act numbers always stay in sync.
 */
export async function getNextDocNumber(
  clientId: string,
  docType: 'invoice' | 'act'
): Promise<string> {
  const currentYear = new Date().getFullYear();

  const result = await prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({
      where: { id: clientId },
      select: {
        lastInvoiceNum: true,
        lastActNum: true,
        invoicePrefix: true,
        actPrefix: true,
        numberFormat: true,
        resetNumberingYearly: true,
        lastResetYear: true,
      },
    });

    if (!client) throw new Error('Client not found');

    let currentMax = Math.max(client.lastInvoiceNum, client.lastActNum);
    const prefix = docType === 'invoice' ? client.invoicePrefix : client.actPrefix;
    const format = client.numberFormat || '{prefix}-{number}';

    // Check if we need to reset for the new year
    if (client.resetNumberingYearly && client.lastResetYear !== currentYear) {
      currentMax = 0;
      await tx.client.update({
        where: { id: clientId },
        data: { lastInvoiceNum: 0, lastActNum: 0, lastResetYear: currentYear },
      });
    }

    const nextNum = currentMax + 1;

    // Update BOTH counters to keep them in sync
    await tx.client.update({
      where: { id: clientId },
      data: { lastInvoiceNum: nextNum, lastActNum: nextNum },
    });

    return formatDocNumber(format, prefix, nextNum, currentYear);
  });

  return result;
}

/**
 * Atomically generates a PAIR of document numbers (invoice + act) with the same sequence number.
 * Both counters are incremented to the same value in a single transaction.
 */
export async function getNextDocNumberPair(
  clientId: string
): Promise<{ invoiceNumber: string; actNumber: string; seqNum: number }> {
  const currentYear = new Date().getFullYear();

  const result = await prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({
      where: { id: clientId },
      select: {
        lastInvoiceNum: true,
        lastActNum: true,
        invoicePrefix: true,
        actPrefix: true,
        numberFormat: true,
        resetNumberingYearly: true,
        lastResetYear: true,
      },
    });

    if (!client) throw new Error('Client not found');

    let currentMax = Math.max(client.lastInvoiceNum, client.lastActNum);
    const format = client.numberFormat || '{prefix}-{number}';

    if (client.resetNumberingYearly && client.lastResetYear !== currentYear) {
      currentMax = 0;
      await tx.client.update({
        where: { id: clientId },
        data: { lastInvoiceNum: 0, lastActNum: 0, lastResetYear: currentYear },
      });
    }

    const nextNum = currentMax + 1;

    await tx.client.update({
      where: { id: clientId },
      data: { lastInvoiceNum: nextNum, lastActNum: nextNum },
    });

    return {
      invoiceNumber: formatDocNumber(format, client.invoicePrefix, nextNum, currentYear),
      actNumber: formatDocNumber(format, client.actPrefix, nextNum, currentYear),
      seqNum: nextNum,
    };
  });

  return result;
}

/**
 * Formats a document number using the template.
 * Supported placeholders: {prefix}, {number}, {year}
 * {number} is zero-padded to 3 digits.
 */
export function formatDocNumber(
  format: string,
  prefix: string,
  num: number,
  year: number
): string {
  const paddedNum = String(num).padStart(3, '0');
  return format
    .replace(/\{prefix\}/g, prefix)
    .replace(/\{number\}/g, paddedNum)
    .replace(/\{year\}/g, String(year));
}

/**
 * Preview what the next number would look like without incrementing.
 * Uses max(lastInvoiceNum, lastActNum) as the base.
 */
export async function previewNextDocNumber(
  clientId: string,
  docType: 'invoice' | 'act'
): Promise<string> {
  const currentYear = new Date().getFullYear();

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      lastInvoiceNum: true,
      lastActNum: true,
      invoicePrefix: true,
      actPrefix: true,
      numberFormat: true,
      resetNumberingYearly: true,
      lastResetYear: true,
    },
  });

  if (!client) return '---';

  let currentMax = Math.max(client.lastInvoiceNum, client.lastActNum);
  const prefix = docType === 'invoice' ? client.invoicePrefix : client.actPrefix;
  const format = client.numberFormat || '{prefix}-{number}';

  if (client.resetNumberingYearly && client.lastResetYear !== currentYear) {
    currentMax = 0;
  }

  return formatDocNumber(format, prefix, currentMax + 1, currentYear);
}