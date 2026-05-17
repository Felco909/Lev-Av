import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { resolveDocTransportForPdf } from '@/lib/trip-doc-transport';

export type CarrierApplicationLang = 'ru' | 'hy';

export interface CarrierApplicationInput {
  lang: CarrierApplicationLang;
  tripNumber: string;
  tripDate: string;
  routeFrom: string;
  routeTo: string;
  loadDate?: string;
  loadPlace?: string;
  unloadDate?: string;
  unloadPlace?: string;
  cargoName?: string;
  cargoValue?: string;
  cargoWeight?: string;
  transportType?: string;
  vehiclePlate?: string;
  additionalConditions?: string;
  freightAmount: string;
  freightCurrency?: string;
  paymentTerms?: string;
  carrierName?: string;
  carrierInn?: string;
  carrierAddress?: string;
  carrierContact?: string;
}

const LEVAV = {
  nameRu: 'ООО «Лев Энд Ав»',
  nameHy: '«Լև Էնդ Ավ» ՍՊԸ',
  legalRu: '0046, РА, Ереван, ул.С. Таронци 3/18',
  legalHy: '0046, ՀՀ, Երևան, Ս. Տարոնցի 3/18',
  actualRu: '0046, РА, ул.Смбат Зоравара, 11/2',
  actualHy: '0046, ՀՀ, Սմբատ Զորավար 11/2',
  inn: '02248043',
  directorRu: 'А.Зограбян',
  directorHy: 'Ա. Զոգրաբյան',
  email: 'avet_avet83@mail.ru',
};

const LABELS = {
  ru: {
    legal: 'Юр. адрес',
    actual: 'Факт. адрес',
    inn: 'ИНН',
    director: 'Директор',
    email: 'Email',
    title: (n: string, d: string) => `Заявка № ${n} от ${d}`,
    route: 'Маршрут',
    load: 'Дата и место загрузки',
    unload: 'Дата и место выгрузки',
    cargo: 'Груз (наименование, стоимость, вес)',
    transport: 'Тип подвижного состава',
    plate: 'Номер авто',
    extra: 'Дополнительные условия',
    finTitle: 'Финансовые условия',
    finRoute: 'Маршрут',
    freight: 'Сумма фрахта',
    payment: 'Условия оплаты',
    customer: 'Заказчик',
    executor: 'Исполнитель',
    signature: 'Подпись',
    defaultPayment:
      'Оплата в течение 10 банковских дней после предоставления оригиналов CMR, счёта-фактуры и акта выполненных работ.',
    dash: '—',
  },
  hy: {
    legal: 'Իրավ. հասցե',
    actual: 'Փաստ. հասցե',
    inn: 'ՀՎՀՀ',
    director: 'Տնօրեն',
    email: 'Էլ. փոստ',
    title: (n: string, d: string) => `Դիմում № ${n} ${d}-ից`,
    route: 'Ուղղություն',
    load: 'Բեռնման ամսաթիվ և վայր',
    unload: 'Բարձման ամսաթիվ և վայր',
    cargo: 'Բեռ (անվանում, արժեք, քաշ)',
    transport: 'Շարժակազմի տեսակ',
    plate: 'Ավտոմեքենայի համար',
    extra: 'Լրացուցիչ պայմաններ',
    finTitle: 'Ֆինանսական պայմաններ',
    finRoute: 'Ուղղություն',
    freight: 'Ֆրախտի գումար',
    payment: 'Վճարման պայմաններ',
    customer: 'Պատվիրատու',
    executor: 'Կատարող',
    signature: 'Ստորագրություն',
    defaultPayment:
      'Վճարումը՝ 10 բանկային օրվա ընթացքում CMR բնօրինակների, հաշիվ-ապրանքագրի և աշխատանքների կատարման ակտի ներկայացումից հետո։',
    dash: '—',
  },
} as const;

function formatDateShort(d: string | Date): string {
  try {
    const dt = new Date(d);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${dt.getFullYear()}`;
  } catch {
    return '—';
  }
}

function loadFontBytes(): Uint8Array {
  const candidates = [
    path.join(process.cwd(), 'public', 'fonts', 'DejaVuSans.ttf'),
    'C:\\Windows\\Fonts\\ARIALUNI.TTF',
    'C:\\Windows\\Fonts\\arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p);
    } catch {
      /* next */
    }
  }
  throw new Error('Не найден шрифт для PDF (Arial / DejaVu). Добавьте public/fonts/DejaVuSans.ttf');
}

function wrapLines(text: string, maxChars: number): string[] {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ['—'];
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  lineHeight: number,
): number {
  const maxChars = Math.max(24, Math.floor(maxWidth / (size * 0.52)));
  const lines = wrapLines(text, maxChars);
  let cy = y;
  for (const ln of lines) {
    page.drawText(ln, { x, y: cy, size, font, color: rgb(0.1, 0.1, 0.1) });
    cy -= lineHeight;
  }
  return cy;
}

function drawTableRow(
  page: PDFPage,
  y: number,
  label: string,
  value: string,
  margin: number,
  width: number,
  font: PDFFont,
  fontBold: PDFFont,
): number {
  const labelW = 175;
  const rowH = 22;
  page.drawRectangle({
    x: margin,
    y: y - rowH,
    width,
    height: rowH,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 0.6,
  });
  page.drawLine({
    start: { x: margin + labelW, y: y },
    end: { x: margin + labelW, y: y - rowH },
    thickness: 0.6,
    color: rgb(0.75, 0.75, 0.75),
  });
  page.drawText(label, {
    x: margin + 6,
    y: y - 15,
    size: 9,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.15),
  });
  const endY = drawWrapped(page, value, margin + labelW + 6, y - 11, width - labelW - 12, font, 9, 11);
  return Math.min(y - rowH, endY) - 4;
}

export async function buildCarrierApplicationPdf(input: CarrierApplicationInput): Promise<Uint8Array> {
  const L = LABELS[input.lang];
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontBytes = loadFontBytes();
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const fontBold = font;

  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 42;
  let y = height - margin;

  const logoPath = path.join(process.cwd(), 'public', 'levav-logo.png');
  if (fs.existsSync(logoPath)) {
    const logoBytes = fs.readFileSync(logoPath);
    const logo = await pdf.embedPng(logoBytes);
    const logoW = 110;
    const logoH = (logo.height / logo.width) * logoW;
    page.drawImage(logo, { x: margin, y: y - logoH, width: logoW, height: logoH });
    y -= logoH + 8;
  }

  const reqX = width - margin - 200;
  const name = input.lang === 'hy' ? LEVAV.nameHy : LEVAV.nameRu;
  const lines = [
    name,
    `${L.legal}: ${input.lang === 'hy' ? LEVAV.legalHy : LEVAV.legalRu}`,
    `${L.actual}: ${input.lang === 'hy' ? LEVAV.actualHy : LEVAV.actualRu}`,
    `${L.inn}: ${LEVAV.inn}`,
    `${L.director}: ${input.lang === 'hy' ? LEVAV.directorHy : LEVAV.directorRu}`,
    `${L.email}: ${LEVAV.email}`,
  ];
  let ry = height - margin - 4;
  for (const ln of lines) {
    page.drawText(ln, { x: reqX, y: ry, size: 7.5, font, color: rgb(0.2, 0.2, 0.2), maxWidth: 200 });
    ry -= 11;
  }

  y = Math.min(y, ry) - 16;
  const docDate = formatDateShort(input.tripDate);
  page.drawText(L.title(input.tripNumber || '___', docDate), {
    x: margin,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0.05, 0.25, 0.55),
  });
  y -= 28;

  const route = `${input.routeFrom} → ${input.routeTo}`;
  const loadLine = [input.loadDate ? formatDateShort(input.loadDate) : docDate, input.loadPlace || input.routeFrom]
    .filter(Boolean)
    .join(', ');
  const unloadLine = [
    input.unloadDate ? formatDateShort(input.unloadDate) : L.dash,
    input.unloadPlace || input.routeTo,
  ]
    .filter(Boolean)
    .join(', ');
  const cargoParts = [input.cargoName, input.cargoValue, input.cargoWeight].filter(Boolean);
  const cargoLine = cargoParts.length ? cargoParts.join(' / ') : L.dash;
  const freightCur = input.freightCurrency || 'AMD';
  const freightLine = `${input.freightAmount} ${freightCur}`;
  const payment = input.paymentTerms?.trim() || L.defaultPayment;

  const tableW = width - margin * 2;
  y = drawTableRow(page, y, L.route, route, margin, tableW, font, fontBold);
  y = drawTableRow(page, y, L.load, loadLine, margin, tableW, font, fontBold);
  y = drawTableRow(page, y, L.unload, unloadLine, margin, tableW, font, fontBold);
  y = drawTableRow(page, y, L.cargo, cargoLine, margin, tableW, font, fontBold);
  y = drawTableRow(page, y, L.transport, input.transportType || L.dash, margin, tableW, font, fontBold);
  y = drawTableRow(page, y, L.plate, input.vehiclePlate || L.dash, margin, tableW, font, fontBold);
  y = drawTableRow(page, y, L.extra, input.additionalConditions || L.dash, margin, tableW, font, fontBold);

  y -= 8;
  page.drawText(L.finTitle, { x: margin, y, size: 11, font: fontBold, color: rgb(0.05, 0.25, 0.55) });
  y -= 18;
  y = drawTableRow(page, y, L.finRoute, route, margin, tableW, font, fontBold);
  y = drawTableRow(page, y, L.freight, freightLine, margin, tableW, font, fontBold);
  y = drawTableRow(page, y, L.payment, payment, margin, tableW, font, fontBold);

  y -= 24;
  const sigW = (tableW - 20) / 2;
  const customerName = input.lang === 'hy' ? LEVAV.nameHy : LEVAV.nameRu;
  const executorName = input.carrierName?.trim() || '________________';
  page.drawText(L.customer, { x: margin, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(L.executor, { x: margin + sigW + 20, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 14;
  page.drawText(customerName, { x: margin, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(executorName, { x: margin + sigW + 20, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
  y -= 36;
  page.drawText(`${L.signature}: __________________ / ${input.lang === 'hy' ? LEVAV.directorHy : LEVAV.directorRu}`, {
    x: margin,
    y,
    size: 9,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawText(`${L.signature}: __________________ / ${input.carrierContact || '________________'}`, {
    x: margin + sigW + 20,
    y,
    size: 9,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });

  return pdf.save();
}

export function tripToCarrierApplicationInput(
  trip: {
    tripNumber: string;
    tripDate: Date | string;
    routeFrom: string;
    routeTo: string;
    unloadDate?: Date | string | null;
    cargoWeight?: unknown;
    clientRate?: unknown;
    currency?: string | null;
    carrierCurrency?: string | null;
    notes?: string | null;
    basisText?: string | null;
    docTransportText?: string | null;
    client?: { name: string };
    vehicle?: { plateNumber: string; brand?: string; model?: string } | null;
    carrier?: {
      name: string;
      inn?: string | null;
      address?: string | null;
      contactPerson?: string | null;
    } | null;
  },
  opts: { lang: CarrierApplicationLang; freightAmount: string; freightCurrency?: string; paymentTerms?: string },
): CarrierApplicationInput {
  const transport = resolveDocTransportForPdf({}, trip) || '';
  const plate = trip.vehicle?.plateNumber || '';
  const weight =
    trip.cargoWeight != null && Number(trip.cargoWeight) > 0 ? `${Number(trip.cargoWeight)} т` : '';
  const cargoValue =
    trip.clientRate != null ? `${Number(trip.clientRate)} ${trip.currency || 'AMD'}` : '';

  return {
    lang: opts.lang,
    tripNumber: trip.tripNumber,
    tripDate: typeof trip.tripDate === 'string' ? trip.tripDate : trip.tripDate.toISOString(),
    routeFrom: trip.routeFrom,
    routeTo: trip.routeTo,
    loadDate: typeof trip.tripDate === 'string' ? trip.tripDate : trip.tripDate.toISOString(),
    loadPlace: trip.routeFrom,
    unloadDate: trip.unloadDate
      ? typeof trip.unloadDate === 'string'
        ? trip.unloadDate
        : trip.unloadDate.toISOString()
      : undefined,
    unloadPlace: trip.routeTo,
    cargoName: trip.client?.name || '',
    cargoValue,
    cargoWeight: weight,
    transportType: transport,
    vehiclePlate: plate,
    additionalConditions: trip.notes || trip.basisText || '',
    freightAmount: opts.freightAmount,
    freightCurrency: opts.freightCurrency || trip.carrierCurrency || trip.currency || 'AMD',
    paymentTerms: opts.paymentTerms,
    carrierName: trip.carrier?.name,
    carrierInn: trip.carrier?.inn || undefined,
    carrierAddress: trip.carrier?.address || undefined,
    carrierContact: trip.carrier?.contactPerson || undefined,
  };
}
