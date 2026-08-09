import { describe, it, expect } from 'vitest';
import { generateInvoiceHtml, generateActHtml, type DocOverrides } from './document-templates';

const trip = {
  tripNumber: 'TMS-2026-0001',
  tripDate: '2026-08-01',
  routeFrom: 'Ереван',
  routeTo: 'Москва',
  tripType: 'own_transport',
  clientRate: 100000,
  carrierRate: null,
  profit: 100000,
  currency: 'AMD',
  client: { name: 'ООО Клиент', inn: '00000000', address: 'Ереван' },
} as any;

describe('НДС в счёте и акте — единый источник (аудит 2026-08-06: акт не показывал НДС)', () => {
  it('счёт по умолчанию (без явной ставки) показывает «НДС 0%»', () => {
    expect(generateInvoiceHtml(trip)).toContain('НДС 0%');
  });

  it('акт по умолчанию (без явной ставки) тоже показывает «НДС 0%» — раньше не показывал вообще', () => {
    expect(generateActHtml(trip)).toContain('НДС 0%');
  });

  it.each([
    ['НДС 0%'],
    ['НДС 20%'],
    ['Без НДС'],
  ])('счёт и акт показывают одинаковую ставку %s', (ndsTax) => {
    const ov: DocOverrides = { ndsTax };
    const invoiceHtml = generateInvoiceHtml(trip, ov);
    const actHtml = generateActHtml(trip, ov);
    expect(invoiceHtml).toContain(ndsTax);
    expect(actHtml).toContain(ndsTax);
  });

  it('очищенное поле НДС (пустая строка, не undefined) убирает строку НДС из обоих документов (аудит 2026-08-07)', () => {
    const ov: DocOverrides = { ndsTax: '' };
    const invoiceHtml = generateInvoiceHtml(trip, ov);
    const actHtml = generateActHtml(trip, ov);
    expect(invoiceHtml).not.toContain('НДС');
    expect(actHtml).not.toContain('НДС');
    expect(invoiceHtml).not.toMatch(/<small><\/small>/);
    expect(actHtml).not.toMatch(/<small><\/small>/);
  });
});
