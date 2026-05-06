import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, TabStopType, TabStopPosition,
  HeadingLevel,
} from 'docx';
import ExcelJS from 'exceljs';

export interface DocData {
  tripNumber: string;
  tripDate: string;
  routeFrom: string;
  routeTo: string;
  tripType: string;
  clientRate: number;
  carrierRate?: number | null;
  profit: number;
  client: { name: string; contactPerson?: string | null; phone?: string | null; email?: string | null; inn?: string | null; address?: string | null };
  vehicle?: { plateNumber: string; brand: string; model: string } | null;
  driver?: { fullName: string; phone?: string | null } | null;
  carrier?: { name: string; contactPerson?: string | null; phone?: string | null; email?: string | null; inn?: string | null } | null;
  expenses?: { expenseType: string; amount: number; description?: string | null }[];
}

export interface DocOverrides {
  docNumber?: string;
  docDate?: string;
  serviceDescription?: string;
  amount?: number;
  clientName?: string;
  clientInn?: string;
  clientAddress?: string;
  clientContact?: string;
  carrierName?: string;
  carrierInn?: string;
  carrierContact?: string;
  carrierPhone?: string;
  carrierRate?: number;
  notes?: string;
  contractNumber?: string;
  contractDate?: string;
  requestNumber?: string;
  basisText?: string;
  sumInWords?: string;
}

function fmtDate(d: string | Date): string {
  try { return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(d)); }
  catch { return '—'; }
}
function fmtCurrency(v: number): string {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(v);
}
function todayStr(): string { return fmtDate(new Date()); }

const BORDER_NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: BORDER_NONE, bottom: BORDER_NONE, left: BORDER_NONE, right: BORDER_NONE };
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 1, color: '999999' };
const BORDERS = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };

function hdr(text: string): Paragraph {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text, bold: true, size: 28, font: 'Arial' })] });
}
function sub(text: string): Paragraph {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text, size: 20, font: 'Arial', color: '666666' })] });
}
function txt(text: string, opts?: { bold?: boolean }): Paragraph {
  return new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text, size: 22, font: 'Arial', bold: opts?.bold })] });
}
function cell(text: string, opts?: { bold?: boolean; width?: number }): TableCell {
  return new TableCell({
    borders: BORDERS,
    width: opts?.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, size: 20, font: 'Arial', bold: opts?.bold })] })],
  });
}
function emptyLine(): Paragraph { return new Paragraph({ spacing: { after: 100 } }); }
function sigLine(left: string, right: string): Paragraph {
  return new Paragraph({
    spacing: { before: 400, after: 100 },
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    children: [
      new TextRun({ text: left, size: 22, font: 'Arial' }),
      new TextRun({ text: '\t', size: 22 }),
      new TextRun({ text: right, size: 22, font: 'Arial' }),
    ],
  });
}

// ====== WORD GENERATORS ======

export function invoiceDocx(trip: DocData, ov?: DocOverrides): Document {
  const docNum = ov?.docNumber || `\u0421\u0427-${trip.tripNumber}`;
  const docDate = ov?.docDate ? fmtDate(ov.docDate) : todayStr();
  const cName = ov?.clientName || trip.client.name;
  const cInn = ov?.clientInn ?? (trip.client.inn || '\u2014');
  const cAddr = ov?.clientAddress ?? (trip.client.address || '\u2014');
  const cContact = ov?.clientContact ?? (trip.client.contactPerson || '\u2014');
  const amount = ov?.amount ?? trip.clientRate;
  const desc = ov?.serviceDescription || `\u0422\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u043D\u043E-\u044D\u043A\u0441\u043F\u0435\u0434\u0438\u0446\u0438\u043E\u043D\u043D\u044B\u0435 \u0443\u0441\u043B\u0443\u0433\u0438 \u043F\u043E \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u0443 ${trip.routeFrom} \u2014 ${trip.routeTo}`;
  const notes = ov?.notes || '';
  const basisText = ov?.basisText || '';

  return new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 720 } } },
      children: [
        hdr('\u0421\u0427\u0401\u0422 \u041D\u0410 \u041E\u041F\u041B\u0410\u0422\u0423'),
        sub(`${docNum} \u043E\u0442 ${docDate}`),
        ...(basisText ? [txt(basisText)] : []),
        emptyLine(),
        txt('\u041A\u041B\u0418\u0415\u041D\u0422', { bold: true }),
        txt(`Наименование: ${cName}`),
        txt(`ИНН: ${cInn}`),
        txt(`Контакт: ${cContact}`),
        txt(`Адрес: ${cAddr}`),
        emptyLine(),
        txt('МАРШРУТ', { bold: true }),
        txt(`${trip.routeFrom} → ${trip.routeTo}`),
        emptyLine(),
        txt('ДЕТАЛИ', { bold: true }),
        new Table({
          rows: [
            new TableRow({ children: [cell('№', { bold: true, width: 10 }), cell('Описание услуги', { bold: true, width: 50 }), cell('Дата', { bold: true, width: 20 }), cell('Сумма', { bold: true, width: 20 })] }),
            new TableRow({ children: [cell('1'), cell(desc), cell(fmtDate(trip.tripDate)), cell(fmtCurrency(amount))] }),
          ],
        }),
        emptyLine(),
        txt(`Итого к оплате: ${fmtCurrency(amount)}`, { bold: true }),
        ...(notes ? [emptyLine(), txt('ПРИМЕЧАНИЕ', { bold: true }), txt(notes)] : []),
        emptyLine(), emptyLine(),
        sigLine('Исполнитель: __________________ / ФИО', ''),
        sigLine(`Заказчик: __________________ / ${cContact !== '—' ? cContact : 'ФИО'}`, ''),
      ],
    }],
  });
}

export function actDocx(trip: DocData, ov?: DocOverrides): Document {
  const docNum = ov?.docNumber || `\u0410\u041A\u0422-${trip.tripNumber}`;
  const docDate = ov?.docDate ? fmtDate(ov.docDate) : todayStr();
  const cName = ov?.clientName || trip.client.name;
  const cInn = ov?.clientInn ?? (trip.client.inn || '\u2014');
  const cContact = ov?.clientContact ?? (trip.client.contactPerson || '\u2014');
  const amount = ov?.amount ?? trip.clientRate;
  const desc = ov?.serviceDescription || `\u041F\u0435\u0440\u0435\u0432\u043E\u0437\u043A\u0430 \u0433\u0440\u0443\u0437\u0430 \u043F\u043E \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u0443 ${trip.routeFrom} \u2014 ${trip.routeTo}${trip.vehicle ? ` (\u0422\u0421: ${trip.vehicle.brand} ${trip.vehicle.model}, ${trip.vehicle.plateNumber})` : ''}`;
  const notes = ov?.notes || '\u0412\u044B\u0448\u0435\u043F\u0435\u0440\u0435\u0447\u0438\u0441\u043B\u0435\u043D\u043D\u044B\u0435 \u0443\u0441\u043B\u0443\u0433\u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u044B \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u0438 \u0432 \u0441\u0440\u043E\u043A. \u0417\u0430\u043A\u0430\u0437\u0447\u0438\u043A \u043F\u0440\u0435\u0442\u0435\u043D\u0437\u0438\u0439 \u043F\u043E \u043E\u0431\u044A\u0451\u043C\u0443, \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u0443 \u0438 \u0441\u0440\u043E\u043A\u0430\u043C \u043E\u043A\u0430\u0437\u0430\u043D\u0438\u044F \u0443\u0441\u043B\u0443\u0433 \u043D\u0435 \u0438\u043C\u0435\u0435\u0442.';
  const basisText = ov?.basisText || '';

  return new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 720 } } },
      children: [
        hdr('\u0410\u041A\u0422 \u0412\u042B\u041F\u041E\u041B\u041D\u0415\u041D\u041D\u042B\u0425 \u0420\u0410\u0411\u041E\u0422'),
        sub(`${docNum} \u043E\u0442 ${docDate}`),
        ...(basisText ? [txt(basisText)] : []),
        emptyLine(),
        txt('\u0421\u0422\u041E\u0420\u041E\u041D\u042B', { bold: true }),
        txt(`Заказчик: ${cName}`),
        txt(`ИНН заказчика: ${cInn}`),
        emptyLine(),
        txt('МАРШРУТ', { bold: true }),
        txt(`${trip.routeFrom} → ${trip.routeTo}`),
        emptyLine(),
        txt('ОКАЗАННЫЕ УСЛУГИ', { bold: true }),
        new Table({
          rows: [
            new TableRow({ children: [cell('№', { bold: true, width: 10 }), cell('Наименование услуги', { bold: true, width: 50 }), cell('Дата', { bold: true, width: 20 }), cell('Стоимость', { bold: true, width: 20 })] }),
            new TableRow({ children: [cell('1'), cell(desc), cell(fmtDate(trip.tripDate)), cell(fmtCurrency(amount))] }),
          ],
        }),
        emptyLine(),
        txt(`Итого: ${fmtCurrency(amount)}`, { bold: true }),
        emptyLine(),
        txt(notes),
        emptyLine(), emptyLine(),
        sigLine('Исполнитель: __________________ / ФИО   М.П.', ''),
        sigLine(`Заказчик: __________________ / ${cContact !== '—' ? cContact : 'ФИО'}   М.П.`, ''),
      ],
    }],
  });
}

export function carrierRequestDocx(trip: DocData, ov?: DocOverrides): Document {
  const docNum = ov?.docNumber || `ЗВК-${trip.tripNumber}`;
  const docDate = ov?.docDate ? fmtDate(ov.docDate) : todayStr();
  const crName = ov?.carrierName || trip.carrier?.name || '—';
  const crInn = ov?.carrierInn ?? (trip.carrier?.inn || '—');
  const crContact = ov?.carrierContact ?? (trip.carrier?.contactPerson || '—');
  const crPhone = ov?.carrierPhone ?? (trip.carrier?.phone || '—');
  const rate = ov?.carrierRate ?? (trip.carrierRate || 0);
  const notes = ov?.notes || 'Перевозчик обязуется предоставить транспорт в указанные сроки. Оплата производится по факту выполнения перевозки и предоставления полного пакета документов.';

  return new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 720 } } },
      children: [
        hdr('ЗАЯВКА ПЕРЕВОЗЧИКУ'),
        sub(`${docNum} от ${docDate}`),
        emptyLine(),
        txt('ПЕРЕВОЗЧИК', { bold: true }),
        txt(`Наименование: ${crName}`),
        txt(`ИНН: ${crInn}`),
        txt(`Контакт: ${crContact}`),
        txt(`Телефон: ${crPhone}`),
        emptyLine(),
        txt('МАРШРУТ', { bold: true }),
        txt(`${trip.routeFrom} → ${trip.routeTo}`),
        emptyLine(),
        txt('УСЛОВИЯ ПЕРЕВОЗКИ', { bold: true }),
        new Table({
          rows: [
            new TableRow({ children: [cell('Параметр', { bold: true, width: 50 }), cell('Значение', { bold: true, width: 50 })] }),
            new TableRow({ children: [cell('Дата загрузки'), cell(fmtDate(trip.tripDate))] }),
            new TableRow({ children: [cell('Маршрут'), cell(`${trip.routeFrom} → ${trip.routeTo}`)] }),
            new TableRow({ children: [cell('Клиент (грузовладелец)'), cell(trip.client.name)] }),
            new TableRow({ children: [cell('Ставка перевозчика'), cell(fmtCurrency(rate))] }),
          ],
        }),
        emptyLine(),
        txt(`Важно: ${notes}`),
        emptyLine(), emptyLine(),
        sigLine('Заказчик: __________________ / ФИО', ''),
        sigLine(`Перевозчик: __________________ / ${crContact !== '—' ? crContact : 'ФИО'}`, ''),
      ],
    }],
  });
}

// ====== EXCEL GENERATORS ======

function styleHeaderRow(ws: ExcelJS.Worksheet, row: number) {
  const r = ws.getRow(row);
  r.eachCell(c => {
    c.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
}

function styleDataCell(ws: ExcelJS.Worksheet, row: number, colCount: number) {
  const r = ws.getRow(row);
  for (let i = 1; i <= colCount; i++) {
    const c = r.getCell(i);
    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    c.alignment = { vertical: 'middle', wrapText: true };
  }
}

export async function invoiceXlsx(trip: DocData, ov?: DocOverrides): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('\u0421\u0447\u0451\u0442');
  const docNum = ov?.docNumber || `\u0421\u0427-${trip.tripNumber}`;
  const docDate = ov?.docDate ? fmtDate(ov.docDate) : todayStr();
  const cName = ov?.clientName || trip.client.name;
  const cInn = ov?.clientInn ?? (trip.client.inn || '\u2014');
  const cAddr = ov?.clientAddress ?? (trip.client.address || '\u2014');
  const cContact = ov?.clientContact ?? (trip.client.contactPerson || '\u2014');
  const amount = ov?.amount ?? trip.clientRate;
  const desc = ov?.serviceDescription || `\u0422\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u043D\u043E-\u044D\u043A\u0441\u043F\u0435\u0434\u0438\u0446\u0438\u043E\u043D\u043D\u044B\u0435 \u0443\u0441\u043B\u0443\u0433\u0438 \u043F\u043E \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u0443 ${trip.routeFrom} \u2014 ${trip.routeTo}`;
  const basisText = ov?.basisText || '';

  ws.columns = [{ width: 6 }, { width: 45 }, { width: 18 }, { width: 20 }];

  ws.mergeCells('A1:D1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `\u0421\u0427\u0401\u0422 \u041D\u0410 \u041E\u041F\u041B\u0410\u0422\u0423 ${docNum} \u043E\u0442 ${docDate}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF2563EB' } };
  titleCell.alignment = { horizontal: 'center' };

  let nextRow = 3;
  if (basisText) {
    ws.getCell(`A${nextRow}`).value = basisText;
    ws.getCell(`A${nextRow}`).font = { italic: true, size: 10, color: { argb: 'FF475569' } };
    ws.mergeCells(`A${nextRow}:D${nextRow}`);
    nextRow += 1;
  }

  ws.getCell(`A${nextRow}`).value = '\u041A\u043B\u0438\u0435\u043D\u0442:';
  ws.getCell(`A${nextRow}`).font = { bold: true };
  ws.getCell(`B${nextRow}`).value = cName;
  ws.getCell(`A${nextRow + 1}`).value = '\u0418\u041D\u041D:';
  ws.getCell(`B${nextRow + 1}`).value = cInn;
  ws.getCell(`A${nextRow + 2}`).value = '\u041A\u043E\u043D\u0442\u0430\u043A\u0442:';
  ws.getCell(`B${nextRow + 2}`).value = cContact;
  ws.getCell(`A${nextRow + 3}`).value = '\u0410\u0434\u0440\u0435\u0441:';
  ws.getCell(`B${nextRow + 3}`).value = cAddr;
  ws.getCell(`A${nextRow + 4}`).value = '\u041C\u0430\u0440\u0448\u0440\u0443\u0442:';
  ws.getCell(`B${nextRow + 4}`).value = `${trip.routeFrom} \u2192 ${trip.routeTo}`;

  const hdrRow = nextRow + 6;
  ws.getRow(hdrRow).values = ['№', 'Описание услуги', 'Дата', 'Сумма'];
  styleHeaderRow(ws, hdrRow);
  ws.getRow(hdrRow + 1).values = [1, desc, fmtDate(trip.tripDate), amount];
  styleDataCell(ws, hdrRow + 1, 4);
  ws.getCell(`D${hdrRow + 1}`).numFmt = '#,##0.00 ₽';

  // Total
  ws.getRow(hdrRow + 3).values = ['', '', 'Итого к оплате:', amount];
  ws.getCell(`C${hdrRow + 3}`).font = { bold: true };
  ws.getCell(`D${hdrRow + 3}`).font = { bold: true };
  ws.getCell(`D${hdrRow + 3}`).numFmt = '#,##0.00 ₽';

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function actXlsx(trip: DocData, ov?: DocOverrides): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('\u0410\u043A\u0442');
  const docNum = ov?.docNumber || `\u0410\u041A\u0422-${trip.tripNumber}`;
  const docDate = ov?.docDate ? fmtDate(ov.docDate) : todayStr();
  const cName = ov?.clientName || trip.client.name;
  const cInn = ov?.clientInn ?? (trip.client.inn || '\u2014');
  const amount = ov?.amount ?? trip.clientRate;
  const desc = ov?.serviceDescription || `\u041F\u0435\u0440\u0435\u0432\u043E\u0437\u043A\u0430 \u0433\u0440\u0443\u0437\u0430 \u043F\u043E \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u0443 ${trip.routeFrom} \u2014 ${trip.routeTo}${trip.vehicle ? ` (\u0422\u0421: ${trip.vehicle.brand} ${trip.vehicle.model}, ${trip.vehicle.plateNumber})` : ''}`;
  const notes = ov?.notes || '\u0412\u044B\u0448\u0435\u043F\u0435\u0440\u0435\u0447\u0438\u0441\u043B\u0435\u043D\u043D\u044B\u0435 \u0443\u0441\u043B\u0443\u0433\u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u044B \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u0438 \u0432 \u0441\u0440\u043E\u043A.';
  const basisText = ov?.basisText || '';

  ws.columns = [{ width: 6 }, { width: 45 }, { width: 18 }, { width: 20 }];

  ws.mergeCells('A1:D1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `\u0410\u041A\u0422 \u0412\u042B\u041F\u041E\u041B\u041D\u0415\u041D\u041D\u042B\u0425 \u0420\u0410\u0411\u041E\u0422 ${docNum} \u043E\u0442 ${docDate}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF2563EB' } };
  titleCell.alignment = { horizontal: 'center' };

  let nextRow = 3;
  if (basisText) {
    ws.getCell(`A${nextRow}`).value = basisText;
    ws.getCell(`A${nextRow}`).font = { italic: true, size: 10, color: { argb: 'FF475569' } };
    ws.mergeCells(`A${nextRow}:D${nextRow}`);
    nextRow += 1;
  }

  ws.getCell(`A${nextRow}`).value = '\u0417\u0430\u043A\u0430\u0437\u0447\u0438\u043A:';
  ws.getCell(`A${nextRow}`).font = { bold: true };
  ws.getCell(`B${nextRow}`).value = cName;
  ws.getCell(`A${nextRow + 1}`).value = '\u0418\u041D\u041D:';
  ws.getCell(`B${nextRow + 1}`).value = cInn;
  ws.getCell(`A${nextRow + 2}`).value = '\u041C\u0430\u0440\u0448\u0440\u0443\u0442:';
  ws.getCell(`B${nextRow + 2}`).value = `${trip.routeFrom} \u2192 ${trip.routeTo}`;

  const hdrRow = nextRow + 4;
  ws.getRow(hdrRow).values = ['№', 'Наименование услуги', 'Дата', 'Стоимость'];
  styleHeaderRow(ws, hdrRow);
  ws.getRow(hdrRow + 1).values = [1, desc, fmtDate(trip.tripDate), amount];
  styleDataCell(ws, hdrRow + 1, 4);
  ws.getCell(`D${hdrRow + 1}`).numFmt = '#,##0.00 ₽';

  ws.getRow(hdrRow + 3).values = ['', '', 'Итого:', amount];
  ws.getCell(`C${hdrRow + 3}`).font = { bold: true };
  ws.getCell(`D${hdrRow + 3}`).font = { bold: true };
  ws.getCell(`D${hdrRow + 3}`).numFmt = '#,##0.00 ₽';

  ws.mergeCells(`A${hdrRow + 5}:D${hdrRow + 5}`);
  ws.getCell(`A${hdrRow + 5}`).value = notes;
  ws.getCell(`A${hdrRow + 5}`).alignment = { wrapText: true };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function carrierRequestXlsx(trip: DocData, ov?: DocOverrides): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Заявка');
  const docNum = ov?.docNumber || `ЗВК-${trip.tripNumber}`;
  const docDate = ov?.docDate ? fmtDate(ov.docDate) : todayStr();
  const crName = ov?.carrierName || trip.carrier?.name || '—';
  const crInn = ov?.carrierInn ?? (trip.carrier?.inn || '—');
  const crContact = ov?.carrierContact ?? (trip.carrier?.contactPerson || '—');
  const crPhone = ov?.carrierPhone ?? (trip.carrier?.phone || '—');
  const rate = ov?.carrierRate ?? (trip.carrierRate || 0);

  ws.columns = [{ width: 30 }, { width: 35 }];

  ws.mergeCells('A1:B1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `ЗАЯВКА ПЕРЕВОЗЧИКУ ${docNum} от ${docDate}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF2563EB' } };
  titleCell.alignment = { horizontal: 'center' };

  ws.getCell('A3').value = 'Перевозчик:';
  ws.getCell('A3').font = { bold: true };
  ws.getCell('B3').value = crName;
  ws.getCell('A4').value = 'ИНН:';
  ws.getCell('B4').value = crInn;
  ws.getCell('A5').value = 'Контакт:';
  ws.getCell('B5').value = crContact;
  ws.getCell('A6').value = 'Телефон:';
  ws.getCell('B6').value = crPhone;

  const hdrRow = 8;
  ws.getRow(hdrRow).values = ['Параметр', 'Значение'];
  styleHeaderRow(ws, hdrRow);
  const rows = [
    ['Дата загрузки', fmtDate(trip.tripDate)],
    ['Маршрут', `${trip.routeFrom} → ${trip.routeTo}`],
    ['Клиент (грузовладелец)', trip.client.name],
    ['Ставка перевозчика', fmtCurrency(rate)],
  ];
  rows.forEach((r, i) => {
    ws.getRow(hdrRow + 1 + i).values = r;
    styleDataCell(ws, hdrRow + 1 + i, 2);
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// Helper to pack docx
export async function packDocx(doc: Document): Promise<Buffer> {
  return Buffer.from(await Packer.toBuffer(doc));
}