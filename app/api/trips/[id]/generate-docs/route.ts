export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { generateInvoiceHtml, generateActHtml, type DocOverrides } from '@/lib/document-templates';
import { getCompanySettings } from '@/lib/template-processor';
import { convertHtmlToPdf } from '@/lib/pdf-convert';
import { getNextDocNumberPair } from '@/lib/doc-numbering';

export async function POST(request: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const tripId = params.id;
    const body = await request.json().catch(() => ({}));
    const userOverrides = body.overrides || {};

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { client: true, contact: true, vehicle: true, driver: true, carrier: true, expenses: true },
    });
    if (!trip) return NextResponse.json({ error: 'Рейс не найден' }, { status: 404 });

    const tripData: any = {
      ...trip,
      clientRate: Number(trip.clientRate ?? 0),
      carrierRate: trip.carrierRate != null ? Number(trip.carrierRate) : null,
      profit: Number((trip as any).profit ?? 0),
    };

    const settings = await getCompanySettings();
    const tripCurrency = (trip as any).currency || 'AMD';
    const savedBasisText = (trip as any).basisText || '';

    // Auto-number invoice + act as a pair (same sequence number)
    let invoiceNumber = `СЧ-${trip.tripNumber}`;
    let actNumber = `АКТ-${trip.tripNumber}`;
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

    const invoiceOv: DocOverrides = { ...baseOv, docNumber: userOverrides.invoiceNumber || invoiceNumber };
    const actOv: DocOverrides = { ...baseOv, docNumber: userOverrides.actNumber || actNumber };

    const invoiceHtml = generateInvoiceHtml(tripData, invoiceOv);
    const actHtml = generateActHtml(tripData, actOv);

    // Render locally via LibreOffice headless (no external/paid service)
    const [invoicePdf, actPdf] = await Promise.all([
      convertHtmlToPdf(invoiceHtml),
      convertHtmlToPdf(actHtml),
    ]);

    // Save basisText to trip for future use
    if (userOverrides.basisText) {
      try {
        await prisma.trip.update({ where: { id: tripId }, data: { basisText: userOverrides.basisText } });
      } catch {}
    }

    // Сохраняем фактически присвоенные номера счёта/акта в заявку — иначе
    // "Лист дня" (commandCenter.attention.noInvoiceActTrips) не может узнать,
    // что документы уже выданы, и ложно считает их отсутствующими.
    try {
      const now = new Date();
      await prisma.trip.update({
        where: { id: tripId },
        data: {
          invoiceDocNumber: String(invoiceOv.docNumber ?? invoiceNumber),
          actDocNumber: String(actOv.docNumber ?? actNumber),
          invoiceDocDate: now,
          actDocDate: now,
        },
      });
    } catch (e) {
      console.error('[trips/generate-docs] failed to persist doc numbers', e);
    }

    return NextResponse.json({
      success: true,
      invoice: {
        filename: `Счёт_${trip.tripNumber}.pdf`,
        data: invoicePdf.toString('base64'),
        number: invoiceOv.docNumber,
      },
      act: {
        filename: `Акт_${trip.tripNumber}.pdf`,
        data: actPdf.toString('base64'),
        number: actOv.docNumber,
      },
    });
  } catch (error) {
    console.error('Generate docs error:', error);
    return NextResponse.json({ error: 'Ошибка генерации документов' }, { status: 500 });
  }
}
