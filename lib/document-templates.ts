// HTML templates for PDF document generation — matching company sample format
import { generateSumInWordsLine, formatAmountWithSpaces } from '@/lib/number-to-words';

interface TripData {
  tripNumber: string;
  tripDate: string;
  routeFrom: string;
  routeTo: string;
  tripType: string;
  clientRate: number;
  carrierRate?: number | null;
  profit: number;
  currency?: string | null;
  client: { name: string; contactPerson?: string | null; phone?: string | null; email?: string | null; inn?: string | null; address?: string | null };
  vehicle?: { plateNumber: string; brand: string; model: string } | null;
  driver?: { fullName: string; phone?: string | null } | null;
  carrier?: { name: string; contactPerson?: string | null; phone?: string | null; email?: string | null; inn?: string | null } | null;
  expenses?: { expenseType: string; amount: number; description?: string | null }[];
}

export interface CompanySettings {
  company_name?: string;
  company_inn?: string;
  company_address?: string;
  company_bank_name?: string;
  company_account?: string;
  company_swift?: string;
  company_phone?: string;
  company_bank?: string;
  company_director?: string;
  [key: string]: string | undefined;
}

const CURRENCY_SYMBOLS: Record<string, string> = { AMD: '\u058F', USD: '$', EUR: '\u20AC', RUB: '\u20BD', GEL: '\u20BE' };
const CURRENCY_NAMES: Record<string, string> = {
  RUB: '\u0440\u043E\u0441\u0441\u0438\u0439\u0441\u043A\u0438\u0445 \u0440\u0443\u0431\u043B\u0435\u0439',
  USD: '\u0434\u043E\u043B\u043B\u0430\u0440\u043E\u0432 \u0421\u0428\u0410',
  EUR: '\u0435\u0432\u0440\u043E',
  AMD: '\u0430\u0440\u043C\u044F\u043D\u0441\u043A\u0438\u0445 \u0434\u0440\u0430\u043C',
  GEL: '\u0433\u0440\u0443\u0437\u0438\u043D\u0441\u043A\u0438\u0445 \u043B\u0430\u0440\u0438',
};

function formatAmountPlain(val: number): string {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function formatCurrencyPdf(val: number, currency?: string | null): string {
  const cur = currency || 'AMD';
  const sym = CURRENCY_SYMBOLS[cur] || cur;
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(val) + ' ' + sym;
}

function formatDateShort(d: string | Date): string {
  try {
    const dt = new Date(d);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  } catch { return '\u2014'; }
}

function formatDatePdf(d: string | Date): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(d));
  } catch { return '\u2014'; }
}

function today(): string { return formatDateShort(new Date()); }

export interface DocOverrides {
  docNumber?: string;
  docDate?: string;
  serviceDescription?: string;
  amount?: number;
  clientName?: string;
  clientInn?: string;
  clientAddress?: string;
  clientContact?: string;
  notes?: string;
  contractNumber?: string;
  contractDate?: string;
  requestNumber?: string;
  requestDate?: string;
  basisText?: string;
  sumInWords?: string;
  company?: CompanySettings;
  currency?: string;
  vehicleInfo?: string;
  trailerInfo?: string;
  driverName?: string;
  ndsTax?: string;
}

/* ================= BASIS TEXT HELPER ================= */
export function generateBasisText(params: {
  docNumber?: string;
  docDate?: string;
  requestNumber?: string;
  requestDate?: string;
  contractNumber?: string;
  contractDate?: string;
}): string {
  const parts: string[] = [];

  // "Счет №... от ..."
  if (params.docNumber) {
    parts.push(`Счет №${params.docNumber} от ${params.docDate ? formatDateShort(params.docDate) : today()}`);
  }

  // "на основании заявки №... от ..."
  if (params.requestNumber) {
    let reqPart = `на основании заявки №${params.requestNumber}`;
    if (params.requestDate) reqPart += ` от ${formatDateShort(params.requestDate)}`;
    parts.push(reqPart);
  }

  // "к договору №... от ..."
  if (params.contractNumber) {
    let ctPart = `к договору №${params.contractNumber}`;
    if (params.contractDate) ctPart += ` от ${formatDateShort(params.contractDate)}`;
    parts.push(ctPart);
  }

  return parts.join(' ');
}

/* ================= STYLES ================= */
const sampleStyles = `<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000; line-height: 1.4; padding: 30px 40px; }
  .company-header { margin-bottom: 16px; }
  .company-header .name { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
  .company-header .detail { font-size: 11px; margin-bottom: 1px; }
  table.bank-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
  table.bank-table td { border: 1px solid #000; padding: 4px 8px; }
  table.bank-table td.bank-title { text-align: center; font-weight: bold; font-size: 13px; background: #f5f5f5; }
  table.bank-table td.bank-body { line-height: 1.5; }
  .doc-title { text-align: center; margin: 20px 0 16px; font-size: 13px; }
  .client-block { margin-bottom: 16px; font-size: 12px; line-height: 1.5; }
  .client-block .cl-name { font-weight: bold; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 4px; font-size: 12px; }
  table.items th, table.items td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
  table.items th { background: #f5f5f5; font-weight: bold; text-align: center; font-size: 11px; }
  table.items td.num { text-align: center; }
  table.items td.money { text-align: right; white-space: nowrap; }
  .total-text { margin-top: 16px; font-size: 12px; font-style: italic; }
  .signature-block { margin-top: 40px; }
  table.sig-table { width: 100%; margin-top: 30px; border: none; }
  table.sig-table td { border: none; padding: 0; vertical-align: bottom; width: 50%; }
  .sig-label { font-size: 11px; color: #444; margin-bottom: 4px; }
  table.sig-line { width: 100%; border-collapse: collapse; }
  table.sig-line td { border: none; border-bottom: 1px solid #000; padding-bottom: 2px; font-size: 12px; }
  table.sig-line td.sig-name { text-align: right; }
  .mp { font-size: 10px; color: #888; margin-top: 2px; }
  /* Act specific */
  .act-header { text-align: center; margin-bottom: 16px; font-size: 13px; }
  .act-subtitle { text-align: center; font-size: 11px; margin-bottom: 16px; font-style: italic; color: #333; }
  .parties { margin-bottom: 16px; font-size: 12px; line-height: 1.6; }
  .parties .party { margin-bottom: 8px; }
  .parties .party-label { font-weight: bold; }
  table.act-sig-table { width: 100%; margin-top: 30px; border: none; }
  table.act-sig-table td { border: none; padding: 0 10px; vertical-align: top; width: 50%; text-align: center; }
  .act-sig .role { font-weight: bold; font-size: 12px; margin-bottom: 4px; }
  .act-sig .company-label { font-size: 11px; margin-bottom: 20px; }
  .act-sig .sig-underline { border-bottom: 1px solid #000; margin-top: 30px; padding-bottom: 2px; font-size: 11px; }
</style>`;

/* ================= INVOICE ================= */
export function generateInvoiceHtml(trip: TripData, ov?: DocOverrides): string {
  const docNumber = ov?.docNumber || `\u0421\u0427-${trip.tripNumber}`;
  const docDate = ov?.docDate ? formatDateShort(ov.docDate) : today();
  const clientName = ov?.clientName || trip.client.name;
  const clientInn = ov?.clientInn ?? (trip.client.inn || '');
  const clientAddress = ov?.clientAddress ?? (trip.client.address || '');
  const amount = ov?.amount ?? trip.clientRate;
  const cur = ov?.currency || trip.currency || 'AMD';
  const curName = CURRENCY_NAMES[cur] || cur;
  const ndsTax = ov?.ndsTax || '\u041D\u0414\u0421 0%';
  const notes = ov?.notes || '';

  const co = ov?.company || {};
  const coName = co.company_name || '';
  const coInn = co.company_inn || '';
  const coAddr = co.company_address || '';
  const coDirector = co.company_director || '';

  // Service description
  const routeDesc = `\u0422\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u043D\u044B\u0435 \u0443\u0441\u043B\u0443\u0433\u0438 \u043F\u043E \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u0443<br/>${trip.routeFrom} \u2014 ${trip.routeTo}`;
  const serviceDesc = ov?.serviceDescription || routeDesc;

  // Vehicle/trailer/driver info
  const veh = ov?.vehicleInfo || (trip.vehicle ? `\u0422\u044F\u0433\u0430\u0447: ${trip.vehicle.brand} \u0433\u043E\u0441.\u043D\u043E\u043C. ${trip.vehicle.plateNumber}` : '');
  const trailer = ov?.trailerInfo || '';
  const driverName = ov?.driverName || (trip.driver ? `\u0412\u043E\u0434\u0438\u0442\u0435\u043B\u044C: ${trip.driver.fullName}` : '');

  // Bank details - multi-line from company_bank field
  const bankDetails = co.company_bank || '';

  // Basis text (основание) — use directly from overrides or trip
  const basisText = ov?.basisText || '';

  // Сумма прописью — use override or auto-generate
  const sumInWords = ov?.sumInWords || generateSumInWordsLine(amount, cur);

  // Doc title line — just the invoice number/date header
  const titleLine = `\u0421\u0447\u0435\u0442 \u2116${docNumber} \u043E\u0442 ${docDate}`;

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">${sampleStyles}</head><body>

  <div class="company-header">
    ${coName ? `<div class="name">${coName}</div>` : ''}
    ${coInn ? `<div class="detail">\u0418\u041D\u041D: ${coInn}</div>` : ''}
    ${coAddr ? `<div class="detail">\u0410\u0434\u0440\u0435\u0441: ${coAddr}</div>` : ''}
  </div>

  ${bankDetails ? `<table class="bank-table" width="100%" border="1" cellpadding="6" cellspacing="0">
    <tr><td class="bank-title" bgcolor="#f5f5f5">\u0411\u0430\u043D\u043A\u043E\u0432\u0441\u043A\u0438\u0435 \u0440\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B</td></tr>
    <tr><td class="bank-body">${bankDetails.replace(/\n/g, '<br/>')}</td></tr>
  </table>` : ''}

  <div class="doc-title"><strong>${titleLine}</strong></div>
  ${basisText ? `<div style="text-align:center; font-size:12px; margin-bottom:14px; font-style:italic;">${basisText}</div>` : ''}

  <div class="client-block">
    <div class="cl-name">${clientName}</div>
    ${clientAddress ? `<div>\u042E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0430\u0434\u0440\u0435\u0441: ${clientAddress}</div>` : ''}
    ${clientInn ? `<div>\u0418\u041D\u041D/\u041A\u041F\u041F: ${clientInn}</div>` : ''}
  </div>

  <table class="items" width="100%" border="1" cellpadding="4" cellspacing="0">
    <thead>
      <tr>
        <th style="width:30px" bgcolor="#f5f5f5">\u2116</th>
        <th bgcolor="#f5f5f5">\u041D\u0430\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u0442\u043E\u0432\u0430\u0440\u0430</th>
        <th style="width:60px" bgcolor="#f5f5f5">\u0415\u0434\u0438\u043D\u0438\u0446\u0430 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F</th>
        <th style="width:70px" bgcolor="#f5f5f5">\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E</th>
        <th style="width:80px" bgcolor="#f5f5f5">\u0426\u0435\u043D\u0430</th>
        <th style="width:100px" bgcolor="#f5f5f5">\u0421\u0443\u043C\u043C\u0430</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="num">1</td>
        <td>${serviceDesc}</td>
        <td class="num">\u0410\u0432/\u043F\u0440</td>
        <td class="num">1</td>
        <td class="money">${formatAmountPlain(amount)}</td>
        <td class="money">${formatAmountPlain(amount)}<br/><small>${ndsTax}</small></td>
      </tr>
      ${veh || trailer || driverName ? `<tr>
        <td></td>
        <td colspan="4" style="font-size:11px;">
          ${veh ? `${veh}<br/>` : ''}
          ${trailer ? `${trailer}<br/>` : ''}
          ${driverName ? `${driverName}` : ''}
        </td>
        <td class="money">${formatAmountPlain(amount)}</td>
      </tr>` : ''}
      <tr>
        <td colspan="5" style="text-align:center; font-weight:bold;">\u0418\u0442\u043E\u0433\u043E</td>
        <td class="money" style="font-weight:bold;">${formatAmountPlain(amount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="total-text">
    ${sumInWords}
  </div>

  ${notes ? `<div style="margin-top:12px; font-size:11px; color:#333;">${notes}</div>` : ''}

  <div class="signature-block">
    <table class="sig-table" width="100%">
      <tr><td>
        <div class="sig-label">\u0414\u0438\u0440\u0435\u043A\u0442\u043E\u0440:</div>
        <table class="sig-line" width="50%"><tr><td>__________________</td><td class="sig-name">${coDirector || ''}</td></tr></table>
        <div class="mp">\u041C.\u041F.</div>
      </td></tr>
    </table>
  </div>

</body></html>`;
}

/* ================= ACT ================= */
export function generateActHtml(trip: TripData, ov?: DocOverrides): string {
  const docNumber = ov?.docNumber || `\u0410\u041A\u0422-${trip.tripNumber}`;
  const docDate = ov?.docDate ? formatDateShort(ov.docDate) : today();
  const clientName = ov?.clientName || trip.client.name;
  const clientInn = ov?.clientInn ?? (trip.client.inn || '');
  const clientAddress = ov?.clientAddress ?? (trip.client.address || '');
  const amount = ov?.amount ?? trip.clientRate;
  const cur = ov?.currency || trip.currency || 'AMD';
  const curName = CURRENCY_NAMES[cur] || cur;
  const co = ov?.company || {};
  const coName = co.company_name || '';
  const coInn = co.company_inn || '';
  const coAddr = co.company_address || '';
  const coDirector = co.company_director || '';

  const routeDesc = `\u0422\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u043D\u044B\u0435 \u0443\u0441\u043B\u0443\u0433\u0438 \u043F\u043E \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u0443<br/>${trip.routeFrom} \u2014 ${trip.routeTo}`;
  const serviceDesc = ov?.serviceDescription || routeDesc;
  const veh = ov?.vehicleInfo || (trip.vehicle ? `\u0422\u044F\u0433\u0430\u0447: ${trip.vehicle.brand} \u0433\u043E\u0441.\u043D\u043E\u043C. ${trip.vehicle.plateNumber}` : '');
  const trailer = ov?.trailerInfo || '';
  const driverName = ov?.driverName || (trip.driver ? `\u0412\u043E\u0434\u0438\u0442\u0435\u043B\u044C: ${trip.driver.fullName}` : '');

  // Basis text (основание) — use directly from overrides or trip
  const basisText = ov?.basisText || '';

  // Сумма прописью — use override or auto-generate
  const sumInWords = ov?.sumInWords || generateSumInWordsLine(amount, cur);

  // Title line — just act number/date
  const titleLine = `\u0410\u041A\u0422 \u2116${docNumber} \u043E\u0442 ${docDate}`;

  // Subtitle — use basisText or trip number
  const subtitle = `\u041E\u0431 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0438 \u043E\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0445 \u0443\u0441\u043B\u0443\u0433 \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u043D\u044B\u0445 \u0433\u0440\u0443\u0437\u043E\u043F\u0435\u0440\u0435\u0432\u043E\u0437\u043E\u043A${basisText ? ` \u0441\u043E\u0433\u043B\u0430\u0441\u043D\u043E ${basisText}` : ''}`;

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">${sampleStyles}</head><body>

  <div class="act-header"><strong>${titleLine}</strong></div>
  ${basisText ? `<div style="text-align:center; font-size:12px; margin-bottom:10px; font-style:italic;">${basisText}</div>` : ''}
  <div class="act-subtitle">${subtitle}</div>

  <div class="parties">
    <div class="party">
      <span class="party-label">\u041F\u0435\u0440\u0435\u0432\u043E\u0437\u0447\u0438\u043A:</span>
      ${coName ? `<strong>${coName}</strong>` : ''}
      ${coAddr ? `<br/>\u042E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0430\u0434\u0440\u0435\u0441: ${coAddr}` : ''}
      ${coInn ? `, \u0418\u041D\u041D ${coInn}` : ''}
    </div>
    <div class="party">
      <span class="party-label">\u0417\u0430\u043A\u0430\u0437\u0447\u0438\u043A:</span>
      <strong>${clientName}</strong>
      ${clientAddress ? `<br/>\u042E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0430\u0434\u0440\u0435\u0441: ${clientAddress}` : ''}
      ${clientInn ? `<br/>\u0418\u041D\u041D/\u041A\u041F\u041F: ${clientInn}` : ''}
    </div>
  </div>

  <table class="items" width="100%" border="1" cellpadding="4" cellspacing="0">
    <thead>
      <tr>
        <th style="width:30px" bgcolor="#f5f5f5">\u2116</th>
        <th bgcolor="#f5f5f5">\u041D\u0430\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u0440\u0430\u0431\u043E\u0442, \u0443\u0441\u043B\u0443\u0433,<br/>\u0438\u043C\u0443\u0449\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0433\u043E \u043F\u0440\u0430\u0432\u0430</th>
        <th style="width:60px" bgcolor="#f5f5f5">\u0415\u0434\u0438\u043D\u0438\u0446\u0430 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F</th>
        <th style="width:70px" bgcolor="#f5f5f5">\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E<br/>(\u043E\u0431\u044A\u0435\u043C)</th>
        <th style="width:100px" bgcolor="#f5f5f5">\u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C \u0443\u0441\u043B\u0443\u0433</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="num">1</td>
        <td>${serviceDesc}</td>
        <td class="num">\u0410\u0432/\u043F\u0440</td>
        <td class="num">1</td>
        <td class="money">${formatAmountPlain(amount)}</td>
      </tr>
      ${veh || trailer || driverName ? `<tr>
        <td></td>
        <td colspan="3" style="font-size:11px;">
          ${veh ? `${veh}<br/>` : ''}
          ${trailer ? `${trailer}<br/>` : ''}
          ${driverName ? `${driverName}` : ''}
        </td>
        <td class="money"></td>
      </tr>` : ''}
      <tr>
        <td colspan="4" style="text-align:center; font-weight:bold;">\u0418\u0442\u043E\u0433\u043E</td>
        <td class="money" style="font-weight:bold;">${formatAmountPlain(amount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="total-text">
    ${sumInWords}
  </div>

  <table class="act-sig-table" width="100%">
    <tr>
      <td class="act-sig">
        <div class="role">\u0417\u0430\u043A\u0430\u0437\u0447\u0438\u043A</div>
        <div class="company-label">${clientName}</div>
        <div class="sig-underline">__________________ / __________________</div>
        <div class="mp">\u041C.\u041F.</div>
      </td>
      <td class="act-sig">
        <div class="role">\u041F\u0435\u0440\u0435\u0432\u043E\u0437\u0447\u0438\u043A</div>
        <div class="company-label">${coName}</div>
        <div class="sig-underline">__________________ / ${coDirector || '__________________'}</div>
        <div class="mp">\u041C.\u041F.</div>
      </td>
    </tr>
  </table>

</body></html>`;
}

/* ================= CARRIER REQUEST (unchanged style) ================= */
const baseStyles = `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 13px; color: #1a1a2e; line-height: 1.5; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #2563eb; }
    .logo-area h1 { font-size: 22px; font-weight: 700; color: #2563eb; margin-bottom: 4px; }
    .logo-area p { font-size: 11px; color: #64748b; }
    .doc-info { text-align: right; }
    .doc-info .doc-number { font-size: 16px; font-weight: 700; color: #1e293b; }
    .doc-info .doc-date { font-size: 12px; color: #64748b; margin-top: 4px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 13px; font-weight: 700; color: #2563eb; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
    .info-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .info-row .label { color: #64748b; font-size: 12px; }
    .info-row .value { font-weight: 600; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; padding: 10px 12px; text-align: left; border-bottom: 2px solid #e2e8f0; }
    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    .total-row td { font-weight: 700; font-size: 14px; border-top: 2px solid #e2e8f0; }
    .highlight { color: #2563eb; font-weight: 700; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
    .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
    .sig-block { width: 45%; }
    .sig-block .sig-title { font-size: 11px; color: #64748b; margin-bottom: 30px; }
    .sig-line { border-top: 1px solid #1a1a2e; padding-top: 4px; font-size: 12px; }
    .route-block { display: flex; align-items: center; gap: 12px; padding: 12px; background: #f8fafc; border-radius: 6px; margin-top: 8px; }
    .route-point { flex: 1; text-align: center; padding: 8px; background: white; border-radius: 4px; border: 1px solid #e2e8f0; }
    .route-point .city { font-weight: 700; font-size: 14px; }
    .route-point .label { font-size: 10px; color: #64748b; text-transform: uppercase; }
    .route-arrow { font-size: 20px; color: #2563eb; font-weight: 700; }
  </style>
`;

export function generateCarrierRequestHtml(trip: TripData): string {
  if (!trip.carrier) return '<p>\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u043E \u043F\u0435\u0440\u0435\u0432\u043E\u0437\u0447\u0438\u043A\u0435</p>';
  const docNumber = `\u0417\u0412\u041A-${trip.tripNumber}`;

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">${baseStyles}</head><body>
    <div class="header">
      <div class="logo-area">
        <h1>\u0417\u0410\u042F\u0412\u041A\u0410 \u041F\u0415\u0420\u0415\u0412\u041E\u0417\u0427\u0418\u041A\u0423</h1>
        <p>\u041D\u0430 \u043E\u043A\u0430\u0437\u0430\u043D\u0438\u0435 \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u043D\u044B\u0445 \u0443\u0441\u043B\u0443\u0433</p>
      </div>
      <div class="doc-info">
        <div class="doc-number">${docNumber}</div>
        <div class="doc-date">\u043E\u0442 ${formatDateShort(new Date())}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">\u041F\u0435\u0440\u0435\u0432\u043E\u0437\u0447\u0438\u043A</div>
      <div class="info-grid">
        <div class="info-row"><span class="label">\u041D\u0430\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D\u0438\u0435</span><span class="value">${trip.carrier.name}</span></div>
        <div class="info-row"><span class="label">\u0418\u041D\u041D</span><span class="value">${trip.carrier.inn || '\u2014'}</span></div>
        <div class="info-row"><span class="label">\u041A\u043E\u043D\u0442\u0430\u043A\u0442</span><span class="value">${trip.carrier.contactPerson || '\u2014'}</span></div>
        <div class="info-row"><span class="label">\u0422\u0435\u043B\u0435\u0444\u043E\u043D</span><span class="value">${trip.carrier.phone || '\u2014'}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">\u041C\u0430\u0440\u0448\u0440\u0443\u0442</div>
      <div class="route-block">
        <div class="route-point"><div class="label">\u041E\u0442\u043A\u0443\u0434\u0430</div><div class="city">${trip.routeFrom}</div></div>
        <div class="route-arrow">\u2192</div>
        <div class="route-point"><div class="label">\u041A\u0443\u0434\u0430</div><div class="city">${trip.routeTo}</div></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">\u0423\u0441\u043B\u043E\u0432\u0438\u044F \u043F\u0435\u0440\u0435\u0432\u043E\u0437\u043A\u0438</div>
      <table>
        <thead><tr><th>\u041F\u0430\u0440\u0430\u043C\u0435\u0442\u0440</th><th>\u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435</th></tr></thead>
        <tbody>
          <tr><td>\u0414\u0430\u0442\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438</td><td><strong>${formatDatePdf(trip.tripDate)}</strong></td></tr>
          <tr><td>\u041C\u0430\u0440\u0448\u0440\u0443\u0442</td><td><strong>${trip.routeFrom} \u2192 ${trip.routeTo}</strong></td></tr>
          <tr><td>\u041A\u043B\u0438\u0435\u043D\u0442 (\u0433\u0440\u0443\u0437\u043E\u0432\u043B\u0430\u0434\u0435\u043B\u0435\u0446)</td><td><strong>${trip.client.name}</strong></td></tr>
          <tr class="total-row"><td>\u0421\u0442\u0430\u0432\u043A\u0430 \u043F\u0435\u0440\u0435\u0432\u043E\u0437\u0447\u0438\u043A\u0430</td><td class="highlight">${formatCurrencyPdf(trip.carrierRate || 0)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="footer">
      <div class="signatures">
        <div class="sig-block">
          <div class="sig-title">\u0417\u0430\u043A\u0430\u0437\u0447\u0438\u043A</div>
          <div class="sig-line">__________________ / \u0424\u0418\u041E</div>
        </div>
        <div class="sig-block">
          <div class="sig-title">\u041F\u0435\u0440\u0435\u0432\u043E\u0437\u0447\u0438\u043A</div>
          <div class="sig-line">__________________ / ${trip.carrier.contactPerson || '\u0424\u0418\u041E'}</div>
        </div>
      </div>
    </div>
  </body></html>`;
}