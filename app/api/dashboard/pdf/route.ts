export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

function buildHtml(data: any): string {
  const kpi = data.kpi;
  const today = new Date().toLocaleDateString('ru-RU');

  const kpiRow = (items: { label: string; value: number; color: string }[]) =>
    items.map(i => `<div class="kpi" style="border-left:4px solid ${i.color}">
      <div class="kpi-label">${i.label}</div>
      <div class="kpi-value">${fmtNum(i.value)} \u058f</div>
    </div>`).join('');

  const tableHtml = (title: string, headers: string[], rowsFn: () => string) => `
    <h2>${title}</h2>
    <table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rowsFn()}</tbody></table>`;

  const problemRowsHtml = () => (data.problemRows || []).map((r: any) =>
    `<tr class="problem"><td>${r.tripNumber}</td><td>${r.clientName}</td><td>${r.carrierName}</td>
    <td class="num">${fmtNum(r.clientPaid)}</td><td class="num">${fmtNum(r.carrierPaid)}</td>
    <td class="num bold">${fmtNum(r.diff)}</td></tr>`).join('');

  const clientDebtHtml = () => (data.clientDebts || []).map((r: any) =>
    `<tr><td>${r.tripNumber}</td><td>${r.clientName}</td>
    <td class="num">${fmtNum(r.rate)}</td><td class="num">${fmtNum(r.paid)}</td>
    <td class="num bold">${fmtNum(r.remaining)}</td></tr>`).join('');

  const carrierDebtHtml = () => (data.carrierDebts || []).map((r: any) =>
    `<tr><td>${r.tripNumber}</td><td>${r.carrierName}</td>
    <td class="num">${fmtNum(r.rate)}</td><td class="num">${fmtNum(r.paid)}</td>
    <td class="num bold">${fmtNum(r.remaining)}</td></tr>`).join('');

  const profitHtml = () => (data.profitRows || []).slice(0, 50).map((r: any) =>
    `<tr><td>${r.tripNumber}</td><td>${r.clientName}</td>
    <td class="num">${fmtNum(r.income)}</td><td class="num">${fmtNum(r.expense)}</td>
    <td class="num bold" style="color:${r.profit >= 0 ? '#16a34a' : '#dc2626'}">${fmtNum(r.profit)}</td></tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size:11px; color:#222; padding:24px; }
  h1 { font-size:18px; margin-bottom:4px; }
  .subtitle { color:#666; font-size:12px; margin-bottom:16px; }
  .kpi-row { display:flex; gap:12px; margin-bottom:20px; }
  .kpi { flex:1; padding:12px; background:#f9fafb; border-radius:8px; }
  .kpi-label { font-size:10px; color:#666; text-transform:uppercase; letter-spacing:0.5px; }
  .kpi-value { font-size:18px; font-weight:700; margin-top:4px; }
  h2 { font-size:13px; margin:16px 0 8px; padding-bottom:4px; border-bottom:1px solid #e5e7eb; }
  table { width:100%; border-collapse:collapse; margin-bottom:12px; font-size:10px; }
  th { background:#f3f4f6; padding:6px 8px; text-align:left; font-weight:600; border-bottom:2px solid #d1d5db; }
  td { padding:5px 8px; border-bottom:1px solid #e5e7eb; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .bold { font-weight:700; }
  .problem td { background:#fef2f2; }
  @page { margin:15mm; }
</style></head><body>
  <h1>\u0414\u0430\u0448\u0431\u043e\u0440\u0434 \u2014 \u0444\u0438\u043d\u0430\u043d\u0441\u043e\u0432\u044b\u0439 \u043e\u0442\u0447\u0451\u0442</h1>
  <div class="subtitle">${today}</div>
  <div class="kpi-row">
    ${kpiRow([
      { label: '\u041d\u0430\u043c \u0434\u043e\u043b\u0436\u043d\u044b', value: kpi.totalClientDebt, color: '#3b82f6' },
      { label: '\u041c\u044b \u0434\u043e\u043b\u0436\u043d\u044b', value: kpi.totalCarrierDebt, color: '#f97316' },
      { label: '\u041f\u0440\u0438\u0431\u044b\u043b\u044c', value: kpi.totalProfit, color: '#16a34a' },
      { label: '\u041a\u0430\u0441\u0441. \u0440\u0430\u0437\u0440\u044b\u0432', value: kpi.totalCashGap, color: '#dc2626' },
    ])}
  </div>
  ${(data.problemRows?.length > 0) ? tableHtml('\u041f\u0440\u043e\u0431\u043b\u0435\u043c\u043d\u044b\u0435 \u0437\u0430\u044f\u0432\u043a\u0438', ['\u0417\u0430\u044f\u0432\u043a\u0430', '\u041a\u043b\u0438\u0435\u043d\u0442', '\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a', '\u041e\u043f\u043b. \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u043c \u058f', '\u041e\u043f\u043b. \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0443 \u058f', '\u0420\u0430\u0437\u043d\u0438\u0446\u0430 \u058f'], problemRowsHtml) : ''}
  ${tableHtml('\u0414\u043e\u043b\u0433\u0438 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432', ['\u0417\u0430\u044f\u0432\u043a\u0430', '\u041a\u043b\u0438\u0435\u043d\u0442', '\u0421\u0442\u0430\u0432\u043a\u0430 \u058f', '\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e \u058f', '\u041e\u0441\u0442\u0430\u0442\u043e\u043a \u058f'], clientDebtHtml)}
  ${tableHtml('\u0414\u043e\u043b\u0433\u0438 \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0430\u043c', ['\u0417\u0430\u044f\u0432\u043a\u0430', '\u041f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a', '\u0421\u0443\u043c\u043c\u0430 \u058f', '\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e \u058f', '\u041e\u0441\u0442\u0430\u0442\u043e\u043a \u058f'], carrierDebtHtml)}
  ${tableHtml('\u041f\u0440\u0438\u0431\u044b\u043b\u044c \u043f\u043e \u0437\u0430\u044f\u0432\u043a\u0430\u043c (\u0442\u043e\u043f-50)', ['\u0417\u0430\u044f\u0432\u043a\u0430', '\u041a\u043b\u0438\u0435\u043d\u0442', '\u0414\u043e\u0445\u043e\u0434 \u058f', '\u0420\u0430\u0441\u0445\u043e\u0434 \u058f', '\u041f\u0440\u0438\u0431\u044b\u043b\u044c \u058f'], profitHtml)}
</body></html>`;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: '\u041d\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const apiUrl = `${baseUrl}/api/dashboard?${searchParams.toString()}`;
    const res = await fetch(apiUrl, { headers: { cookie: req.headers.get('cookie') || '' } });
    if (!res.ok) throw new Error('Failed to fetch dashboard data');
    const data = await res.json();

    const html = buildHtml(data);

    // Step 1: Create PDF request
    const createRes = await fetch('https://apps.abacus.ai/api/createConvertHtmlToPdfRequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        html_content: html,
        pdf_options: { format: 'A4', landscape: true, margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }, print_background: true },
      }),
    });
    if (!createRes.ok) throw new Error('PDF create failed');
    const { request_id } = await createRes.json();
    if (!request_id) throw new Error('No request_id');

    // Step 2: Poll
    let attempts = 0;
    while (attempts < 120) {
      await new Promise(r => setTimeout(r, 1000));
      const statusRes = await fetch('https://apps.abacus.ai/api/getConvertHtmlToPdfStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id, deployment_token: process.env.ABACUSAI_API_KEY }),
      });
      const statusData = await statusRes.json();
      if (statusData?.status === 'SUCCESS' && statusData?.result?.result) {
        const pdfBuffer = Buffer.from(statusData.result.result, 'base64');
        return new NextResponse(pdfBuffer as any, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="dashboard_${new Date().toISOString().slice(0, 10)}.pdf"`,
          },
        });
      } else if (statusData?.status === 'FAILED') {
        throw new Error('PDF generation failed');
      }
      attempts++;
    }
    throw new Error('PDF timeout');
  } catch (e: any) {
    console.error('Dashboard PDF error:', e);
    return NextResponse.json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u0438 PDF' }, { status: 500 });
  }
}
