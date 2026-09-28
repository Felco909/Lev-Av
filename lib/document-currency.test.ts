import { describe, it, expect } from 'vitest';
import { bankDetailsForCurrency, defaultDocCurrency, isDocCurrency } from './document-currency';
import { generateInvoiceHtml, generateActHtml } from './document-templates';

const RUB_BANK = 'Банк: ПАО Сбербанк\nБИК 044525225\nр/с 40702810000000000001';
const USD_BANK = 'Beneficiary: LEV END AV LLC\nIBAN: AM00000000000000\nSWIFT: TESTAM22';
const settings = { company_name: 'ООО «Лев Энд Ав»', company_bank: RUB_BANK, company_bank_usd: USD_BANK };

const trip = {
  tripNumber: 'TMS-2026-0001',
  tripDate: '2026-08-01',
  routeFrom: 'Ереван',
  routeTo: 'Москва',
  tripType: 'expedition',
  clientRate: 1500,
  carrierRate: null,
  profit: 0,
  currency: 'USD',
  client: { name: 'ООО Клиент', inn: '00000000', address: 'Москва' },
} as any;

function render(currency: 'RUB' | 'USD') {
  const ov = { currency, company: { ...settings, company_bank: bankDetailsForCurrency(settings, currency) } };
  return { invoice: generateInvoiceHtml(trip, ov), act: generateActHtml(trip, ov) };
}

describe('реквизиты по валюте счёта/акта', () => {
  it('RUB → рублёвые реквизиты, USD-реквизиты в счёт не попадают', () => {
    const { invoice } = render('RUB');
    expect(invoice).toContain('БИК 044525225');
    expect(invoice).not.toContain('SWIFT: TESTAM22');
    expect(invoice).toContain('1 500 RUB');
  });

  it('USD → долларовые реквизиты, RUB-реквизиты в счёт не попадают', () => {
    const { invoice } = render('USD');
    expect(invoice).toContain('SWIFT: TESTAM22');
    expect(invoice).not.toContain('БИК 044525225');
    expect(invoice).toContain('1 500 USD');
  });

  it('акт получает ту же валюту суммы', () => {
    expect(render('USD').act).toContain('1 500 USD');
    expect(render('RUB').act).toContain('1 500 RUB');
  });

  it('пустые USD-реквизиты не подменяются рублёвыми', () => {
    expect(bankDetailsForCurrency({ company_bank: RUB_BANK }, 'USD')).toBe('');
  });
});

describe('валюта по умолчанию', () => {
  it('последняя выданная валюта важнее валюты заявки', () => {
    expect(defaultDocCurrency('RUB', 'USD')).toBe('USD');
    expect(defaultDocCurrency('USD', 'RUB')).toBe('RUB');
  });

  it('старые заявки без выдачи: USD-заявка → USD, остальные → RUB', () => {
    expect(defaultDocCurrency('USD', null)).toBe('USD');
    expect(defaultDocCurrency('RUB', null)).toBe('RUB');
    expect(defaultDocCurrency('EUR', undefined)).toBe('RUB');
    expect(defaultDocCurrency(null)).toBe('RUB');
  });

  it('isDocCurrency принимает только RUB/USD', () => {
    expect(isDocCurrency('USD')).toBe(true);
    expect(isDocCurrency('EUR')).toBe(false);
    expect(isDocCurrency(undefined)).toBe(false);
  });
});
