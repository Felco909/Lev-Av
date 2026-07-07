import type { Client, Trip } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { getNextDocNumberPair, syncClientCountersFromDocDisplays } from '@/lib/doc-numbering';

export type TripDocOverrides = Record<string, unknown>;

/**
 * Если в overrides переданы оба номера (счёт и акт), считаем их источником истины:
 * не используем автосчётчик, даже если клиент прислал useAutoNumber: true.
 */
export function effectiveDocNumberOverrides(o: TripDocOverrides | undefined | null): TripDocOverrides {
  const raw = (o || {}) as TripDocOverrides;
  const inv = typeof raw.invoiceNumber === 'string' ? raw.invoiceNumber.trim() : '';
  const act = typeof raw.actNumber === 'string' ? raw.actNumber.trim() : '';
  const explicitPair = !!(inv && act);
  const useAutoNumber = explicitPair ? false : raw.useAutoNumber !== false;
  return { ...raw, useAutoNumber };
}

function parseIsoDate(s?: string | null): Date | undefined {
  if (!s || typeof s !== 'string') return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export type ResolvedTripDoc = {
  docNumber: string;
  docDate?: string;
  tripPatch: {
    invoiceDocNumber?: string | null;
    actDocNumber?: string | null;
    invoiceDocDate?: Date | null;
    actDocDate?: Date | null;
  };
  syncManualCounters: boolean;
  invoiceDisplayForSync?: string | null;
  actDisplayForSync?: string | null;
};

/**
 * Определяет номер и дату документа для генерации PDF/DOCX.
 * При авто: один раз резервирует пару через getNextDocNumberPair и сохраняет оба номера в заявке.
 * При ручном: берёт строки из overrides, не вызывает автоинкремент.
 */
export async function resolveTripDocumentNumber(params: {
  prisma: PrismaClient;
  trip: Trip & { client?: Client | null };
  documentType: 'invoice' | 'act';
  overrides: TripDocOverrides;
}): Promise<ResolvedTripDoc> {
  const { prisma, trip, documentType } = params;
  const o = effectiveDocNumberOverrides(params.overrides);
  const useAuto = o.useAutoNumber !== false;

  const invDateStr =
    (typeof o.invoiceDocDate === 'string' && o.invoiceDocDate) ||
    (typeof o.docDate === 'string' && o.docDate) ||
    undefined;
  const actDateStr =
    (typeof o.actDocDate === 'string' && o.actDocDate) ||
    (typeof o.docDate === 'string' && o.docDate) ||
    undefined;

  const tripPatch: ResolvedTripDoc['tripPatch'] = {};
  let syncManualCounters = false;
  let invoiceDisplayForSync: string | null = null;
  let actDisplayForSync: string | null = null;

  if (documentType === 'invoice') {
    const docDate = invDateStr;
    if (!useAuto) {
      const manual =
        (typeof o.invoiceNumber === 'string' && o.invoiceNumber.trim()) ||
        (typeof o.docNumber === 'string' && o.docNumber.trim()) ||
        '';
      if (!manual) throw new Error('Укажите номер счёта или включите автоматическую нумерацию');
      tripPatch.invoiceDocNumber = manual;
      if (docDate) tripPatch.invoiceDocDate = parseIsoDate(docDate) ?? null;
      syncManualCounters = true;
      invoiceDisplayForSync = manual;
      if (typeof o.actNumber === 'string' && o.actNumber.trim()) actDisplayForSync = o.actNumber.trim();
      return {
        docNumber: manual,
        docDate,
        tripPatch,
        syncManualCounters,
        invoiceDisplayForSync,
        actDisplayForSync,
      };
    }

    if (trip.invoiceDocNumber) {
      if (docDate) tripPatch.invoiceDocDate = parseIsoDate(docDate) ?? null;
      return {
        docNumber: trip.invoiceDocNumber,
        docDate,
        tripPatch,
        syncManualCounters: false,
      };
    }

    if (!trip.clientId) throw new Error('У заявки нет клиента — нумерация невозможна');
    const pair = await getNextDocNumberPair(trip.clientId);
    tripPatch.invoiceDocNumber = pair.invoiceNumber;
    tripPatch.actDocNumber = pair.actNumber;
    if (docDate) tripPatch.invoiceDocDate = parseIsoDate(docDate) ?? null;

    await prisma.trip.update({
      where: { id: trip.id },
      data: {
        invoiceDocNumber: pair.invoiceNumber,
        actDocNumber: pair.actNumber,
        ...(tripPatch.invoiceDocDate ? { invoiceDocDate: tripPatch.invoiceDocDate } : {}),
      },
    });

    return {
      docNumber: pair.invoiceNumber,
      docDate,
      tripPatch: {},
      syncManualCounters: false,
    };
  }

  const docDate = actDateStr;
  if (!useAuto) {
    const manual =
      (typeof o.actNumber === 'string' && o.actNumber.trim()) ||
      (typeof o.docNumber === 'string' && o.docNumber.trim()) ||
      '';
    if (!manual) throw new Error('Укажите номер акта или включите автоматическую нумерацию');
    tripPatch.actDocNumber = manual;
    if (docDate) tripPatch.actDocDate = parseIsoDate(docDate) ?? null;
    syncManualCounters = true;
    actDisplayForSync = manual;
    if (typeof o.invoiceNumber === 'string' && o.invoiceNumber.trim()) invoiceDisplayForSync = o.invoiceNumber.trim();
    return {
      docNumber: manual,
      docDate,
      tripPatch,
      syncManualCounters,
      invoiceDisplayForSync,
      actDisplayForSync,
    };
  }

  if (trip.actDocNumber) {
    if (docDate) tripPatch.actDocDate = parseIsoDate(docDate) ?? null;
    return {
      docNumber: trip.actDocNumber,
      docDate,
      tripPatch,
      syncManualCounters: false,
    };
  }

  if (!trip.clientId) throw new Error('У заявки нет клиента — нумерация невозможна');
  const pair = await getNextDocNumberPair(trip.clientId);
  tripPatch.invoiceDocNumber = pair.invoiceNumber;
  tripPatch.actDocNumber = pair.actNumber;
  if (docDate) tripPatch.actDocDate = parseIsoDate(docDate) ?? null;

  await prisma.trip.update({
    where: { id: trip.id },
    data: {
      invoiceDocNumber: pair.invoiceNumber,
      actDocNumber: pair.actNumber,
      ...(tripPatch.actDocDate ? { actDocDate: tripPatch.actDocDate } : {}),
    },
  });

  return {
    docNumber: pair.actNumber,
    docDate,
    tripPatch: {},
    syncManualCounters: false,
  };
}

export async function persistTripDocPatches(prisma: PrismaClient, tripId: string, patch: ResolvedTripDoc['tripPatch']) {
  const data: Record<string, unknown> = {};
  if (patch.invoiceDocNumber !== undefined) data.invoiceDocNumber = patch.invoiceDocNumber;
  if (patch.actDocNumber !== undefined) data.actDocNumber = patch.actDocNumber;
  if (patch.invoiceDocDate !== undefined) data.invoiceDocDate = patch.invoiceDocDate;
  if (patch.actDocDate !== undefined) data.actDocDate = patch.actDocDate;
  if (Object.keys(data).length === 0) return;
  await prisma.trip.update({ where: { id: tripId }, data: data as any });
}

export async function maybeSyncManualCounters(
  prisma: PrismaClient,
  clientId: string | null | undefined,
  invoiceFull?: string | null,
  actFull?: string | null
) {
  if (!clientId) return;
  await syncClientCountersFromDocDisplays(prisma, clientId, invoiceFull, actFull);
}
