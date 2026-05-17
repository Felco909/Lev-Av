export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import PizZip from 'pizzip';
import { prisma } from '@/lib/prisma';
import {
  buildCarrierApplicationPdf,
  tripToCarrierApplicationInput,
  type CarrierApplicationInput,
  type CarrierApplicationLang,
} from '@/lib/carrier-application-pdf';

const EXTRACT_SYSTEM = `Ты помощник TMS транспортной компании Lev&Av.
Извлеки из договора-заявки поля и верни ТОЛЬКО валидный JSON без markdown:
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

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };

/** Ключ из .env.local / .env (Next.js подхватывает на сервере). */
function getAnthropicApiKey(): string | null {
  const key = String(process.env.ANTHROPIC_API_KEY ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
  if (!key || !key.startsWith('sk-ant-')) return null;
  return key;
}

function claudeErrorMessage(status: number, errText: string): string {
  try {
    const j = JSON.parse(errText) as { error?: { type?: string; message?: string } };
    const msg = j?.error?.message ?? '';
    if (status === 401) {
      return 'Неверный ANTHROPIC_API_KEY. Создайте новый ключ в console.anthropic.com и обновите .env.local';
    }
    if (status === 404) return msg || 'Модель Claude недоступна для этого ключа';
    if (msg) return `Claude API: ${msg}`;
  } catch {
    /* ignore */
  }
  return 'Ошибка Claude API';
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

async function callClaudeJson(system: string, content: ContentBlock[], hasPdf: boolean) {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return {
      error: 'Не настроен ANTHROPIC_API_KEY в .env.local (формат: sk-ant-...)',
      status: 500 as const,
    };
  }

  const model =
    process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (hasPdf) {
    headers['anthropic-beta'] = 'pdfs-2024-09-25';
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[agents/document] Claude error:', res.status, errText);
    return {
      error: claudeErrorMessage(res.status, errText),
      status: res.status === 401 ? 401 : 502,
    };
  }

  const data = await res.json();
  const raw = data?.content?.find((c: { type?: string }) => c?.type === 'text')?.text ?? '{}';
  const jsonMatch = String(raw).match(/\{[\s\S]*\}/);
  try {
    return { parsed: JSON.parse(jsonMatch ? jsonMatch[0] : raw) };
  } catch {
    return { error: 'Не удалось разобрать ответ Claude', status: 502 as const };
  }
}

async function handleCarrierApplicationPdf(body: Record<string, unknown>) {
  const lang: CarrierApplicationLang = body.lang === 'hy' ? 'hy' : 'ru';
  const freightAmount = String(body.freightAmount ?? '').trim();
  if (!freightAmount) {
    return NextResponse.json({ error: 'Укажите сумму фрахта' }, { status: 400 });
  }

  const freightCurrency = String(body.freightCurrency ?? 'AMD').trim() || 'AMD';
  const paymentTerms = typeof body.paymentTerms === 'string' ? body.paymentTerms : undefined;
  let input: CarrierApplicationInput;

  const tripId = typeof body.tripId === 'string' ? body.tripId.trim() : '';
  if (tripId) {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { client: true, vehicle: true, carrier: true },
    });
    if (!trip) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
    if (!trip.carrier) {
      return NextResponse.json({ error: 'У заявки не указан перевозчик' }, { status: 400 });
    }
    input = tripToCarrierApplicationInput(trip, { lang, freightAmount, freightCurrency, paymentTerms });
  } else {
    const draft = (body.draft ?? {}) as Record<string, unknown>;
    const carrierId = typeof draft.carrierId === 'string' ? draft.carrierId : '';
    let carrier: { name: string; inn?: string | null; address?: string | null; contactPerson?: string | null } | null =
      null;
    if (carrierId) {
      carrier = await prisma.carrier.findUnique({ where: { id: carrierId } });
    }
    const clientId = typeof draft.clientId === 'string' ? draft.clientId : '';
    const client = clientId ? await prisma.client.findUnique({ where: { id: clientId } }) : null;
    const vehicleId = typeof draft.vehicleId === 'string' ? draft.vehicleId : '';
    const vehicle = vehicleId ? await prisma.vehicle.findUnique({ where: { id: vehicleId } }) : null;

    input = {
      lang,
      tripNumber: String(draft.tripNumber ?? '—'),
      tripDate: String(draft.tripDate ?? new Date().toISOString().slice(0, 10)),
      routeFrom: String(draft.routeFrom ?? ''),
      routeTo: String(draft.routeTo ?? ''),
      loadDate: String(draft.tripDate ?? ''),
      loadPlace: String(draft.routeFrom ?? ''),
      unloadDate: typeof draft.unloadDate === 'string' ? draft.unloadDate : undefined,
      unloadPlace: String(draft.routeTo ?? ''),
      cargoName: client?.name || String(draft.cargoName ?? ''),
      cargoValue:
        draft.clientRate != null
          ? `${draft.clientRate} ${String(draft.currency ?? 'AMD')}`
          : undefined,
      cargoWeight:
        draft.cargoWeight != null && Number(draft.cargoWeight) > 0
          ? `${Number(draft.cargoWeight)} т`
          : undefined,
      transportType: typeof draft.transportType === 'string' ? draft.transportType : undefined,
      vehiclePlate: vehicle?.plateNumber || (typeof draft.vehiclePlate === 'string' ? draft.vehiclePlate : undefined),
      additionalConditions:
        typeof draft.additionalConditions === 'string' ? draft.additionalConditions : undefined,
      freightAmount,
      freightCurrency,
      paymentTerms,
      carrierName: carrier?.name || (typeof draft.carrierName === 'string' ? draft.carrierName : undefined),
      carrierInn: carrier?.inn || undefined,
      carrierAddress: carrier?.address || undefined,
      carrierContact: carrier?.contactPerson || undefined,
    };
  }

  const pdfBytes = await buildCarrierApplicationPdf(input);
  const safeNum = (input.tripNumber || 'draft').replace(/[^\w.-]+/g, '_');
  const fileName = `zayavka_perevozchik_${safeNum}.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
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
      if (body?.mode === 'carrier_application_pdf') {
        return handleCarrierApplicationPdf(body);
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
    const content: ContentBlock[] = [];

    if (isPdf) {
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: buffer.toString('base64'),
        },
      });
      content.push({
        type: 'text',
        text: 'Извлеки данные заявки из прикреплённого PDF-договора.',
      });
    } else {
      const docText = extractDocxText(buffer);
      content.push({
        type: 'text',
        text: `Извлеки данные заявки из текста договора Word:\n\n${docText}`,
      });
    }

    const llm = await callClaudeJson(EXTRACT_SYSTEM, content, isPdf);
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
