export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { previewNextDocNumber } from '@/lib/doc-numbering';

/** Превью следующей пары номеров счёт+акт без инкремента. */
export async function GET(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const [invoice, act] = await Promise.all([
      previewNextDocNumber(params.id, 'invoice'),
      previewNextDocNumber(params.id, 'act'),
    ]);
    return NextResponse.json({ invoice, act });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
