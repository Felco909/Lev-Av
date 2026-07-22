export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import PizZip from 'pizzip';
import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  SchemaType,
  type Part,
  type ResponseSchema,
} from '@google/generative-ai';

// Заменено на Google Gemini (тот же провайдер, что и /api/agents/document, — см. CLAUDE.md:
// Abacus.AI отключён, счёт не оплачивается). Раньше этот роут звал apps.abacus.ai напрямую
// и всегда падал с "Ошибка распознавания" — ключ ABACUSAI_API_KEY больше не действует.

const EXTRACT_SYSTEM = `Ты помощник для извлечения данных из "договора-заявки" транспортной компании.
Извлеки из документа следующие поля:
{
  "tripNumber": "номер заявки или договора или null",
  "tripDate": "дата документа в формате YYYY-MM-DD или null",
  "clientName": "название клиента / заказчика или null",
  "amount": число (стоимость/сумма) или null,
  "currency": "AMD|USD|EUR|RUB|GEL или null",
  "routeFrom": "город/пункт отправления или null",
  "routeTo": "город/пункт назначения или null",
  "confidence": "high|medium|low в зависимости от уверенности"
}
Если поле не найдено, используй null. Не выдумывай данные.`;

const EXTRACT_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    tripNumber: { type: SchemaType.STRING, nullable: true, description: 'Номер заявки/договора' },
    tripDate: { type: SchemaType.STRING, nullable: true, description: 'Дата в формате YYYY-MM-DD' },
    clientName: { type: SchemaType.STRING, nullable: true, description: 'Заказчик' },
    amount: { type: SchemaType.NUMBER, nullable: true },
    currency: { type: SchemaType.STRING, format: 'enum', enum: ['AMD', 'USD', 'EUR', 'RUB', 'GEL'], nullable: true },
    routeFrom: { type: SchemaType.STRING, nullable: true, description: 'Пункт отправления' },
    routeTo: { type: SchemaType.STRING, nullable: true, description: 'Пункт назначения' },
    confidence: { type: SchemaType.STRING, format: 'enum', enum: ['high', 'medium', 'low'] },
  },
  required: ['tripNumber', 'tripDate', 'clientName', 'amount', 'currency', 'routeFrom', 'routeTo', 'confidence'],
};

const GEMINI_MODEL = 'gemini-2.5-flash';
const RETRY_DELAYS_MS = [1000, 2000, 4000];

function getGeminiApiKey(): string | null {
  const key = String(process.env.GEMINI_API_KEY ?? '').trim().replace(/^['"]|['"]$/g, '');
  return key || null;
}

function isRetryableGeminiStatus(status: number | undefined): boolean {
  if (status === undefined) return false;
  return status === 429 || (status >= 500 && status < 600);
}

function geminiErrorMessage(status: number | undefined, message: string): string {
  if (status === 401 || status === 403) {
    return 'Неверный GEMINI_API_KEY. Создайте новый ключ в Google AI Studio (aistudio.google.com) и обновите .env.local';
  }
  if (status === 429) return 'Превышен лимит запросов к Gemini API (бесплатный тариф). Попробуйте ещё раз через минуту.';
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
    return { error: 'Не настроен GEMINI_API_KEY в .env.local', status: 500 as const };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: EXTRACT_SYSTEM,
    generationConfig: { responseMimeType: 'application/json', responseSchema: EXTRACT_RESPONSE_SCHEMA },
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
      console.error(`[trips/extract-contract] Gemini error (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}), retrying in ${RETRY_DELAYS_MS[attempt]}ms:`, lastStatus, lastMessage);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  console.error('[trips/extract-contract] Gemini error:', lastStatus, lastMessage);
  return {
    error: geminiErrorMessage(lastStatus, lastMessage),
    status: lastStatus === 401 || lastStatus === 403 ? (401 as const) : (502 as const),
  };
}

// Accepts a file (PDF / image / Word) and extracts contract-заявка fields via Gemini.
// Returns: { tripNumber, tripDate, clientName, amount, currency, routeFrom, routeTo, confidence }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Нет файла' }, { status: 400 });

    const name = (file.name || '').toLowerCase();
    const mime = (file.type || 'application/octet-stream').toLowerCase();
    const isPdf = mime.includes('pdf') || name.endsWith('.pdf');
    const isImage = mime.startsWith('image/');
    const isDocx = mime.includes('wordprocessingml') || mime.includes('officedocument') || name.endsWith('.docx');
    if (name.endsWith('.doc') && !isDocx) {
      return NextResponse.json({ error: 'Формат .doc не поддерживается. Сохраните файл как .docx или PDF.' }, { status: 400 });
    }
    if (!isPdf && !isImage && !isDocx) {
      return NextResponse.json({ error: 'Поддерживаются только PDF, изображения и Word (.docx)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parts: Part[] = [];

    if (isPdf) {
      parts.push({ inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } });
      parts.push({ text: 'Извлеки данные заявки из прикреплённого PDF-договора.' });
    } else if (isImage) {
      parts.push({ inlineData: { mimeType: mime, data: buffer.toString('base64') } });
      parts.push({ text: 'Извлеки данные заявки из прикреплённого изображения договора.' });
    } else {
      const docText = extractDocxText(buffer);
      parts.push({ text: `Извлеки данные заявки из текста договора Word:\n\n${docText}` });
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
      confidence: p.confidence ?? 'low',
    };
    return NextResponse.json(extract);
  } catch (e: any) {
    console.error('extract-contract error:', e);
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status: 500 });
  }
}
