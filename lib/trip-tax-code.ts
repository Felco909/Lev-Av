/** Налоговый код заявки (отдельно от серии счёта). */

export function normalizeTaxCode(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

export function isTaxCodePresent(value: string | null | undefined): boolean {
  return normalizeTaxCode(value).length > 0;
}

export type TaxCodeIndicator = 'present' | 'missing';

export function taxCodeIndicator(value: string | null | undefined): TaxCodeIndicator {
  return isTaxCodePresent(value) ? 'present' : 'missing';
}

export function taxCodeIndicatorLabel(value: string | null | undefined): string {
  return isTaxCodePresent(value) ? 'Налоговый код: есть' : 'Налоговый код: нет';
}
