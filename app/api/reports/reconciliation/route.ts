import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { convertHtmlToPdf } from '@/lib/pdf-convert';
import { computeClientDueAmd } from '@/lib/finance/formulas';
import { buildContentDisposition } from '@/lib/content-disposition';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get('clientId');
  const dateFrom = req.nextUrl.searchParams.get('dateFrom');
  const dateTo = req.nextUrl.searchParams.get('dateTo');

  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  // Отменённая заявка (Этап 4 аудита) — не в акт сверки, сделка не состоялась.
  const where: any = { clientId, NOT: { status: 'cancelled' } };
  if (dateFrom || dateTo) {
    where.tripDate = {};
    if (dateFrom) where.tripDate.gte = new Date(dateFrom);
    if (dateTo) where.tripDate.lte = new Date(dateTo);
  }

  const trips = await prisma.trip.findMany({
    where,
    orderBy: { tripDate: 'asc' },
    include: { expenses: true },
  });

  let totalIncome = 0;
  let totalPaid = 0;
  // \u0415\u0434\u0438\u043d\u044b\u0439 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a \u0434\u0430\u043d\u043d\u044b\u0445 (\u0441\u043c. \u0430\u0443\u0434\u0438\u0442, \u043f.3): \u00ab\u041d\u0430\u0447\u0438\u0441\u043b\u0435\u043d\u043e\u00bb \u2014 \u0442\u0430 \u0436\u0435 computeClientDueAmd()
  // (\u0441\u0442\u0430\u0432\u043a\u0430 + \u043f\u0435\u0440\u0435\u0432\u044b\u0441\u0442\u0430\u0432\u043b\u044f\u0435\u043c\u044b\u0435 \u043a\u043b\u0438\u0435\u043d\u0442\u0443 \u0440\u0430\u0441\u0445\u043e\u0434\u044b), \u0447\u0442\u043e \u0438 \u0432 lib/finance/debts-service.ts \u0438
  // Excel-\u044d\u043a\u0441\u043f\u043e\u0440\u0442\u0435 /api/reports/trips/xlsx. \u00ab\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e\u00bb \u2014 \u0434\u0435\u043d\u043e\u0440\u043c\u0430\u043b\u0438\u0437\u043e\u0432\u0430\u043d\u043d\u043e\u0435 \u043f\u043e\u043b\u0435
  // clientPaidAmountAmd (\u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043b\u0430\u0442\u0435\u0436\u0438 \u043a\u043b\u0438\u0435\u043d\u0442\u0430), \u0430 \u043d\u0435 \u0441\u044b\u0440\u0430\u044f \u0441\u0443\u043c\u043c\u0430 Payment \u2014 \u0442\u0430\u043c \u0434\u043b\u044f
  // \u0440\u0435\u0439\u0441\u043e\u0432-\u044d\u043a\u0441\u043f\u0435\u0434\u0438\u0446\u0438\u0439 \u043c\u043e\u0433\u0443\u0442 \u0431\u044b\u0442\u044c \u0438 \u043f\u043b\u0430\u0442\u0435\u0436\u0438 \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a\u0443 \u043f\u043e \u044d\u0442\u043e\u0439 \u0436\u0435 \u0437\u0430\u044f\u0432\u043a\u0435. \u042d\u0442\u043e \u0434\u0435\u043b\u0430\u0435\u0442 \u0410\u043a\u0442
  // \u0441\u0432\u0435\u0440\u043a\u0438 \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043d\u044b\u043c \u0441 \u0440\u0430\u0437\u0434\u0435\u043b\u043e\u043c \u00ab\u0414\u043e\u043b\u0433\u0438\u00bb, Dashboard \u0438 Excel-\u044d\u043a\u0441\u043f\u043e\u0440\u0442\u043e\u043c \u0437\u0430 \u0442\u043e\u0442 \u0436\u0435 \u043f\u0435\u0440\u0438\u043e\u0434.
  const rows = trips.map((t: any) => {
    const rate = computeClientDueAmd(Number(t.clientRateAmd ?? t.clientRate ?? 0), t.expenses ?? []);
    const paid = Number(t.clientPaidAmountAmd ?? 0);
    totalIncome += rate;
    totalPaid += paid;
    return {
      tripNumber: t.tripNumber,
      tripDate: t.tripDate ? new Date(t.tripDate).toLocaleDateString('ru-RU') : '',
      route: `${t.routeFrom} \u2014 ${t.routeTo}`,
      amount: rate,
      paid,
      balance: rate - paid,
    };
  });

  const today = new Date().toLocaleDateString('ru-RU');
  const periodStr = dateFrom && dateTo
    ? `${new Date(dateFrom).toLocaleDateString('ru-RU')} \u2014 ${new Date(dateTo).toLocaleDateString('ru-RU')}`
    : '\u0412\u0435\u0441\u044C \u043F\u0435\u0440\u0438\u043E\u0434';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#222;margin:40px;}
    h1{font-size:18px;text-align:center;margin-bottom:4px;}
    .sub{text-align:center;color:#555;margin-bottom:20px;font-size:11px;}
    table{width:100%;border-collapse:collapse;margin-bottom:20px;}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:11px;}
    th{background:#f5f5f5;font-weight:600;}
    .num{text-align:right;font-family:monospace;}
    .total-row td{font-weight:700;background:#f9f9f9;}
    .footer{margin-top:40px;display:flex;justify-content:space-between;}
    .sign-block{width:45%;}
    .sign-line{border-bottom:1px solid #333;height:30px;margin-top:20px;}
  </style></head><body>
    <h1>\u0410\u043A\u0442 \u0441\u0432\u0435\u0440\u043A\u0438</h1>
    <p class="sub">\u041A\u043B\u0438\u0435\u043D\u0442: <strong>${client.name}</strong> | \u041F\u0435\u0440\u0438\u043E\u0434: ${periodStr} | \u0414\u0430\u0442\u0430: ${today}</p>
    <table>
      <thead><tr><th>\u2116</th><th>\u0420\u0435\u0439\u0441</th><th>\u0414\u0430\u0442\u0430</th><th>\u041C\u0430\u0440\u0448\u0440\u0443\u0442</th><th class="num">\u041D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u043E (\u058F)</th><th class="num">\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E (\u058F)</th><th class="num">\u0421\u0430\u043B\u044C\u0434\u043E (\u058F)</th></tr></thead>
      <tbody>
        ${rows.map((r: any, i: number) => `<tr><td>${i + 1}</td><td>${r.tripNumber}</td><td>${r.tripDate}</td><td>${r.route}</td><td class="num">${r.amount.toLocaleString('ru-RU')}</td><td class="num">${r.paid.toLocaleString('ru-RU')}</td><td class="num">${r.balance.toLocaleString('ru-RU')}</td></tr>`).join('')}
        <tr class="total-row"><td colspan="4">\u0418\u0442\u043E\u0433\u043E</td><td class="num">${totalIncome.toLocaleString('ru-RU')}</td><td class="num">${totalPaid.toLocaleString('ru-RU')}</td><td class="num">${(totalIncome - totalPaid).toLocaleString('ru-RU')}</td></tr>
      </tbody>
    </table>
    <div class="footer"><div class="sign-block"><p>\u041E\u0442 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438:</p><div class="sign-line"></div><p style="font-size:10px;color:#888;">\u041F\u043E\u0434\u043F\u0438\u0441\u044C / \u043F\u0435\u0447\u0430\u0442\u044C</p></div><div class="sign-block"><p>\u041E\u0442 \u043A\u043B\u0438\u0435\u043D\u0442\u0430 (${client.name}):</p><div class="sign-line"></div><p style="font-size:10px;color:#888;">\u041F\u043E\u0434\u043F\u0438\u0441\u044C / \u043F\u0435\u0447\u0430\u0442\u044C</p></div></div>
  </body></html>`;

  // Render locally via LibreOffice headless (no external/paid service — see lib/pdf-convert.ts).
  try {
    const pdfBuf = await convertHtmlToPdf(html);
    // Имя клиента почти всегда кириллица/армянский — единый механизм имени файла
    // (lib/content-disposition.ts, аудит п.5), а не свой инлайн-вариант.
    return new NextResponse(pdfBuf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': buildContentDisposition('attachment', `reconciliation_${client.name}_${today}.pdf`),
      },
    });
  } catch (err) {
    console.error('Reconciliation PDF error:', err);
    return NextResponse.json({ error: 'Ошибка генерации PDF' }, { status: 500 });
  }
}
