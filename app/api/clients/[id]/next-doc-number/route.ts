export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { previewNextDocNumber } from '@/lib/doc-numbering';

export async function GET(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041D\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D' }, { status: 401 });

    const url = new URL(req.url);
    const docType = url.searchParams.get('docType') as 'invoice' | 'act';
    if (!docType || !['invoice', 'act'].includes(docType)) {
      return NextResponse.json({ error: 'docType must be invoice or act' }, { status: 400 });
    }

    const nextNumber = await previewNextDocNumber(params.id, docType);
    return NextResponse.json({ nextNumber });
  } catch (e: any) {
    console.error('Error getting next doc number:', e);
    return NextResponse.json({ error: '\u041E\u0448\u0438\u0431\u043A\u0430' }, { status: 500 });
  }
}
