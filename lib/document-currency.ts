/**
 * Currency of a client invoice/act pair and the bank requisites that go with it.
 *
 * Two independent requisite sets live in Setting: `company_bank` (RUB, the original one)
 * and `company_bank_usd`. The chosen currency picks the set; the document template itself
 * stays the same and just receives it as `company_bank`.
 */
export const DOC_CURRENCIES = ['RUB', 'USD'] as const;
export type DocCurrency = (typeof DOC_CURRENCIES)[number];

export const DOC_CURRENCY_LABELS: Record<DocCurrency, string> = { RUB: 'RUB ₽', USD: 'USD $' };

const BANK_SETTING_KEY: Record<DocCurrency, string> = { RUB: 'company_bank', USD: 'company_bank_usd' };

export function isDocCurrency(value: unknown): value is DocCurrency {
  return typeof value === 'string' && (DOC_CURRENCIES as readonly string[]).includes(value);
}

/**
 * Currency pre-selected in the document dialog: the one the last pair for this trip was
 * issued in, otherwise USD for USD trips and RUB for everything else (so RUB trips work
 * exactly as before, and USD trips don't suddenly get a "rouble" invoice).
 */
export function defaultDocCurrency(tripCurrency: string | null | undefined, lastIssued?: string | null): DocCurrency {
  if (isDocCurrency(lastIssued)) return lastIssued;
  return tripCurrency === 'USD' ? 'USD' : 'RUB';
}

export function bankDetailsForCurrency(settings: Record<string, string | undefined>, currency: DocCurrency): string {
  return (settings[BANK_SETTING_KEY[currency]] || '').trim();
}
