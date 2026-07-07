export type TripAttachmentSection = 'contract' | 'invoice' | 'act' | 'signed' | 'other';

export const TRIP_ATTACHMENT_SECTION_LABELS: Record<TripAttachmentSection, string> = {
  contract: 'Договор-заявка',
  invoice: 'Счёт',
  act: 'Акт',
  signed: 'Загруженные подписанные документы',
  other: 'Прочие документы',
};

export function detectTripAttachmentSection(att: {
  fileName: string;
  description?: string | null;
}): TripAttachmentSection {
  const description = (att.description || '').toLowerCase();
  const fileName = (att.fileName || '').toLowerCase();
  const docTypeMatch = description.match(/doc_type:([a-z_]+)/i);
  if (docTypeMatch) {
    const docType = docTypeMatch[1];
    if (docType === 'contract_request' || docType === 'contract') return 'contract';
    if (docType === 'invoice') return 'invoice';
    if (docType === 'act') return 'act';
    if (docType === 'signed') return 'signed';
    if (docType === 'other') return 'other';
  }

  const text = `${fileName} ${description}`;
  if (/договор|заявк|dogovor|contract/.test(text)) return 'contract';
  if (/сч[её]т|schet|invoice/.test(text)) return 'invoice';
  if (/акт|akt|doc_type:act|(^|[\s_./-])act($|[\s_./-])/.test(text)) return 'act';
  if (/подписан|signed/.test(text)) return 'signed';
  return 'other';
}

export function getTripAttachmentStorageMessage(att: {
  storageReadable?: boolean;
}): string | null {
  if (att.storageReadable !== false) return null;
  return 'Файл отсутствует';
}
