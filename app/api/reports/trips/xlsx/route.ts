export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import ExcelJS from 'exceljs';

function fmtDate(d: Date | string | null): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '';
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
}

interface ColDef {
  header: string;
  key: string;
  width: number;
  isNumber?: boolean;
  isDate?: boolean;
}

function createSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: ColDef[],
  rows: Record<string, any>[],
  opts?: { headerColor?: string; totalsColumns?: string[] }
) {
  const ws = wb.addWorksheet(name);
  const hColor = opts?.headerColor || 'FF2563EB';

  // Define columns
  ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width }));

  // Style header
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hColor } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 32;

  // Add data
  rows.forEach((r, idx) => {
    const row = ws.addRow(r);
    row.font = { size: 11, name: 'Calibri' };
    row.alignment = { vertical: 'middle' };
    if (idx % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    }
    // Light bottom border
    row.eachCell(cell => {
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    });
  });

  // Format columns
  columns.forEach((col, i) => {
    const colNum = i + 1;
    if (col.isNumber) {
      ws.getColumn(colNum).numFmt = '#,##0';
      ws.getColumn(colNum).alignment = { horizontal: 'right', vertical: 'middle' };
    }
    if (col.isDate) {
      ws.getColumn(colNum).numFmt = 'DD.MM.YYYY';
    }
  });

  // Totals row
  if (rows.length > 0 && opts?.totalsColumns?.length) {
    const totRow = ws.addRow({});
    totRow.getCell(1).value = '\u0418\u0422\u041e\u0413\u041e';
    totRow.font = { bold: true, size: 11, name: 'Calibri' };
    totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
    totRow.border = { top: { style: 'medium', color: { argb: hColor } } };

    for (const key of (opts.totalsColumns || [])) {
      const ci = columns.findIndex(c => c.key === key);
      if (ci >= 0) {
        const colLetter = getColLetter(ci + 1);
        totRow.getCell(ci + 1).value = { formula: `SUM(${colLetter}2:${colLetter}${rows.length + 1})` } as any;
        totRow.getCell(ci + 1).numFmt = '#,##0';
        totRow.getCell(ci + 1).font = { bold: true, size: 11, name: 'Calibri' };
      }
    }

    // Trip count in col 2
    const countCell = totRow.getCell(2);
    if (!opts.totalsColumns.includes(columns[1]?.key)) {
      countCell.value = `${rows.length} \u0437\u0430\u044f\u0432\u043e\u043a`;
      countCell.font = { bold: true, size: 11, name: 'Calibri' };
    }
  }

  // Freeze top row
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0, activeCell: 'A2' }];

  // Auto-filter
  if (rows.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: columns.length } };
  }

  return ws;
}

function getColLetter(n: number): string {
  let s = '';
  let num = n;
  while (num > 0) { num--; s = String.fromCharCode(65 + (num % 26)) + s; num = Math.floor(num / 26); }
  return s;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // Отменённая заявка (Этап 4 аудита) — не в отчёт по прибыли/долгам, сделка не состоялась.
    const dateWhere: any = { NOT: { status: 'cancelled' } };
    if (dateFrom || dateTo) {
      dateWhere.tripDate = {};
      if (dateFrom) dateWhere.tripDate.gte = new Date(dateFrom);
      if (dateTo) dateWhere.tripDate.lte = new Date(dateTo);
    }

    // Fetch trips for profit & cash gaps
    const trips = await prisma.trip.findMany({
      where: dateWhere,
      include: { client: true, vehicle: true, driver: true, carrier: true, expenses: true },
      orderBy: { tripDate: 'desc' },
    });

    // Fetch client debts (all time, unpaid)
    const clientDebtTrips = await prisma.trip.findMany({
      where: { clientPaymentStatus: { in: ['not_paid', 'partially_paid'] }, NOT: { status: 'cancelled' } },
      include: { client: { select: { name: true, phone: true } } },
      orderBy: { tripDate: 'desc' },
    });

    // Fetch carrier debts (all time, unpaid)
    const carrierDebtTrips = await prisma.trip.findMany({
      where: { tripType: 'expedition', carrierPaymentStatus: { in: ['not_paid', 'partially_paid'] }, NOT: { status: 'cancelled' } },
      include: {
        carrier: { select: { name: true } },
        client: { select: { name: true } },
      },
      orderBy: { tripDate: 'desc' },
    });

    // Топливо собственного транспорта — источник истины VehicleTrip/Wialon (Аудит топлива,
    // 2026-07-24), та же величина, что в /api/reports/own-fleet. Отдельный лист, т.к. это другая
    // сущность (рейс машины), чем "Прибыль" (заявка клиента) — один рейс может обслуживать
    // несколько заявок, суммировать по заявкам нельзя.
    const fuelWhere: any = {};
    if (dateFrom || dateTo) {
      fuelWhere.departureDate = {};
      if (dateFrom) fuelWhere.departureDate.gte = new Date(dateFrom);
      if (dateTo) fuelWhere.departureDate.lte = new Date(dateTo);
    }
    const fuelVehicleTrips = await prisma.vehicleTrip.findMany({
      where: fuelWhere,
      include: { vehicle: { select: { plateNumber: true } } },
      orderBy: { departureDate: 'desc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'TMS — Leva Logistics';
    wb.created = new Date();

    // ========== SHEET 1: Client Debts ==========
    const clientDebtRows = clientDebtTrips.map(t => {
      const rate = Number((t as any).clientRateAmd ?? t.clientRate ?? 0);
      const paid = Number((t as any).clientPaidAmountAmd ?? 0);
      return {
        client: t.client?.name || '',
        phone: (t.client as any)?.phone || '',
        tripNumber: t.tripNumber,
        route: `${t.routeFrom} \u2192 ${t.routeTo}`,
        date: t.tripDate,
        rate: Math.round(rate),
        paid: Math.round(paid),
        remaining: Math.round(Math.max(0, rate - paid)),
      };
    });

    createSheet(wb, '\u0414\u043e\u043b\u0433\u0438 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432', [
      { header: '\u041a\u043b\u0438\u0435\u043d\u0442', key: 'client', width: 28 },
      { header: '\u0422\u0435\u043b\u0435\u0444\u043e\u043d', key: 'phone', width: 18 },
      { header: '\u2116 \u0437\u0430\u044f\u0432\u043a\u0438', key: 'tripNumber', width: 14 },
      { header: '\u041c\u0430\u0440\u0448\u0440\u0443\u0442', key: 'route', width: 30 },
      { header: '\u0414\u0430\u0442\u0430', key: 'date', width: 14, isDate: true },
      { header: '\u0421\u0442\u0430\u0432\u043a\u0430 \u058f', key: 'rate', width: 16, isNumber: true },
      { header: '\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e \u058f', key: 'paid', width: 16, isNumber: true },
      { header: '\u041e\u0441\u0442\u0430\u0442\u043e\u043a \u058f', key: 'remaining', width: 16, isNumber: true },
    ], clientDebtRows, { headerColor: 'FF2563EB', totalsColumns: ['rate', 'paid', 'remaining'] });

    // ========== SHEET 2: Carrier Debts ==========
    const carrierDebtRows = carrierDebtTrips.map(t => {
      const rate = Number((t as any).carrierRateAmd ?? t.carrierRate ?? 0);
      const paid = Number((t as any).carrierPaidAmountAmd ?? (t as any).carrierPaidAmount ?? 0);
      return {
        carrier: t.carrier?.name || '\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d',
        tripNumber: t.tripNumber,
        client: t.client?.name || '',
        route: `${t.routeFrom} \u2192 ${t.routeTo}`,
        date: t.tripDate,
        rate: Math.round(rate),
        paid: Math.round(paid),
        remaining: Math.round(Math.max(0, rate - paid)),
      };
    });

    createSheet(wb, '\u0414\u043e\u043b\u0433\u0438 \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0430\u043c', [
      { header: '\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a', key: 'carrier', width: 28 },
      { header: '\u2116 \u0437\u0430\u044f\u0432\u043a\u0438', key: 'tripNumber', width: 14 },
      { header: '\u041a\u043b\u0438\u0435\u043d\u0442', key: 'client', width: 24 },
      { header: '\u041c\u0430\u0440\u0448\u0440\u0443\u0442', key: 'route', width: 30 },
      { header: '\u0414\u0430\u0442\u0430', key: 'date', width: 14, isDate: true },
      { header: '\u0421\u0443\u043c\u043c\u0430 \u058f', key: 'rate', width: 16, isNumber: true },
      { header: '\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e \u058f', key: 'paid', width: 16, isNumber: true },
      { header: '\u041e\u0441\u0442\u0430\u0442\u043e\u043a \u058f', key: 'remaining', width: 16, isNumber: true },
    ], carrierDebtRows, { headerColor: 'FFEA580C', totalsColumns: ['rate', 'paid', 'remaining'] });

    // ========== SHEET 3: Profit ==========
    const profitRows = trips.map(t => {
      const revenue = Number((t as any).clientRateAmd ?? t.clientRate ?? 0);
      // Каноническое сохранённое profitAmd/profit (та же формула, что в trip-form.tsx /
      // lib/finance/*), а не пересчёт по плоской сумме расходов — та версия не отличала
      // перевыставляемые клиенту расходы от реальных издержек и занижала прибыль.
      const profit = Number((t as any).profitAmd ?? t.profit ?? 0);
      const expense = revenue - profit;
      return {
        date: t.tripDate,
        tripNumber: t.tripNumber,
        route: `${t.routeFrom} \u2192 ${t.routeTo}`,
        client: t.client?.name || '',
        type: t.tripType === 'own_transport' ? '\u0421\u043e\u0431\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0435' : '\u042d\u043a\u0441\u043f\u0435\u0434\u0438\u0446\u0438\u044f',
        revenue: Math.round(revenue),
        expense: Math.round(expense),
        profit: Math.round(profit),
      };
    });

    createSheet(wb, '\u041f\u0440\u0438\u0431\u044b\u043b\u044c', [
      { header: '\u0414\u0430\u0442\u0430', key: 'date', width: 14, isDate: true },
      { header: '\u2116 \u0437\u0430\u044f\u0432\u043a\u0438', key: 'tripNumber', width: 14 },
      { header: '\u041c\u0430\u0440\u0448\u0440\u0443\u0442', key: 'route', width: 30 },
      { header: '\u041a\u043b\u0438\u0435\u043d\u0442', key: 'client', width: 24 },
      { header: '\u0422\u0438\u043f', key: 'type', width: 16 },
      { header: '\u0414\u043e\u0445\u043e\u0434 \u058f', key: 'revenue', width: 16, isNumber: true },
      { header: '\u0420\u0430\u0441\u0445\u043e\u0434 \u058f', key: 'expense', width: 16, isNumber: true },
      { header: '\u041f\u0440\u0438\u0431\u044b\u043b\u044c \u058f', key: 'profit', width: 16, isNumber: true },
    ], profitRows, { headerColor: 'FF16A34A', totalsColumns: ['revenue', 'expense', 'profit'] });

    // ========== SHEET 4: Cash Gaps ==========
    const cashGapRows = trips
      .filter(t =>
        t.tripType === 'expedition' &&
        ((t as any).clientPaymentStatus || 'not_paid') !== 'paid' &&
        ((t as any).carrierPaymentStatus === 'paid' || Number((t as any).carrierPaidAmountAmd ?? (t as any).carrierPaidAmount ?? 0) > 0)
      )
      .map(t => {
        const clientRate = Number((t as any).clientRateAmd ?? t.clientRate ?? 0);
        const clientPaid = Number((t as any).clientPaidAmountAmd ?? 0);
        const carrierPaid = Number((t as any).carrierPaidAmountAmd ?? (t as any).carrierPaidAmount ?? 0);
        return {
          date: t.tripDate,
          tripNumber: t.tripNumber,
          route: `${t.routeFrom} \u2192 ${t.routeTo}`,
          client: t.client?.name || '',
          clientRate: Math.round(clientRate),
          clientPaid: Math.round(clientPaid),
          carrierPaid: Math.round(carrierPaid),
          gap: Math.round(carrierPaid - clientPaid),
        };
      });

    createSheet(wb, '\u041a\u0430\u0441\u0441\u043e\u0432\u044b\u0435 \u0440\u0430\u0437\u0440\u044b\u0432\u044b', [
      { header: '\u0414\u0430\u0442\u0430', key: 'date', width: 14, isDate: true },
      { header: '\u2116 \u0437\u0430\u044f\u0432\u043a\u0438', key: 'tripNumber', width: 14 },
      { header: '\u041c\u0430\u0440\u0448\u0440\u0443\u0442', key: 'route', width: 30 },
      { header: '\u041a\u043b\u0438\u0435\u043d\u0442', key: 'client', width: 24 },
      { header: '\u0421\u0442\u0430\u0432\u043a\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430 \u058f', key: 'clientRate', width: 20, isNumber: true },
      { header: '\u041f\u043e\u043b\u0443\u0447\u0435\u043d\u043e \u043e\u0442 \u043a\u043b\u0438\u0435\u043d\u0442\u0430 \u058f', key: 'clientPaid', width: 22, isNumber: true },
      { header: '\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0443 \u058f', key: 'carrierPaid', width: 24, isNumber: true },
      { header: '\u0420\u0430\u0437\u0440\u044b\u0432 \u058f', key: 'gap', width: 16, isNumber: true },
    ], cashGapRows, { headerColor: 'FFDC2626', totalsColumns: ['clientRate', 'clientPaid', 'carrierPaid', 'gap'] });

    // ========== SHEET 5: Fuel (own fleet, VehicleTrip/Wialon) ==========
    const fuelRows = fuelVehicleTrips.map(vt => ({
      date: vt.departureDate,
      tripNumber: vt.tripNumber,
      vehicle: vt.vehicle.plateNumber,
      fuelLiters: vt.calculatedFuelConsumedL != null ? Math.round(vt.calculatedFuelConsumedL * 10) / 10 : null,
      per100Km: vt.wialonAvgFuelConsumptionPer100Km ?? null,
      fuelCostAmd: Math.round(Number(vt.fuelCostAmd) || 0),
    }));

    createSheet(wb, 'Топливо (свой транспорт)', [
      { header: 'Дата', key: 'date', width: 14, isDate: true },
      { header: '№ рейса', key: 'tripNumber', width: 12 },
      { header: 'Машина', key: 'vehicle', width: 16 },
      { header: 'Расход, л', key: 'fuelLiters', width: 14, isNumber: true },
      { header: 'л/100км', key: 'per100Km', width: 12, isNumber: true },
      { header: 'Стоимость ֏', key: 'fuelCostAmd', width: 16, isNumber: true },
    ], fuelRows, { headerColor: 'FFD97706', totalsColumns: ['fuelLiters', 'fuelCostAmd'] });

    const buffer = await wb.xlsx.writeBuffer();
    const fromStr = dateFrom || 'all';
    const toStr = dateTo || 'all';
    const filename = encodeURIComponent(`\u041e\u0442\u0447\u0451\u0442_${fromStr}_${toStr}.xlsx`);

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (e) {
    console.error('XLSX generation error:', e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u0438 Excel' }, { status: 500 });
  }
}
