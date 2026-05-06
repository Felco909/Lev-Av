export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { generateInvoiceHtml, generateActHtml, type DocOverrides } from '@/lib/document-templates';
import { getCompanySettings } from '@/lib/template-processor';
import { getNextDocNumberPair } from '@/lib/doc-numbering';

async function generatePdf(html: string): Promise<Buffer | null> {
  try {
    const createRes = await fetch('https://apps.abacus.ai/api/createConvertHtmlToPdfRequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        html_content: html,
        pdf_options: {
          format: 'A4',
          margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
          print_background: true,
        },
        base_url: process.env.NEXTAUTH_URL || '',
      }),
    });
    if (!createRes.ok) return null;
    const { request_id } = await createRes.json();
    if (!request_id) return null;

    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const statusRes = await fetch('https://apps.abacus.ai/api/getConvertHtmlToPdfStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id, deployment_token: process.env.ABACUSAI_API_KEY }),
      });
      const statusResult = await statusRes.json();
      if (statusResult?.status === 'SUCCESS' && statusResult?.result?.result) {
        return Buffer.from(statusResult.result.result, 'base64');
      }
      if (statusResult?.status === 'FAILED') return null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041D\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D' }, { status: 401 });

    const tripId = params.id;
    const body = await request.json().catch(() => ({}));
    const userOverrides = body.overrides || {};

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { client: true, contact: true, vehicle: true, driver: true, carrier: true, expenses: true },
    });
    if (!trip) return NextResponse.json({ error: '\u0420\u0435\u0439\u0441 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D' }, { status: 404 });

    const tripData: any = {
      ...trip,
      clientRate: Number(trip.clientRate ?? 0),
      carrierRate: trip.carrierRate != null ? Number(trip.carrierRate) : null,
      profit: Number(trip.profit ?? 0),
    };

    const settings = await getCompanySettings();
    const tripCurrency = (trip as any).currency || 'AMD';
    const savedBasisText = (trip as any).basisText || '';

    // Auto-number invoice + act as a pair (same sequence number)
    let invoiceNumber = `\u0421\u0427-${trip.tripNumber}`;
    let actNumber = `\u0410\u041A\u0422-${trip.tripNumber}`;
    if (trip.clientId) {
      try {
        const pair = await getNextDocNumberPair(trip.clientId);
        invoiceNumber = pair.invoiceNumber;
        actNumber = pair.actNumber;
      } catch {}
    }

    const baseOv: DocOverrides = {
      basisText: userOverrides.basisText || savedBasisText || undefined,
      company: settings,
      currency: tripCurrency,
      ...userOverrides,
    };

    // If user provided amount as string, parse it
    if (baseOv.amount && typeof baseOv.amount === 'string') {
      baseOv.amount = parseFloat(String(baseOv.amount).replace(/\s/g, '')) || tripData.clientRate;
    }

    // Generate invoice HTML
    const invoiceOv: DocOverrides = { ...baseOv, docNumber: userOverrides.invoiceNumber || invoiceNumber };
    const invoiceHtml = generateInvoiceHtml(tripData, invoiceOv);

    // Generate act HTML
    const actOv: DocOverrides = { ...baseOv, docNumber: userOverrides.actNumber || actNumber };
    const actHtml = generateActHtml(tripData, actOv);

    // Generate both PDFs in parallel
    const [invoicePdf, actPdf] = await Promise.all([
      generatePdf(invoiceHtml),
      generatePdf(actHtml),
    ]);

    if (!invoicePdf || !actPdf) {
      return NextResponse.json({ error: '\u041E\u0448\u0438\u0431\u043A\u0430 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 PDF' }, { status: 500 });
    }

    // Save basisText to trip for future use
    if (userOverrides.basisText) {
      try {
        await prisma.trip.update({ where: { id: tripId }, data: { basisText: userOverrides.basisText } });
      } catch {}
    }

    return NextResponse.json({
      success: true,
      invoice: {
        filename: `\u0421\u0447\u0451\u0442_${trip.tripNumber}.pdf`,
        data: invoicePdf.toString('base64'),
        number: invoiceOv.docNumber,
      },
      act: {
        filename: `\u0410\u043A\u0442_${trip.tripNumber}.pdf`,
        data: actPdf.toString('base64'),
        number: actOv.docNumber,
      },
    });
  } catch (error) {
    console.error('Generate docs error:', error);
    return NextResponse.json({ error: '\u041E\u0448\u0438\u0431\u043A\u0430 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432' }, { status: 500 });
  }
}
