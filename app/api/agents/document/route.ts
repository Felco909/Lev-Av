export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import PizZip from 'pizzip';
import { prisma } from '@/lib/prisma';
import type { DocData } from '@/lib/doc-generators';
import { carrierOrderDocx, type CarrierOrderData, type CarrierOrderLang } from '@/lib/carrier-order-docx';
import { getCompanySettings } from '@/lib/template-processor';
import { buildContentDisposition } from '@/lib/content-disposition';
import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  SchemaType,
  type Part,
  type ResponseSchema,
} from '@google/generative-ai';

const EXTRACT_SYSTEM = `Ты помощник TMS транспортной компании Lev&Av.
Извлеки из договора-заявки поля:
{
  "tripNumber": "номер заявки/договора или null",
  "tripDate": "YYYY-MM-DD или null",
  "clientName": "заказчик или null",
  "amount": число или null,
  "currency": "AMD|USD|EUR|RUB|GEL или null",
  "routeFrom": "пункт отправления или null",
  "routeTo": "пункт назначения или null",
  "basisText": "основание/номер договора одной строкой или null",
  "cargoWeight": число тонн или null,
  "confidence": "high|medium|low"
}
Не выдумывай данные. Если поле не найдено — null.`;

/*
 * ЗАМЕНЕНО на Google Gemini (см. callGeminiJson ниже). Оставлено для справки/отката.
 * ANTHROPIC_API_KEY и ANTHROPIC_MODEL по-прежнему в .env.local — просто не используются в коде.
 *
 * type ContentBlock =
 *   | { type: 'text'; text: string }
 *   | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };
 *
 * function getAnthropicApiKey(): string | null {
 *   const key = String(process.env.ANTHROPIC_API_KEY ?? '')
 *     .trim()
 *     .replace(/^['"]|['"]$/g, '');
 *   if (!key || !key.startsWith('sk-ant-')) return null;
 *   return key;
 * }
 *
 * function claudeErrorMessage(status: number, errText: string): string {
 *   try {
 *     const j = JSON.parse(errText) as { error?: { type?: string; message?: string } };
 *     const msg = j?.error?.message ?? '';
 *     if (status === 401) {
 *       return 'Неверный ANTHROPIC_API_KEY. Создайте новый ключ в console.anthropic.com и обновите .env.local';
 *     }
 *     if (status === 404) return msg || 'Модель Claude недоступна для этого ключа';
 *     if (msg) return `Claude API: ${msg}`;
 *   } catch {
 *     // ignore
 *   }
 *   return 'Ошибка Claude API';
 * }
 */

/** JSON-схема ответа extract-агента — Gemini гарантирует соответствие ей (responseSchema). */
const EXTRACT_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    tripNumber: { type: SchemaType.STRING, nullable: true, description: 'Номер заявки/договора' },
    tripDate: { type: SchemaType.STRING, nullable: true, description: 'Дата в формате YYYY-MM-DD' },
    clientName: { type: SchemaType.STRING, nullable: true, description: 'Заказчик' },
    amount: { type: SchemaType.NUMBER, nullable: true },
    currency: {
      type: SchemaType.STRING,
      format: 'enum',
      enum: ['AMD', 'USD', 'EUR', 'RUB', 'GEL'],
      nullable: true,
    },
    routeFrom: { type: SchemaType.STRING, nullable: true, description: 'Пункт отправления' },
    routeTo: { type: SchemaType.STRING, nullable: true, description: 'Пункт назначения' },
    basisText: {
      type: SchemaType.STRING,
      nullable: true,
      description: 'Основание/номер договора одной строкой',
    },
    cargoWeight: { type: SchemaType.NUMBER, nullable: true, description: 'Вес груза в тоннах' },
    confidence: { type: SchemaType.STRING, format: 'enum', enum: ['high', 'medium', 'low'] },
  },
  required: [
    'tripNumber',
    'tripDate',
    'clientName',
    'amount',
    'currency',
    'routeFrom',
    'routeTo',
    'basisText',
    'cargoWeight',
    'confidence',
  ],
};

const GEMINI_MODEL = 'gemini-2.5-flash';
const RETRY_DELAYS_MS = [1000, 2000, 4000];

/** Ключ из .env.local / .env (Next.js подхватывает на сервере). */
function getGeminiApiKey(): string | null {
  const key = String(process.env.GEMINI_API_KEY ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
  if (!key) return null;
  return key;
}

function isRetryableGeminiStatus(status: number | undefined): boolean {
  if (status === undefined) return false;
  return status === 429 || (status >= 500 && status < 600);
}

function geminiErrorMessage(status: number | undefined, message: string): string {
  if (status === 401 || status === 403) {
    return 'Неверный GEMINI_API_KEY. Создайте новый ключ в Google AI Studio (aistudio.google.com) и обновите .env.local';
  }
  if (status === 429) {
    return 'Превышен лимит запросов к Gemini API (бесплатный тариф). Попробуйте ещё раз через минуту.';
  }
  if (status === 404) return message || 'Модель Gemini недоступна для этого ключа';
  if (message) return `Gemini API: ${message}`;
  return 'Ошибка Gemini API';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripDocxXml(xml: string): string {
  return xml
    .replace(/<w:tab[^/]*\/>/g, '\t')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractDocxText(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  const xml = zip.file('word/document.xml')?.asText() ?? '';
  if (!xml) throw new Error('Не удалось прочитать содержимое Word-файла');
  const text = stripDocxXml(xml);
  if (text.length < 20) throw new Error('Документ Word пуст или не содержит текста');
  return text.slice(0, 120_000);
}

async function callGeminiJson(parts: Part[]) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return {
      error: 'Не настроен GEMINI_API_KEY в .env.local',
      status: 500 as const,
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: EXTRACT_SYSTEM,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: EXTRACT_RESPONSE_SCHEMA,
    },
  });

  let lastStatus: number | undefined;
  let lastMessage = '';

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const result = await model.generateContent(parts);
      const raw = result.response.text();
      try {
        return { parsed: JSON.parse(raw) };
      } catch {
        return { error: 'Не удалось разобрать ответ Gemini', status: 502 as const };
      }
    } catch (err) {
      lastStatus = err instanceof GoogleGenerativeAIFetchError ? err.status : undefined;
      lastMessage = err instanceof Error ? err.message : 'Ошибка Gemini API';

      const retryable = isRetryableGeminiStatus(lastStatus);
      const attemptsLeft = attempt < RETRY_DELAYS_MS.length;
      if (!retryable || !attemptsLeft) break;

      console.error(
        `[agents/document] Gemini error (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}), retrying in ${RETRY_DELAYS_MS[attempt]}ms:`,
        lastStatus,
        lastMessage,
      );
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  console.error('[agents/document] Gemini error:', lastStatus, lastMessage);
  return {
    error: geminiErrorMessage(lastStatus, lastMessage),
    status: lastStatus === 401 || lastStatus === 403 ? (401 as const) : (502 as const),
  };
}

async function handleCarrierApplicationWord(body: Record<string, unknown>) {
  const freightAmount = String(body.freightAmount ?? '').trim();
  if (!freightAmount) {
    return NextResponse.json({ error: 'Укажите сумму фрахта' }, { status: 400 });
  }
  const freightCurrency = String(body.freightCurrency ?? 'AMD').trim() || 'AMD';
  const language: CarrierOrderLang =
    body.language === 'hy' ? 'hy' : body.language === 'en' ? 'en' : 'ru';
  const paymentTerms = typeof body.paymentTerms === 'string' ? body.paymentTerms : '';
  const extra = (body.extra ?? {}) as Record<string, unknown>;
  const extraStr = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const tripId = typeof body.tripId === 'string' ? body.tripId.trim() : '';
  let docData: DocData;
  let carrierAddress = '';
  let carrierBankDetails = '';

  if (tripId) {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { client: true, vehicle: true, driver: true, carrier: true },
    });
    if (!trip) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
    if (!trip.carrier) return NextResponse.json({ error: 'У заявки не указан перевозчик' }, { status: 400 });
    carrierAddress = trip.carrier.address ?? '';
    carrierBankDetails = trip.carrier.bankDetails ?? '';
    docData = {
      tripNumber: trip.tripNumber,
      tripDate: (trip.tripDate instanceof Date ? trip.tripDate : new Date(trip.tripDate as unknown as string)).toISOString().slice(0, 10),
      routeFrom: trip.routeFrom,
      routeTo: trip.routeTo,
      tripType: trip.tripType,
      clientRate: Number(trip.clientRate ?? 0),
      carrierRate: trip.carrierRate != null ? Number(trip.carrierRate) : null,
      profit: Number((trip as any).profit ?? 0),
      client: {
        name: trip.client.name,
        contactPerson: trip.client.contactPerson ?? null,
        phone: trip.client.phone ?? null,
        email: trip.client.email ?? null,
        inn: trip.client.inn ?? null,
        address: trip.client.address ?? null,
      },
      vehicle: trip.vehicle ? {
        plateNumber: trip.vehicle.plateNumber,
        brand: (trip.vehicle as any).brand ?? '',
        model: (trip.vehicle as any).model ?? '',
      } : null,
      driver: trip.driver ? {
        fullName: trip.driver.fullName,
        phone: trip.driver.phone ?? null,
      } : null,
      carrier: {
        name: trip.carrier.name,
        contactPerson: trip.carrier.contactPerson ?? null,
        phone: trip.carrier.phone ?? null,
        email: trip.carrier.email ?? null,
        inn: trip.carrier.inn ?? null,
      },
      unloadDate: trip.unloadDate ? (trip.unloadDate instanceof Date ? trip.unloadDate : new Date(trip.unloadDate as unknown as string)).toISOString().slice(0, 10) : null,
      contractNumber: (trip as any).contractNumber ?? null,
      contractDate: (trip as any).contractDate ?? null,
      requestNumber: (trip as any).requestNumber ?? null,
      customsDeparture: (trip as any).customsDeparture ?? null,
      customsDestination: (trip as any).customsDestination ?? null,
      cargoName: (trip as any).cargoName ?? null,
      cargoWeight: trip.cargoWeight != null ? Number(trip.cargoWeight) : null,
      cargoValue: (trip as any).cargoValue != null ? Number((trip as any).cargoValue) : null,
      truckType: (trip as any).truckType ?? null,
      loadingAddress: (trip as any).loadingAddress ?? null,
      unloadingAddress: (trip as any).unloadingAddress ?? null,
      trailerPlate: (trip as any).trailerPlate ?? null,
      additionalTerms: (trip as any).additionalTerms ?? null,
    };
  } else {
    const draft = (body.draft ?? {}) as Record<string, unknown>;
    const carrierId = typeof draft.carrierId === 'string' ? draft.carrierId : '';
    const clientId = typeof draft.clientId === 'string' ? draft.clientId : '';
    const vehicleId = typeof draft.vehicleId === 'string' ? draft.vehicleId : '';
    const [carrier, client, vehicle] = await Promise.all([
      carrierId ? prisma.carrier.findUnique({ where: { id: carrierId } }) : null,
      clientId ? prisma.client.findUnique({ where: { id: clientId } }) : null,
      vehicleId ? prisma.vehicle.findUnique({ where: { id: vehicleId } }) : null,
    ]);
    carrierAddress = carrier?.address ?? '';
    carrierBankDetails = carrier?.bankDetails ?? '';
    docData = {
      tripNumber: String(draft.tripNumber ?? 'новая'),
      tripDate: String(draft.tripDate ?? new Date().toISOString().slice(0, 10)),
      routeFrom: String(draft.routeFrom ?? ''),
      routeTo: String(draft.routeTo ?? ''),
      tripType: 'expedition',
      clientRate: Number(draft.clientRate ?? 0),
      carrierRate: draft.carrierRate != null ? Number(draft.carrierRate) : null,
      profit: 0,
      client: { name: client?.name || '—', contactPerson: null, phone: null, email: null, inn: null, address: null },
      vehicle: vehicle ? { plateNumber: vehicle.plateNumber, brand: vehicle.brand, model: vehicle.model } : null,
      carrier: carrier ? { name: carrier.name, contactPerson: carrier.contactPerson ?? null, phone: carrier.phone ?? null, email: carrier.email ?? null, inn: carrier.inn ?? null }
        : typeof draft.carrierName === 'string' ? { name: draft.carrierName, contactPerson: null, phone: null, email: null, inn: null }
        : null,
    };
  }

  const isoToShort = (iso?: string | null) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  };

  // Реквизиты своей компании — точка истины: /settings (getCompanySettings()), как и у
  // счёта/акта (lib/document-templates.ts). Название/адрес переведены на каждый язык
  // в самих .docx-шаблонах (в Settings нет армянских/английских реквизитов — та же
  // причина, по которой AM-документ раньше не читал Settings вовсе), а ИНН и телефон —
  // это просто цифры без локализации, поэтому берутся из Settings для всех языков.
  const companySettings = await getCompanySettings();
  const COMPANY_NAME_FALLBACK: Record<CarrierOrderLang, string> = {
    ru: 'ООО «ЛЕВ ЭНД АВ»',
    hy: '«ԼԵՎ ԸՆԴ ԱՎ» ՍՊԸ',
    en: 'LEV&AV LLC',
  };
  const COMPANY_ADDRESS_FALLBACK: Record<CarrierOrderLang, string> = {
    ru: 'РА, 0046, г. Ереван, ул. С. Таронци 3/18',
    hy: 'ՀՀ, 0046, ք. Երևան, Ս. Տարոնցու փող. 3/18',
    en: 'RA, 0046, Yerevan, S. Tarontsi St. 3/18',
  };
  const companyName = language === 'ru'
    ? (companySettings.company_name || COMPANY_NAME_FALLBACK.ru)
    : COMPANY_NAME_FALLBACK[language];
  const companyAddress = language === 'ru'
    ? (companySettings.company_address || COMPANY_ADDRESS_FALLBACK.ru)
    : COMPANY_ADDRESS_FALLBACK[language];
  const companyInn = companySettings.company_inn || '02248043';
  const companyPhone = companySettings.company_phone || '+37499902007';

  const orderData: CarrierOrderData = {
    application_number: docData.requestNumber || `TMS-${docData.tripNumber}`,
    application_date: isoToShort(docData.tripDate) || new Date().toLocaleDateString('ru-RU'),
    issued_by: extraStr(extra.issuedBy),
    company_name: companyName,
    company_address: companyAddress,
    company_inn: companyInn,
    company_phone: companyPhone,
    carrier_name: docData.carrier?.name ?? '',
    carrier_address: carrierAddress,
    carrier_tin: docData.carrier?.inn ?? '',
    carrier_phone: docData.carrier?.phone ?? '',
    carrier_contact_person: docData.carrier?.contactPerson ?? '',
    route: `${docData.routeFrom} — ${docData.routeTo}`,
    loading_place: docData.loadingAddress ? `${docData.routeFrom}, ${docData.loadingAddress}` : docData.routeFrom,
    loading_date: isoToShort(docData.tripDate),
    loading_time: extraStr(extra.loadingTime),
    loading_contact: extraStr(extra.loadingContact),
    unloading_place: docData.unloadingAddress ? `${docData.routeTo}, ${docData.unloadingAddress}` : docData.routeTo,
    unloading_date: isoToShort(docData.unloadDate),
    unloading_time: extraStr(extra.unloadingTime),
    unloading_contact: extraStr(extra.unloadingContact),
    cargo: docData.cargoName ?? '',
    weight: docData.cargoWeight != null ? `${docData.cargoWeight} т` : '',
    volume: extraStr(extra.volume),
    packaging_type: extraStr(extra.packagingType),
    places_count: extraStr(extra.placesCount),
    vehicle_type: docData.truckType ?? '',
    vehicle_number: docData.vehicle?.plateNumber ?? '',
    trailer_number: docData.trailerPlate ?? '',
    driver: docData.driver?.fullName ?? '',
    driver_phone: docData.driver?.phone ?? '',
    driver_passport: extraStr(extra.driverPassport),
    freight_price: (Number(freightAmount) || 0).toLocaleString('ru-RU'),
    currency: freightCurrency,
    payment_terms: paymentTerms.trim(),
    carrier_bank_account: extraStr(extra.carrierBankAccount),
    carrier_requisites: extraStr(extra.carrierRequisites) || carrierBankDetails,
    additional_terms: docData.additionalTerms ?? '',
    notes: extraStr(extra.notes),
    free_time_hours: extraStr(extra.freeTimeHours) || '48',
    demurrage_rate: extraStr(extra.demurrageRate) || '50 USD',
  };

  const buffer = await carrierOrderDocx(language, orderData);
  const safeNum = (docData.tripNumber || 'draft').replace(/[^\w.-]+/g, '_');
  const fileName = `zayavka_perevozchik_${safeNum}.docx`;
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': buildContentDisposition('attachment', fileName),
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json();
      if (body?.mode === 'carrier_application_word') {
        return handleCarrierApplicationWord(body);
      }
      return NextResponse.json({ error: 'Неизвестный режим запроса' }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Нет файла' }, { status: 400 });

    const name = (file.name || '').toLowerCase();
    const mime = (file.type || '').toLowerCase();
    const isPdf = mime.includes('pdf') || name.endsWith('.pdf');
    const isDocx =
      mime.includes('wordprocessingml') ||
      mime.includes('officedocument') ||
      name.endsWith('.docx');
    const isDoc = name.endsWith('.doc') && !isDocx;

    if (isDoc) {
      return NextResponse.json(
        { error: 'Формат .doc не поддерживается. Сохраните файл как .docx или PDF.' },
        { status: 400 },
      );
    }
    if (!isPdf && !isDocx) {
      return NextResponse.json({ error: 'Поддерживаются только PDF и Word (.docx)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parts: Part[] = [];

    if (isPdf) {
      parts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: buffer.toString('base64'),
        },
      });
      parts.push({
        text: 'Извлеки данные заявки из прикреплённого PDF-договора.',
      });
    } else {
      const docText = extractDocxText(buffer);
      parts.push({
        text: `Извлеки данные заявки из текста договора Word:\n\n${docText}`,
      });
    }

    const llm = await callGeminiJson(parts);
    if ('error' in llm && llm.error) {
      return NextResponse.json({ error: llm.error }, { status: llm.status ?? 500 });
    }

    const p = llm.parsed ?? {};
    const extract = {
      tripNumber: p.tripNumber ?? null,
      tripDate: p.tripDate ?? null,
      clientName: p.clientName ?? null,
      amount: p.amount != null ? Number(p.amount) : null,
      currency: p.currency ?? null,
      routeFrom: p.routeFrom ?? null,
      routeTo: p.routeTo ?? null,
      basisText: p.basisText ?? null,
      cargoWeight: p.cargoWeight != null ? Number(p.cargoWeight) : null,
      confidence: p.confidence ?? 'low',
    };

    return NextResponse.json(extract);
  } catch (e: unknown) {
    console.error('[agents/document]', e);
    const message = e instanceof Error ? e.message : 'Ошибка';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
