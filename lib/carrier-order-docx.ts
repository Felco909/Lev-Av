import fs from 'fs';
import path from 'path';
import { getCustomTemplate, processDocxTemplate } from '@/lib/template-processor';

/**
 * Заявка-договор перевозчику — точка истины: три готовых .docx-шаблона
 * (templates/carrier-order/order-{ru,hy,en}.docx), заполняются через
 * общий processDocxTemplate() (lib/template-processor.ts) с плейсхолдерами
 * {{field}} — тот же движок докстемплейтера, что и у счёта/акта, только со
 * своими делимитерами. Заменяет собой прежний программно собираемый (docx.js)
 * генератор — см. историю doc-generators.ts.
 *
 * Кастомный шаблон, загруженный админом через /settings ("Заявка перевозчику",
 * documentType 'carrier_request', см. app/(app)/settings/page.tsx), применяется
 * только для RU — это единственный язык, для которого была изначально задумана
 * эта загрузка; для HY/EN всегда используется встроенный локализованный файл.
 */
export type CarrierOrderLang = 'ru' | 'hy' | 'en';

export interface CarrierOrderData {
  application_number: string;
  application_date: string;
  issued_by: string;
  company_name: string;
  company_address: string;
  company_inn: string;
  company_phone: string;
  carrier_name: string;
  carrier_address: string;
  carrier_tin: string;
  carrier_phone: string;
  carrier_contact_person: string;
  route: string;
  loading_place: string;
  loading_date: string;
  loading_time: string;
  loading_contact: string;
  unloading_place: string;
  unloading_date: string;
  unloading_time: string;
  unloading_contact: string;
  cargo: string;
  weight: string;
  volume: string;
  packaging_type: string;
  places_count: string;
  vehicle_type: string;
  vehicle_number: string;
  trailer_number: string;
  driver: string;
  driver_phone: string;
  driver_passport: string;
  freight_price: string;
  currency: string;
  payment_terms: string;
  carrier_bank_account: string;
  carrier_requisites: string;
  additional_terms: string;
  notes: string;
  free_time_hours: string;
  demurrage_rate: string;
}

const TEMPLATE_FILES: Record<CarrierOrderLang, string> = {
  ru: 'order-ru.docx',
  hy: 'order-hy.docx',
  en: 'order-en.docx',
};

// Встроенные шаблоны не меняются во время работы процесса (в отличие от кастомного
// шаблона из БД, который админ может перезалить в любой момент) — читаем с диска
// один раз и держим в памяти, а не на каждый запрос генерации документа.
const builtinTemplateCache = new Map<CarrierOrderLang, Buffer>();

function readBuiltinTemplate(lang: CarrierOrderLang): Buffer {
  const cached = builtinTemplateCache.get(lang);
  if (cached) return cached;
  const buffer = fs.readFileSync(path.join(process.cwd(), 'templates', 'carrier-order', TEMPLATE_FILES[lang]));
  builtinTemplateCache.set(lang, buffer);
  return buffer;
}

function dash(value: string | undefined | null): string {
  const s = String(value ?? '').trim();
  return s || '—';
}

export async function carrierOrderDocx(lang: CarrierOrderLang, data: CarrierOrderData): Promise<Buffer> {
  const customTemplate = lang === 'ru' ? await getCustomTemplate('carrier_request') : null;
  const templateBuffer = customTemplate ?? readBuiltinTemplate(lang);

  const filled: Record<string, string> = {};
  for (const key of Object.keys(data) as (keyof CarrierOrderData)[]) {
    filled[key] = dash(data[key]);
  }

  return processDocxTemplate(templateBuffer, filled, { start: '{{', end: '}}' });
}
