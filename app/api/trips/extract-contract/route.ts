export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

// Accepts a file (PDF / image) and tries to extract contract-заявка fields via LLM.
// Returns: { tripNumber, tripDate, clientName, amount, currency, routeFrom, routeTo, confidence }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Нет файла' }, { status: 400 });

    const mime = (file.type || 'application/octet-stream').toLowerCase();
    const isPdf = mime.includes('pdf') || (file.name || '').toLowerCase().endsWith('.pdf');
    const isImage = mime.startsWith('image/');
    if (!isPdf && !isImage) {
      return NextResponse.json({ error: 'Поддерживаются только PDF и изображения' }, { status: 400 });
    }

    // Convert to base64 data URL
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'LLM API не настроен' }, { status: 500 });

    const systemPrompt = `Ты помощник для извлечения данных из "договора-заявки" транспортной компании. 
Извлеки из документа следующие поля и верни ТОЛЬКО корректный JSON без пояснений:
{
  "tripNumber": "номер заявки или договора (строка или null)",
  "tripDate": "дата документа в формате YYYY-MM-DD (строка или null)",
  "clientName": "название клиента / заказчика (строка или null)",
  "amount": "стоимость / сумма (число или null)",
  "currency": "валюта: AMD, USD, EUR, RUB или GEL (строка или null)",
  "routeFrom": "город/пункт отправления (строка или null)",
  "routeTo": "город/пункт назначения (строка или null)",
  "confidence": "high / medium / low в зависимости от уверенности"
}
Если поле не найдено, используй null. Не выдумывай данные.`;

    const userContent: any[] = [
      { type: 'text', text: 'Извлеки данные из прикреплённого документа.' },
    ];
    if (isPdf) {
      userContent.push({
        type: 'file',
        file: {
          filename: file.name || 'document.pdf',
          file_data: `data:application/pdf;base64,${base64}`,
        },
      });
    } else {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${mime};base64,${base64}` },
      });
    }

    const res = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 800,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('LLM extract error:', errText);
      return NextResponse.json({ error: 'Ошибка распознавания' }, { status: 502 });
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '{}';
    let parsed: any = {};
    try {
      parsed = typeof content === 'string' ? JSON.parse(content) : content;
    } catch {
      parsed = {};
    }

    // Normalize
    const extract = {
      tripNumber: parsed?.tripNumber ?? null,
      tripDate: parsed?.tripDate ?? null,
      clientName: parsed?.clientName ?? null,
      amount: parsed?.amount != null ? Number(parsed.amount) : null,
      currency: parsed?.currency ?? null,
      routeFrom: parsed?.routeFrom ?? null,
      routeTo: parsed?.routeTo ?? null,
      confidence: parsed?.confidence ?? 'low',
    };
    return NextResponse.json(extract);
  } catch (e: any) {
    console.error('extract-contract error:', e);
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status: 500 });
  }
}
