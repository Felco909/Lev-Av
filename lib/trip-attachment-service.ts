import type { TripAttachmentSection } from '@/lib/trip-attachment-section';

export type TripAttachmentStorageCategory =
  | 'contracts'
  | 'invoices'
  | 'acts'
  | 'signed'
  | 'other'
  | 'client-contracts';

export const TRIP_ATTACHMENT_SECTION_DESCRIPTIONS: Record<TripAttachmentSection, string> = {
  contract: 'DOC_TYPE:contract_request | Договор-заявка',
  invoice: 'DOC_TYPE:invoice | Счёт',
  act: 'DOC_TYPE:act | Акт',
  signed: 'DOC_TYPE:signed | Загруженные подписанные документы',
  other: 'DOC_TYPE:other | Прочие документы',
};

export const TRIP_ATTACHMENT_STORAGE_CATEGORY: Record<TripAttachmentSection, TripAttachmentStorageCategory> = {
  contract: 'contracts',
  invoice: 'invoices',
  act: 'acts',
  signed: 'signed',
  other: 'other',
};

export function tripSectionToStorageCategory(section: TripAttachmentSection): TripAttachmentStorageCategory {
  return TRIP_ATTACHMENT_STORAGE_CATEGORY[section];
}

export function tripDescriptionToStorageCategory(description: string): TripAttachmentStorageCategory {
  if (description.includes('DOC_TYPE:contract_request') || description.includes('DOC_TYPE:contract')) return 'contracts';
  if (description.includes('DOC_TYPE:invoice')) return 'invoices';
  if (description.includes('DOC_TYPE:act')) return 'acts';
  if (description.includes('DOC_TYPE:signed')) return 'signed';
  return 'other';
}
