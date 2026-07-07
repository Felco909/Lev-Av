import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, TabStopType, TabStopPosition,
  HeadingLevel, ImageRun, VerticalAlign,
} from 'docx';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

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
  // Fields for carrier request document
  unloadDate?: string | null;
  contractNumber?: string | null;
  contractDate?: string | null;
  requestNumber?: string | null;
  customsDeparture?: string | null;
  customsDestination?: string | null;
  cargoName?: string | null;
  cargoWeight?: number | null;
  cargoValue?: number | null;
  truckType?: string | null;
  loadingAddress?: string | null;
  unloadingAddress?: string | null;
  trailerPlate?: string | null;
  additionalTerms?: string | null;
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
  freightText?: string;
  notes?: string;
  contractNumber?: string;
  contractDate?: string;
  requestNumber?: string;
  basisText?: string;
  sumInWords?: string;
}

function fmtDate(d: string | Date, locale = 'ru-RU'): string {
  try { return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(d)); }
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

export interface OrderForCarrierRequest {
  order_number: string;
  order_date: string;           // "26.06.2026"  DD.MM.YYYY
  contract_number?: string;
  contract_date?: string;
  carrier: {
    company_name: string;
    truck_plate?: string;
    trailer_plate?: string;
    truck_type?: string;
  };
  route: {
    from_country: string;
    to_country: string;
    from_address: string;
    to_address: string;
    loading_date: string;
    unloading_date: string;
    customs_departure?: string;
    customs_destination?: string;
  };
  cargo: {
    name: string;
    value?: string;
    weight_tn: string;
  };
  additional_terms?: string;
  price: number;
  currency: 'RUB' | 'AMD' | 'USD' | 'EUR';
  all_in?: boolean;
  payment_days: number;
}

// ---------------------------------------------------------------------------
// Carrier Request — bilingual RU + AM document
// ---------------------------------------------------------------------------

const CR_COMPANY_RU = {
  name: 'ООО «Лев Энд Ав»',
  address: '0046 РА, г. Ереван, ул. С. Таронци 3/18',
  inn: 'ИНН: 02248043',
  email: 'avet_avet83@mail.ru',
  phone: 'тел.: +37499902007 (Саргис)',
};
const CR_COMPANY_AM = {
  name: '«ԼԵՎ ԵՎ ԱՎ» ՍՊԸ',
  address: 'Հասցե: ՀՀ, ք. Երևան, Ս. Տարոնցի 3/18, 0046',
  inn: 'ՀՎՀՀ: 02248043',
  email: 'Էլ. հասցե: avet_avet83@mail.ru',
  phone: 'Հեռ.: +37499902007 (Սարգիս)',
};

const CR_LOGO_PATH = require('path').join(process.cwd(), 'public', 'levav-logo.png');
const CR_LOGO_W = 70;
const CR_LOGO_H = 70;

function crVal(v: string | undefined | null): string {
  return v != null && v !== '' ? v : '—';
}

function ruCalendarDaysPhrase(n: number): string {
  const n100 = n % 100;
  const n10 = n % 10;
  if (n100 >= 11 && n100 <= 14) return `${n} календарных дней`;
  if (n10 === 1) return `${n} календарный день`;
  if (n10 >= 2 && n10 <= 4) return `${n} календарных дня`;
  return `${n} календарных дней`;
}

interface CrLabel { ru: string; am: string }

const CR_T = {
  requestTitle: {
    ru: (n: string, d: string) => `Заявка № ${n} от ${d}`,
    am: (n: string, d: string) => `Հայտ № ${n}, ${d} թ.`,
  },
  // NOTE: not covered by the proofread reference text supplied for this fix —
  // corrected for grammar only, still needs native-speaker sign-off.
  toContract: {
    ru: (n: string, d: string) => `к договору № ${n}${d ? ' от ' + d : ''}`,
    am: (n: string, d: string) => `Հավելված № ${n} պայմանագրին${d ? ', ' + d + ' թ.' : ''}`,
  },
  toCarrier: {
    ru: (name: string) => `Уважаемые господа, ${name}!`,
    am: (name: string) => `Հարգելի՛ պարոն ${name},`,
  },
  intro: {
    ru: 'Согласно предварительной договорённости, просим Вас обеспечить выполнение перевозки груза на следующих условиях:',
    am: 'Համաձայն նախնական պայմանագրի՝ խնդրում ենք ապահովել բեռնափոխադրումը հետևյալ պայմաններով.',
  },
  route:     { ru: 'Маршрут',                               am: 'Երթուղի' },
  loading:   { ru: 'Дата и место загрузки',                  am: 'Բեռնման ամսաթիվ և վայր' },
  cusDep:    { ru: 'Таможня отправления',                    am: 'Մեկնման մաքսատուն' },
  cusDest:   { ru: 'Таможня назначения',                     am: 'Նշանակման մաքսատուն' },
  unloading: { ru: 'Дата и место выгрузки',                  am: 'Բեռնաթափման ամսաթիվ և վայր' },
  cargo:     { ru: 'Груз (наименование, стоимость, вес)',    am: 'Բեռ (անվանում, արժեք, քաշ)' },
  truckT:    { ru: 'Тип подвижного состава',                 am: 'Փոխադրամիջոցի տեսակ' },
  truckN:    { ru: 'Номер авто',                             am: 'Ավտոմեքենայի համարանիշ' },
  // NOTE: not covered by the proofread reference text — grammar-fixed only.
  addl:      { ru: 'Дополнительные условия',                 am: 'Լրացուցիչ պայմաններ' },
  condTitle: { ru: 'Условия транспортного заказа:',          am: 'Փոխադրման հայտի պայմաններ' },
  freight:   { ru: 'Сумма фрахта',                          am: 'Փոխադրման գումար' },
  payTerms:  { ru: 'Условия оплаты',                        am: 'Վճարման պայմաններ' },
  payText: {
    ru: (days: number) => `${ruCalendarDaysPhrase(days)} после получения нами копии счёта-фактуры, акта выполненных работ и CMR.`,
    am: (days: number) => `${days} բանկային օրվա ընթացքում՝ CMR-ի, ակտի և հաշիվ-ապրանքագրի բնօրինակները ստանալուց հետո:`,
  },
  customer:   { ru: 'Заказчик:',   am: 'Պատվիրատու:' },
  contractor: { ru: 'Исполнитель:', am: 'Կատարող:' },
  position:   { ru: 'Должность:',  am: 'Պաշտոն՝' },
  fio:        { ru: 'ФИО:',        am: 'Ա.Ա.Հ.՝' },
  sig:        { ru: 'Подпись: ___________________', am: 'Ստորագրություն՝ ___________________' },
  directorTitle: { ru: 'Директор', am: 'Տնօրեն' },
  financeTitle: 'Ֆինանսական պայմաններ',
  sigSectionTitle: 'Կողմերի վավերապայմաններ և ստորագրություններ',
};

const CR_CONDITIONS = [
  'Перевозка осуществляется согласно Конвенции МДП и КДПГ, а также Договору и настоящей заявке. Принятие заявки подтверждает, что автопоезд: 1) находится в чистом состоянии; 2) технически исправен; 3) имеет действующее CMR страхование; 4) имеет все разрешения и визы.',
  'Ставка строго конфиденциальна. Прямой выход на заказчика категорически воспрещён. Несоблюдение данного условия квалифицируется как нарушение договорных обязательств.',
  'Использование субперевозчика, а также перегруз без согласования запрещены. Нарушение влечёт штраф 100 USD.',
  'Водитель обязан следить за правильностью погрузки и креплением груза.',
  'Штраф за перегруз на ось не оплачивается Заказчиком; нагрузку на ось контролирует Водитель.',
  'Водитель обязан останавливаться на охраняемых стоянках.',
  'В случае возникновения проблем любого рода — незамедлительно информировать Заказчика.',
  'За сверхнормативный простой при наличии подтверждающей карты — 50 USD за каждые полные 24 часа на территории СНГ. Выходные не учитываются. За срыв загрузки — 100 USD.',
  'В случае опоздания на погрузку/разгрузку более чем на 2 часа — штраф 50 USD за каждые начавшиеся сутки.',
  'Исполнитель обязан выслать подтверждение с печатью и подписью. Если в течение 3 часов отказ не поступил — заявка считается принятой.',
  'Номера автомобиля предоставляются не позднее 24 часов до загрузки.',
  'Исполнитель обязан выслать копии документов (Счёт, Акт, CMR) в течение 15 дней с момента выгрузки. Оригиналы — в течение 20 дней.',
  'Оригиналы направлять по адресу: 0046 РА, г. Ереван, ул. С. Таронци 3/18, ООО «Лев Энд Ав».',
];

const CR_CONDITIONS_AM = [
  'Փոխադրումն իրականացվում է TIR և CMR կոնվենցիաների, Պայմանագրի և սույն Հայտի համաձայն: Հայտի ընդունման հաստատմամբ երաշխավորվում է, որ ավտոբեռնատարը՝\n' +
    '   - գտնվում է մաքուր վիճակում,\n' +
    '   - տեխնիկապես սարքին է,\n' +
    '   - ունի գործող CMR ապահովագրություն,\n' +
    '   - ունի բոլոր անհրաժեշտ թույլտվություններն ու վիզաները:',
  'Սակագինը խստորեն գաղտնի է: Կատարողի կողմից ուղարկողի հետ առանձին կապ հաստատելն արգելվում է: Բեռնափոխադրման ուշացման դեպքում պատասխանատվությունը կրում է Կատարողը՝ վճարման պայմանագրի համաձայն:',
  'Ենթակապալառու փոխադրողի ներգրավումը, ինչպես նաև առանց համաձայնեցման բեռի վերաբեռնումն արգելվում է: Խախտման դեպքում սահմանվում է տուգանք՝ 100 USD:',
  'Վարորդը պարտավոր է հետևել բեռի բարձման կարգին և ամրացմանը:',
  'Առանցքի վրա գերբեռնվածության համար Պատվիրատուի կողմից վճարում չի կատարվում: Վարորդը պարտավոր է վերահսկել առանցքների ծանրաբեռնվածությունը:',
  'Վարորդը պարտավոր է կանգառներ կատարել միայն հսկվող/պահպանվող ավտոկանգառներում:',
  'Ցանկացած խնդրի առաջացման դեպքում անմիջապես տեղեկացնել Պատվիրատուին:',
  'Գերնորմատիվային պարապուրդի համար (պարապուրդի թերթիկի առկայության դեպքում), յուրաքանչյուր 24 ժամվա համար վճարվում է 50 USD՝ ԱՊՀ տարածքում: Շաբաթ և կիրակի օրերը չեն հաշվարկվում: Բեռնումից հրաժարվելու (չեղարկման) դեպքում տուգանքը կազմում է 100 USD:',
  'Բեռնման/բեռնաթափման վայրեր 2 ժամից ավելի ուշանալու դեպքում սահմանվում է տուգանք՝ 50 USD՝ յուրաքանչյուր սկսված օրվա համար:',
  'Կատարողը պարտավոր է ուղարկել հայտի հաստատումը՝ կնիքով և ստորագրությամբ: Եթե 3 ժամվա ընթացքում մերժում չի ստացվում, հայտը համարվում է ընդունված:',
  'Ավտոմեքենայի համարանիշները տրամադրվում են բեռնումից ոչ ուշ, քան 24 ժամ առաջ:',
  'Կատարողը պարտավոր է ուղարկել փաստաթղթերի պատճենները (Հաշիվ, Ակտ, CMR) բեռնաթափումից հետո 15 օրվա ընթացքում, իսկ բնօրինակները՝ 20 օրվա ընթացքում:',
  'Փաստաթղթերի բնօրինակներն ուղարկել հետևյալ հասցեով՝ 0046, ՀՀ, ք. Երևան, Ս. Տարոնցի 3/18, «ԼԵՎ ԵՎ ԱՎ» ՍՊԸ:',
];

const CR_NB = { style: BorderStyle.NONE as any, size: 0, color: 'FFFFFF' };
const CR_NBS = { top: CR_NB, bottom: CR_NB, left: CR_NB, right: CR_NB };
const CR_THIN = { style: BorderStyle.SINGLE as any, size: 1, color: 'BBBBBB' };
const CR_THIN_BS = { top: CR_THIN, bottom: CR_THIN, left: CR_THIN, right: CR_THIN };

function crP(
  text: string,
  opts: { bold?: boolean; size?: number; align?: string } = {}
): Paragraph {
  return new Paragraph({
    alignment: (opts.align ?? AlignmentType.LEFT) as any,
    spacing: { after: 60 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 20, font: 'Arial' })],
  });
}

function crPLines(
  text: string,
  opts: { bold?: boolean; size?: number; align?: string } = {}
): Paragraph {
  const lines = text.split('\n');
  return new Paragraph({
    alignment: (opts.align ?? AlignmentType.LEFT) as any,
    spacing: { after: 60 },
    children: lines.map((line, i) => new TextRun({
      text: line, bold: opts.bold, size: opts.size ?? 20, font: 'Arial', break: i > 0 ? 1 : undefined,
    })),
  });
}

function crCell(
  children: Paragraph[],
  opts: { width?: number; vAlign?: (typeof VerticalAlign)[keyof typeof VerticalAlign] } = {}
): TableCell {
  return new TableCell({
    width: opts.width != null ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: (opts.vAlign ?? VerticalAlign.TOP) as any,
    borders: CR_NBS,
    children,
  });
}

function crCompanyBlock(c: typeof CR_COMPANY_RU, align: string = AlignmentType.LEFT): Paragraph[] {
  return [
    crP(c.name,    { bold: true, size: 18, align }),
    crP(c.address, { size: 16, align }),
    crP(c.inn,     { size: 16, align }),
    crP(c.email,   { size: 16, align }),
    crP(c.phone,   { size: 16, align }),
  ];
}

function crHeaderBlock(isAm: boolean): Paragraph[] {
  let logoP: Paragraph;
  try {
    const logoData = require('fs').readFileSync(CR_LOGO_PATH);
    logoP = new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new ImageRun({ data: logoData, transformation: { width: CR_LOGO_W, height: CR_LOGO_H }, type: 'png' } as any),
      ],
    });
  } catch {
    logoP = crP('[LOGO]', { align: AlignmentType.CENTER, bold: true });
  }

  const companyBlock = isAm
    ? crCompanyBlock(CR_COMPANY_AM, AlignmentType.RIGHT)
    : crCompanyBlock(CR_COMPANY_RU);

  return [logoP, ...companyBlock];
}

function crInfoRow(lbl: CrLabel, value: string, isAm: boolean): TableRow {
  const label = isAm ? lbl.am : lbl.ru;
  return new TableRow({
    children: [
      new TableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, borders: CR_THIN_BS, children: [crP(label, { bold: true, size: 17 })] }),
      new TableCell({ width: { size: 60, type: WidthType.PERCENTAGE }, borders: CR_THIN_BS, children: [crP(value, { size: 17 })] }),
    ],
  });
}

function crBuildInfoTable(order: OrderForCarrierRequest, isAm: boolean): Table {
  const plates = [order.carrier.truck_plate, order.carrier.trailer_plate].filter(Boolean).join(' / ');
  const weightSuffix = isAm ? ' տ.' : ' т.';
  const rows = [
    crInfoRow(CR_T.route,     `${order.route.from_country} — ${order.route.to_country}`.toUpperCase(), isAm),
    crInfoRow(CR_T.loading,   `${order.route.loading_date}, ${order.route.from_address}`, isAm),
    crInfoRow(CR_T.cusDep,    crVal(order.route.customs_departure), isAm),
    crInfoRow(CR_T.cusDest,   crVal(order.route.customs_destination), isAm),
    crInfoRow(CR_T.unloading, `${order.route.unloading_date}, ${order.route.to_address}`, isAm),
    crInfoRow(CR_T.cargo,
      `${order.cargo.name}${order.cargo.value ? ', ' + order.cargo.value : ''}, ${order.cargo.weight_tn}${weightSuffix}`, isAm),
    crInfoRow(CR_T.truckT, crVal(order.carrier.truck_type), isAm),
    crInfoRow(CR_T.truckN, crVal(plates || undefined), isAm),
    ...(order.additional_terms
      ? [crInfoRow(CR_T.addl, order.additional_terms, isAm)]
      : []),
  ];
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function crConditions(isAm: boolean): Paragraph[] {
  const title = isAm ? CR_T.condTitle.am : CR_T.condTitle.ru;
  const list = isAm ? CR_CONDITIONS_AM : CR_CONDITIONS;
  const out: Paragraph[] = [
    crP(title, { bold: true, size: 20 }),
    new Paragraph({ spacing: { after: 40 } }),
  ];
  list.forEach((text, i) => {
    out.push(crPLines(`${i + 1}. ${text}`, { size: 17 }));
  });
  return out;
}

export async function carrierRequestDocx(
  order: OrderForCarrierRequest,
  options: { lang?: 'ru' | 'am' } = {}
): Promise<Buffer> {
  const isAm = options.lang === 'am';
  const t = <R, A>(ru: R, am: A) => isAm ? am : ru;

  const contractRef = order.contract_number
    ? t(
        CR_T.toContract.ru(order.contract_number, order.contract_date ?? ''),
        CR_T.toContract.am(order.contract_number, order.contract_date ?? ''),
      )
    : '';

  const freightLine = `${order.price.toLocaleString('ru-RU')} ${order.currency}${order.all_in ? ' (ALL IN)' : ''}`;
  const payDays = order.payment_days ?? 10;

  const financeTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        new TableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, borders: CR_THIN_BS,
          children: [crP(t(CR_T.freight.ru, CR_T.freight.am), { bold: true, size: 17 })] }),
        new TableCell({ width: { size: 60, type: WidthType.PERCENTAGE }, borders: CR_THIN_BS,
          children: [crP(freightLine, { bold: true, size: 19 })] }),
      ]}),
      new TableRow({ children: [
        new TableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, borders: CR_THIN_BS,
          children: [crP(t(CR_T.payTerms.ru, CR_T.payTerms.am), { bold: true, size: 17 })] }),
        new TableCell({ width: { size: 60, type: WidthType.PERCENTAGE }, borders: CR_THIN_BS, children: [
          crP(t(CR_T.payText.ru(payDays), CR_T.payText.am(payDays)), { size: 17 }),
        ]}),
      ]}),
    ],
  });

  // Director name differs between RU and AM — not a typo
  const directorName = isAm ? 'Ա. Զոհրաբյան' : 'А. Зограбян';
  const companyName = isAm ? CR_COMPANY_AM.name : CR_COMPANY_RU.name;
  const directorTitle = t(CR_T.directorTitle.ru, CR_T.directorTitle.am);

  const sigTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [
      crCell([
        crP(t(CR_T.customer.ru, CR_T.customer.am), { bold: true }),
        crP(companyName),
        crP(`${t(CR_T.position.ru, CR_T.position.am)} ${directorTitle}`),
        crP(`${t(CR_T.fio.ru, CR_T.fio.am)} ${directorName}`),
        crP(t(CR_T.sig.ru, CR_T.sig.am)),
      ], { width: 50 }),
      crCell([
        crP(t(CR_T.contractor.ru, CR_T.contractor.am), { bold: true }),
        crP(order.carrier.company_name),
        crP(isAm ? `${CR_T.position.am} ___________________` : CR_T.position.ru),
        crP(isAm ? `${CR_T.fio.am} ___________________` : CR_T.fio.ru),
        crP(t(CR_T.sig.ru, CR_T.sig.am)),
      ], { width: 50 }),
    ]})],
  });

  const children: (Paragraph | Table)[] = [
    ...crHeaderBlock(isAm),
    new Paragraph({ spacing: { after: 160 } }),
    crP(
      t(CR_T.requestTitle.ru(order.order_number, order.order_date),
        CR_T.requestTitle.am(order.order_number, order.order_date)),
      { bold: true, align: AlignmentType.CENTER, size: 26 },
    ),
    ...(contractRef ? [crP(contractRef, { align: AlignmentType.CENTER, size: 19 })] : []),
    new Paragraph({ spacing: { after: 100 } }),
    crP(t(CR_T.toCarrier.ru(order.carrier.company_name), CR_T.toCarrier.am(order.carrier.company_name)), { bold: true }),
    new Paragraph({ spacing: { after: 80 } }),
    crP(t(CR_T.intro.ru, CR_T.intro.am)),
    new Paragraph({ spacing: { after: 100 } }),
    crBuildInfoTable(order, isAm),
    new Paragraph({ spacing: { after: 160 } }),
    ...crConditions(isAm),
    new Paragraph({ spacing: { after: 160 } }),
    ...(isAm ? [crP(CR_T.financeTitle, { bold: true, size: 20 })] : []),
    financeTable,
    new Paragraph({ spacing: { after: 200 } }),
    ...(isAm ? [crP(CR_T.sigSectionTitle, { bold: true, size: 20 })] : []),
    sigTable,
  ];

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 720 } } },
      children,
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
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
