export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getCustomTemplate, processDocxTemplate, getCompanySettings } from '@/lib/template-processor';
import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, TabStopType, TabStopPosition
} from 'docx';

const BORDER_NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: BORDER_NONE, bottom: BORDER_NONE, left: BORDER_NONE, right: BORDER_NONE };

function today(): string {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
}

function emptyLine(count = 1): Paragraph[] {
  return Array(count).fill(null).map(() => new Paragraph({ spacing: { after: 100 } }));
}

function heading(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text, bold: true, size: 28, font: 'Arial' })],
  });
}

function normalText(text: string, opts?: { bold?: boolean; indent?: number }): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    indent: opts?.indent ? { firstLine: opts.indent } : undefined,
    children: [new TextRun({ text, size: 22, font: 'Arial', bold: opts?.bold })],
  });
}

function signatureLine(leftText: string, rightText: string): Paragraph {
  return new Paragraph({
    spacing: { before: 400, after: 100 },
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    children: [
      new TextRun({ text: leftText, size: 22, font: 'Arial' }),
      new TextRun({ text: '\t', size: 22 }),
      new TextRun({ text: rightText, size: 22, font: 'Arial' }),
    ],
  });
}

function generateWaybill(driver: any): Document {
  return new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 720 } } },
      children: [
        heading('ПУТЕВОЙ ЛИСТ'),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [
          new TextRun({ text: `№ ________ от ${today()}`, size: 22, font: 'Arial' }),
        ]}),
        normalText(`Организация: ________________________________________`),
        normalText(`Водитель: ${driver.fullName}`),
        normalText(`Удостоверение: ${driver.licenseNumber || '________________'}`),
        normalText(`Телефон: ${driver.phone || '________________'}`),
        ...emptyLine(),
        normalText('Транспортное средство:', { bold: true }),
        normalText('Марка, модель: ________________________________________'),
        normalText('Гос. номер: ________________________________________'),
        ...emptyLine(),
        normalText('Задание:', { bold: true }),
        normalText('Маршрут: _______________________ → _______________________'),
        normalText('Время выезда: ____________  Время возвращения: ____________'),
        normalText('Показания одометра: выезд ____________ км, возврат ____________ км'),
        ...emptyLine(),
        normalText('Топливо:', { bold: true }),
        normalText('Остаток при выезде: ____________ л'),
        normalText('Выдано: ____________ л'),
        normalText('Остаток при возврате: ____________ л'),
        normalText('Расход: ____________ л'),
        ...emptyLine(),
        normalText('Медосмотр:', { bold: true }),
        normalText('Допущен к работе: ____________ Подпись медработника: ____________'),
        ...emptyLine(),
        normalText('Техосмотр:', { bold: true }),
        normalText('ТС исправно: ____________ Подпись механика: ____________'),
        ...emptyLine(2),
        signatureLine('Диспетчер: __________________ / ФИО', 'Водитель: __________________ / ' + driver.fullName),
      ],
    }],
  });
}

function generateEmploymentContract(driver: any): Document {
  return new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 720 } } },
      children: [
        heading('ТРУДОВОЙ ДОГОВОР'),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [
          new TextRun({ text: `№ ________ от ${today()}`, size: 22, font: 'Arial' }),
        ]}),
        ...emptyLine(),
        normalText(`Водитель: ${driver.fullName}`, { bold: true }),
        normalText(`Телефон: ${driver.phone || '________________'}`),
        normalText(`Водительское удостоверение: ${driver.licenseNumber || '________________'}`),
        ...emptyLine(),
        normalText('1. ПРЕДМЕТ ДОГОВОРА', { bold: true }),
        normalText('1.1. Работодатель принимает Работника на должность: водитель грузового автомобиля.', { indent: 400 }),
        ...emptyLine(2),
        signatureLine('Работодатель: __________________ / ФИО', 'Работник: __________________ / ' + driver.fullName),
      ],
    }],
  });
}

function generatePowerOfAttorney(driver: any): Document {
  return new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 720 } } },
      children: [
        heading('ДОВЕРЕННОСТЬ'),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [
          new TextRun({ text: `на право управления транспортным средством`, size: 22, font: 'Arial', italics: true }),
        ]}),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [
          new TextRun({ text: today(), size: 22, font: 'Arial' }),
        ]}),
        ...emptyLine(),
        normalText(`Водитель: ${driver.fullName}`, { bold: true }),
        normalText(`Телефон: ${driver.phone || '________________'}`),
        normalText(`Водительское удостоверение: ${driver.licenseNumber || '________________'}`),
        ...emptyLine(2),
        signatureLine('Руководитель: __________________ / ФИО', ''),
        normalText('М.П.'),
      ],
    }],
  });
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { driverId, documentType } = await request.json();
    if (!driverId || !documentType) {
      return NextResponse.json({ error: 'driverId и documentType обязательны' }, { status: 400 });
    }

    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) return NextResponse.json({ error: 'Водитель не найден' }, { status: 404 });

    const fileNameMap: Record<string, string> = {
      waybill: `Путевой_лист_${driver.fullName.replace(/\s+/g, '_')}.docx`,
      employment_contract: `Трудовой_договор_${driver.fullName.replace(/\s+/g, '_')}.docx`,
      power_of_attorney: `Доверенность_${driver.fullName.replace(/\s+/g, '_')}.docx`,
    };
    const fileName = fileNameMap[documentType];
    if (!fileName) return NextResponse.json({ error: 'Неизвестный тип документа' }, { status: 400 });

    // Check for custom template
    const customTemplate = await getCustomTemplate(documentType);
    let buffer: Buffer;

    if (customTemplate) {
      // Use custom docx template with docxtemplater
      const settings = await getCompanySettings();
      const data: Record<string, string> = {
        driver_name: driver.fullName,
        phone: driver.phone || '',
        license_number: driver.licenseNumber || '',
        date: today(),
        company_name: settings.company_name || '',
        company_inn: settings.company_inn || '',
        company_address: settings.company_address || '',
        company_bank: settings.company_bank || '',
        company_director: settings.company_director || '',
        vehicle_plate: '',
        vehicle_brand: '',
        vehicle_model: '',
      };
      buffer = processDocxTemplate(customTemplate, data);
    } else {
      // Use default programmatic template
      let doc: Document;
      switch (documentType) {
        case 'waybill': doc = generateWaybill(driver); break;
        case 'employment_contract': doc = generateEmploymentContract(driver); break;
        case 'power_of_attorney': doc = generatePowerOfAttorney(driver); break;
        default: return NextResponse.json({ error: 'Неизвестный тип' }, { status: 400 });
      }
      buffer = Buffer.from(await Packer.toBuffer(doc));
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (error) {
    console.error('Error generating driver doc:', error);
    return NextResponse.json({ error: 'Ошибка генерации документа' }, { status: 500 });
  }
}
