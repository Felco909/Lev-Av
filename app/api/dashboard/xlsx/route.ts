export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import ExcelJS from 'exceljs';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });

    // Fetch dashboard data from our own API
    const { searchParams } = new URL(req.url);
    const dashUrl = new URL('/api/dashboard', req.url);
    searchParams.forEach((v, k) => dashUrl.searchParams.set(k, v));

    // Use internal fetch via absolute URL
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const apiUrl = `${baseUrl}/api/dashboard?${searchParams.toString()}`;
    const res = await fetch(apiUrl, { headers: { cookie: req.headers.get('cookie') || '' } });
    if (!res.ok) throw new Error('Failed to fetch dashboard data');
    const data = await res.json();

    const wb = new ExcelJS.Workbook();
    wb.creator = 'TMS System';

    const NUM_FMT = '#,##0';
    const headerFill = (color: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: color } });
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
    const bodyFont: Partial<ExcelJS.Font> = { size: 11, name: 'Calibri' };
    const altFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };

    function addSheet(
      name: string,
      color: string,
      columns: { header: string; key: string; width: number; isNum?: boolean }[],
      rows: any[],
    ) {
      const ws = wb.addWorksheet(name);
      ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width }));

      // Style header
      const headerRow = ws.getRow(1);
      headerRow.eachCell(cell => {
        cell.fill = headerFill(color);
        cell.font = headerFont;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      headerRow.height = 28;

      // Data rows
      rows.forEach((row, idx) => {
        const r = ws.addRow(row);
        r.eachCell((cell, colNumber) => {
          cell.font = bodyFont;
          if (columns[colNumber - 1]?.isNum) cell.numFmt = NUM_FMT;
        });
        if (idx % 2 === 1) {
          r.eachCell(cell => { cell.fill = altFill; });
        }
      });

      // ITOGO row
      if (rows.length > 0) {
        const totalRow = ws.addRow({});
        totalRow.getCell(1).value = '\u0418\u0422\u041e\u0413\u041e';
        totalRow.getCell(1).font = { ...bodyFont, bold: true };
        columns.forEach((c, i) => {
          if (c.isNum) {
            const colLetter = String.fromCharCode(65 + i);
            const cell = totalRow.getCell(i + 1);
            cell.value = { formula: `SUM(${colLetter}2:${colLetter}${rows.length + 1})` } as any;
            cell.numFmt = NUM_FMT;
            cell.font = { ...bodyFont, bold: true };
          }
        });
      }

      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columns.length)}1` };
      return ws;
    }

    // Sheet 1: Problem trips
    addSheet('\u041f\u0440\u043e\u0431\u043b\u0435\u043c\u043d\u044b\u0435', 'FFDC2626', [
      { header: '\u0417\u0430\u044f\u0432\u043a\u0430', key: 'tripNumber', width: 14 },
      { header: '\u041a\u043b\u0438\u0435\u043d\u0442', key: 'clientName', width: 25 },
      { header: '\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a', key: 'carrierName', width: 25 },
      { header: '\u041e\u043f\u043b. \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u043c \u058f', key: 'clientPaid', width: 18, isNum: true },
      { header: '\u041e\u043f\u043b. \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0443 \u058f', key: 'carrierPaid', width: 22, isNum: true },
      { header: '\u0420\u0430\u0437\u043d\u0438\u0446\u0430 \u058f', key: 'diff', width: 16, isNum: true },
    ], data.problemRows ?? []);

    // Sheet 2: Client debts
    addSheet('\u0414\u043e\u043b\u0433\u0438 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432', 'FF2563EB', [
      { header: '\u0417\u0430\u044f\u0432\u043a\u0430', key: 'tripNumber', width: 14 },
      { header: '\u041a\u043b\u0438\u0435\u043d\u0442', key: 'clientName', width: 25 },
      { header: '\u0421\u0442\u0430\u0432\u043a\u0430 \u058f', key: 'rate', width: 16, isNum: true },
      { header: '\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e \u058f', key: 'paid', width: 16, isNum: true },
      { header: '\u041e\u0441\u0442\u0430\u0442\u043e\u043a \u058f', key: 'remaining', width: 16, isNum: true },
    ], data.clientDebts ?? []);

    // Sheet 3: Carrier debts
    addSheet('\u0414\u043e\u043b\u0433\u0438 \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0430\u043c', 'FFEA580C', [
      { header: '\u0417\u0430\u044f\u0432\u043a\u0430', key: 'tripNumber', width: 14 },
      { header: '\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a', key: 'carrierName', width: 25 },
      { header: '\u0421\u0443\u043c\u043c\u0430 \u058f', key: 'rate', width: 16, isNum: true },
      { header: '\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e \u058f', key: 'paid', width: 16, isNum: true },
      { header: '\u041e\u0441\u0442\u0430\u0442\u043e\u043a \u058f', key: 'remaining', width: 16, isNum: true },
    ], data.carrierDebts ?? []);

    // Sheet 4: Profit
    addSheet('\u041f\u0440\u0438\u0431\u044b\u043b\u044c', 'FF16A34A', [
      { header: '\u0417\u0430\u044f\u0432\u043a\u0430', key: 'tripNumber', width: 14 },
      { header: '\u041a\u043b\u0438\u0435\u043d\u0442', key: 'clientName', width: 25 },
      { header: '\u0414\u043e\u0445\u043e\u0434 \u058f', key: 'income', width: 16, isNum: true },
      { header: '\u0420\u0430\u0441\u0445\u043e\u0434 \u058f', key: 'expense', width: 16, isNum: true },
      { header: '\u041f\u0440\u0438\u0431\u044b\u043b\u044c \u058f', key: 'profit', width: 16, isNum: true },
    ], data.profitRows ?? []);

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="dashboard_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (e: any) {
    console.error('Dashboard XLSX error:', e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430' }, { status: 500 });
  }
}
