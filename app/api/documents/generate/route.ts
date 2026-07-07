export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { generateInvoiceHtml, generateActHtml, type DocOverrides } from '@/lib/document-templates';
import { getCustomTemplate, getClientTemplate, processDocxTemplate, getCompanySettings } from '@/lib/template-processor';
import { getNextDocNumber } from '@/lib/doc-numbering';
import {
  invoiceDocx, actDocx, carrierRequestDocx,
  invoiceXlsx, actXlsx, carrierRequestXlsx,
  packDocx,
  type DocData, type DocOverrides as GenOverrides, type OrderForCarrierRequest,
} from '@/lib/doc-generators';
import { convertDocxBufferToPdf, convertHtmlToPdf } from '@/lib/pdf-convert';

async function buildProgrammaticDocxBuffer(
  documentType: string,
  trip: any,
  tripData: DocData,
  ov: GenOverrides | undefined,
  overrides: any,
): Promise<Buffer> {
  switch (documentType) {
    case 'invoice':
      return packDocx(invoiceDocx(tripData, ov));
    case 'act':
      return packDocx(actDocx(tripData, ov));
    case 'carrier_request': {
      const isoS = (v?: string | Date | null) => {
        if (!v) return '';
        const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
        const [y, m, d] = s.split('-');
        return `${d}.${m}.${y}`;
      };
      const crOrder: OrderForCarrierRequest = {
        order_number: (tripData as any).requestNumber ?? `TMS-${trip.tripNumber}`,
        order_date: isoS(trip.tripDate) || new Date().toLocaleDateString('ru-RU'),
        contract_number: (tripData as any).contractNumber ?? undefined,
        contract_date: isoS((tripData as any).contractDate) || undefined,
        carrier: {
          company_name: ov?.carrierName ?? trip.carrier?.name ?? '—',
          truck_plate: trip.vehicle?.plateNumber,
          trailer_plate: (tripData as any).trailerPlate ?? undefined,
          truck_type: (tripData as any).truckType ?? undefined,
        },
        route: {
          from_country: trip.routeFrom,
          to_country: trip.routeTo,
          from_address: (tripData as any).loadingAddress
            ? `${trip.routeFrom}, ${(tripData as any).loadingAddress}`
            : trip.routeFrom,
          to_address: (tripData as any).unloadingAddress
            ? `${trip.routeTo}, ${(tripData as any).unloadingAddress}`
            : trip.routeTo,
          loading_date: isoS(trip.tripDate) || '—',
          unloading_date: isoS((tripData as any).unloadDate) || '—',
          customs_departure: (tripData as any).customsDeparture ?? undefined,
          customs_destination: (tripData as any).customsDestination ?? undefined,
        },
        cargo: {
          name: (tripData as any).cargoName ?? '—',
          value: (tripData as any).cargoValue != null ? `${(tripData as any).cargoValue} USD` : undefined,
          weight_tn: (tripData as any).cargoWeight != null ? String((tripData as any).cargoWeight) : '—',
        },
        additional_terms: (tripData as any).additionalTerms ?? undefined,
        price: Number(ov?.carrierRate ?? tripData.carrierRate ?? 0),
        currency: ((overrides as any)?.freightCurrency ?? 'USD') as OrderForCarrierRequest['currency'],
        all_in: false,
        payment_days: 10,
      };
      return carrierRequestDocx(crOrder, { lang: 'ru' });
    }
    default:
      throw new Error('Неизвестный тип документа');
  }
}

function formatCurrencyPlain(v: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(v);
}
function formatDatePlain(d: Date | string) {
  return new Intl.DateTimeFormat('ru-RU').format(new Date(d));
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { tripId, documentType, overrides, format } = await request.json();
    if (!tripId || !documentType) {
      return NextResponse.json({ error: 'tripId и documentType обязательны' }, { status: 400 });
    }
    // format: 'pdf' | 'docx' | 'xlsx' (default: 'pdf')
    const outputFormat = format || 'pdf';

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { client: true, vehicle: true, driver: true, carrier: true, expenses: true },
    });

    if (!trip) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });

    const tripData: any = {
      ...trip,
      clientRate: Number(trip.clientRate ?? 0),
      carrierRate: trip.carrierRate != null ? Number(trip.carrierRate) : null,
      profit: Number(trip.profit ?? 0),
      expenses: (trip.expenses ?? []).map((e: any) => ({ ...e, amount: Number(e.amount ?? 0) })),
    };

    // Build overrides — include trip's basisText as default
    const tripBasisText = (trip as any).basisText || '';
    let ov: GenOverrides | undefined = overrides ? {
      docNumber: overrides.docNumber || undefined,
      docDate: overrides.docDate || undefined,
      serviceDescription: overrides.serviceDescription || undefined,
      amount: overrides.amount != null ? Number(overrides.amount) : undefined,
      clientName: overrides.clientName || undefined,
      clientInn: overrides.clientInn || undefined,
      clientAddress: overrides.clientAddress || undefined,
      clientContact: overrides.clientContact || undefined,
      carrierName: overrides.carrierName || undefined,
      carrierInn: overrides.carrierInn || undefined,
      carrierContact: overrides.carrierContact || undefined,
      carrierPhone: overrides.carrierPhone || undefined,
      carrierRate: overrides.carrierRate != null ? Number(overrides.carrierRate) : undefined,
      notes: overrides.notes || undefined,
      basisText: overrides.basisText || tripBasisText || undefined,
      sumInWords: overrides.sumInWords || undefined,
    } : {
      basisText: tripBasisText || undefined,
    };

    // ====== AUTO-NUMBERING for invoice/act ======
    if ((documentType === 'invoice' || documentType === 'act') && trip.clientId) {
      const useAutoNumber = overrides?.useAutoNumber !== false; // default true
      if (useAutoNumber && !ov?.docNumber) {
        // No manual docNumber provided — auto-generate
        const autoDocNum = await getNextDocNumber(trip.clientId, documentType);
        if (!ov) {
          ov = { docNumber: autoDocNum };
        } else {
          ov.docNumber = autoDocNum;
        }
      }
    }

    const fileNames: Record<string, Record<string, string>> = {
      invoice: { pdf: `\u0421\u0447\u0451\u0442_${trip.tripNumber}.pdf`, docx: `\u0421\u0447\u0451\u0442_${trip.tripNumber}.docx`, xlsx: `\u0421\u0447\u0451\u0442_${trip.tripNumber}.xlsx` },
      act: { pdf: `\u0410\u043A\u0442_${trip.tripNumber}.pdf`, docx: `\u0410\u043A\u0442_${trip.tripNumber}.docx`, xlsx: `\u0410\u043A\u0442_${trip.tripNumber}.xlsx` },
      carrier_request: { pdf: `\u0417\u0430\u044F\u0432\u043A\u0430_${trip.tripNumber}.pdf`, docx: `\u0417\u0430\u044F\u0432\u043A\u0430_${trip.tripNumber}.docx`, xlsx: `\u0417\u0430\u044F\u0432\u043A\u0430_${trip.tripNumber}.xlsx` },
    };
    const fileName = fileNames[documentType]?.[outputFormat] || 'document';

    // ====== DOCX FORMAT ======
    if (outputFormat === 'docx') {
      // Check for client-specific template first, then global
      const customTemplate = await getClientTemplate(trip.clientId, documentType);
      if (customTemplate) {
        const settings = await getCompanySettings();
        const totalExpenses = tripData.expenses.reduce((s: number, e: any) => s + Number(e.amountAmd || e.amount), 0);
        const data: Record<string, string> = {
          trip_number: trip.tripNumber,
          client_name: ov?.clientName || trip.client?.name || '',
          client_inn: ov?.clientInn ?? (trip.client?.inn || ''),
          client_address: ov?.clientAddress ?? (trip.client?.address || ''),
          client_contact: ov?.clientContact ?? (trip.client?.contactPerson || ''),
          client_phone: trip.client?.phone || '',
          client_email: trip.client?.email || '',
          route_from: trip.routeFrom,
          route_to: trip.routeTo,
          trip_date: formatDatePlain(trip.tripDate),
          client_rate: formatCurrencyPlain(ov?.amount ?? tripData.clientRate),
          carrier_name: ov?.carrierName || trip.carrier?.name || '',
          carrier_inn: ov?.carrierInn ?? (trip.carrier?.inn || ''),
          carrier_rate: ov?.carrierRate != null ? formatCurrencyPlain(ov.carrierRate) : (tripData.carrierRate != null ? formatCurrencyPlain(tripData.carrierRate) : ''),
          vehicle_plate: trip.vehicle?.plateNumber || '',
          vehicle_brand: trip.vehicle?.brand || '',
          vehicle_model: trip.vehicle?.model || '',
          driver_name: trip.driver?.fullName || '',
          profit: formatCurrencyPlain(tripData.profit),
          total_expenses: formatCurrencyPlain(totalExpenses),
          company_name: settings.company_name || '',
          company_inn: settings.company_inn || '',
          company_address: settings.company_address || '',
          company_bank: settings.company_bank || '',
          company_director: settings.company_director || '',
          date: ov?.docDate ? formatDatePlain(new Date(ov.docDate)) : formatDatePlain(new Date()),
          basis_text: ov?.basisText || tripBasisText || '',
          // Short aliases requested by user
          route: `${trip.routeFrom} \u2014 ${trip.routeTo}`,
          amount: formatCurrencyPlain(ov?.amount ?? tripData.clientRate),
          vehicle: trip.vehicle ? `${trip.vehicle.brand} ${trip.vehicle.model} (${trip.vehicle.plateNumber})` : '',
          driver: trip.driver?.fullName || '',
        };
        const buffer = processDocxTemplate(customTemplate, data);
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
          },
        });
      }

      if (documentType === 'carrier_request' && trip.tripType !== 'expedition') {
        return NextResponse.json({ error: 'Заявка перевозчику доступна только для экспедиции' }, { status: 400 });
      }

      // Programmatic DOCX generation
      let buffer: Buffer;
      try {
        buffer = await buildProgrammaticDocxBuffer(documentType, trip, tripData, ov, overrides);
      } catch {
        return NextResponse.json({ error: 'Неизвестный тип документа' }, { status: 400 });
      }
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        },
      });
    }

    // ====== XLSX FORMAT ======
    if (outputFormat === 'xlsx') {
      let buffer: Buffer;
      switch (documentType) {
        case 'invoice': buffer = await invoiceXlsx(tripData, ov); break;
        case 'act': buffer = await actXlsx(tripData, ov); break;
        case 'carrier_request':
          if (trip.tripType !== 'expedition') return NextResponse.json({ error: 'Заявка перевозчику доступна только для экспедиции' }, { status: 400 });
          buffer = await carrierRequestXlsx(tripData, ov);
          break;
        default: return NextResponse.json({ error: 'Неизвестный тип документа' }, { status: 400 });
      }
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        },
      });
    }

    // ====== PDF FORMAT (default) ======
    // Rendered locally via LibreOffice headless (no external/paid service).
    // Invoice/act use the styled HTML template (matches the company's actual paper format);
    // carrier_request uses the same DOCX generator as the "docx" branch above.
    let pdfBuffer: Buffer;
    try {
      if (documentType === 'invoice' || documentType === 'act') {
        const pdfSettings = await getCompanySettings();
        const docOverrides: DocOverrides = {
          docNumber: ov?.docNumber,
          docDate: ov?.docDate,
          serviceDescription: ov?.serviceDescription,
          amount: ov?.amount,
          clientName: ov?.clientName,
          clientInn: ov?.clientInn,
          clientAddress: ov?.clientAddress,
          clientContact: ov?.clientContact,
          notes: ov?.notes,
          basisText: ov?.basisText,
          sumInWords: ov?.sumInWords,
          company: pdfSettings,
          currency: (trip as any).currency || 'AMD',
        };
        const html = documentType === 'invoice'
          ? generateInvoiceHtml(tripData as any, docOverrides)
          : generateActHtml(tripData as any, docOverrides);
        pdfBuffer = await convertHtmlToPdf(html);
      } else if (documentType === 'carrier_request') {
        if (trip.tripType !== 'expedition') return NextResponse.json({ error: 'Заявка перевозчику доступна только для экспедиции' }, { status: 400 });
        const docxBuffer = await buildProgrammaticDocxBuffer(documentType, trip, tripData, ov, overrides);
        pdfBuffer = await convertDocxBufferToPdf(docxBuffer);
      } else {
        return NextResponse.json({ error: 'Неизвестный тип документа' }, { status: 400 });
      }
    } catch (e) {
      console.error('PDF conversion error:', e);
      return NextResponse.json({ success: false, error: 'Ошибка генерации PDF' }, { status: 500 });
    }

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (error) {
    console.error('Error generating document:', error);
    return NextResponse.json({ success: false, error: 'Ошибка генерации документа' }, { status: 500 });
  }
}