/**
 * Конвертация числа в текст прописью на русском языке.
 * Поддержка валют: RUB, USD, EUR, AMD и др.
 */

const ONES_M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

type Gender = 'm' | 'f';

interface ScaleWord {
  one: string;
  few: string;
  many: string;
  gender: Gender;
}

const SCALES: ScaleWord[] = [
  { one: '', few: '', many: '', gender: 'm' },                          // единицы
  { one: 'тысяча', few: 'тысячи', many: 'тысяч', gender: 'f' },         // тысячи
  { one: 'миллион', few: 'миллиона', many: 'миллионов', gender: 'm' },   // миллионы
  { one: 'миллиард', few: 'миллиарда', many: 'миллиардов', gender: 'm' },// миллиарды
];

function pluralize(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const lastDigit = abs % 10;
  if (abs >= 11 && abs <= 19) return many;
  if (lastDigit === 1) return one;
  if (lastDigit >= 2 && lastDigit <= 4) return few;
  return many;
}

function tripletToWords(n: number, gender: Gender): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const remainder = n % 100;
  const t = Math.floor(remainder / 10);
  const o = remainder % 10;

  if (h > 0) parts.push(HUNDREDS[h]);
  if (t === 1) {
    parts.push(TEENS[o]);
  } else {
    if (t > 1) parts.push(TENS[t]);
    if (o > 0) parts.push(gender === 'f' ? ONES_F[o] : ONES_M[o]);
  }
  return parts.join(' ');
}

function integerToWords(num: number): string {
  if (num === 0) return 'ноль';

  const parts: string[] = [];
  let remaining = Math.abs(Math.floor(num));
  let scaleIdx = 0;

  while (remaining > 0 && scaleIdx < SCALES.length) {
    const triplet = remaining % 1000;
    remaining = Math.floor(remaining / 1000);

    if (triplet > 0) {
      const scale = SCALES[scaleIdx];
      const words = tripletToWords(triplet, scale.gender);
      const scaleWord = scaleIdx > 0
        ? ' ' + pluralize(triplet, scale.one, scale.few, scale.many)
        : '';
      parts.unshift(words + scaleWord);
    }
    scaleIdx++;
  }

  const result = parts.join(' ');
  return num < 0 ? 'минус ' + result : result;
}

/* ===== Валюты ===== */

interface CurrencyWords {
  integer: [string, string, string]; // [one, few, many]
  integerGender: Gender;
  fractional: [string, string, string];
  fractionalGender: Gender;
}

const CURRENCIES: Record<string, CurrencyWords> = {
  RUB: {
    integer: ['рубль', 'рубля', 'рублей'],
    integerGender: 'm',
    fractional: ['копейка', 'копейки', 'копеек'],
    fractionalGender: 'f',
  },
  USD: {
    integer: ['доллар США', 'доллара США', 'долларов США'],
    integerGender: 'm',
    fractional: ['цент', 'цента', 'центов'],
    fractionalGender: 'm',
  },
  EUR: {
    integer: ['евро', 'евро', 'евро'],
    integerGender: 'm',
    fractional: ['цент', 'цента', 'центов'],
    fractionalGender: 'm',
  },
  AMD: {
    integer: ['драм', 'драма', 'драмов'],
    integerGender: 'm',
    fractional: ['лума', 'лумы', 'лум'],
    fractionalGender: 'f',
  },
  GEL: {
    integer: ['лари', 'лари', 'лари'],
    integerGender: 'm',
    fractional: ['тетри', 'тетри', 'тетри'],
    fractionalGender: 'm',
  },
};

/**
 * Конвертирует число в текст прописью с указанием валюты.
 * @param amount — сумма (число или строка)
 * @param currency — код валюты (RUB, USD, EUR, AMD и т.д.)
 * @returns строка вида "двести тысяч рублей 50 копеек"
 */
export function amountToWords(amount: number | string, currency: string = 'RUB'): string {
  const num = typeof amount === 'string' ? parseFloat(amount.replace(/\s/g, '').replace(',', '.')) : amount;
  if (isNaN(num) || num < 0) return '';

  const cur = CURRENCIES[currency.toUpperCase()];
  if (!cur) {
    // Для неизвестной валюты — просто число прописью
    return integerToWords(Math.floor(num));
  }

  const intPart = Math.floor(num);
  const fracPart = Math.round((num - intPart) * 100);

  const intWords = integerToWords(intPart);
  const intCurWord = pluralize(intPart, cur.integer[0], cur.integer[1], cur.integer[2]);

  let result = `${intWords} ${intCurWord}`;

  if (fracPart > 0) {
    const fracStr = String(fracPart).padStart(2, '0');
    const fracCurWord = pluralize(fracPart, cur.fractional[0], cur.fractional[1], cur.fractional[2]);
    result += ` ${fracStr} ${fracCurWord}`;
  }

  return result;
}

/**
 * Форматирует число с пробелами-разделителями тысяч.
 * 200000 → "200 000", 1234567.50 → "1 234 567.50"
 */
export function formatAmountWithSpaces(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount.replace(/\s/g, '').replace(',', '.')) : amount;
  if (isNaN(num)) return '0';

  const intPart = Math.floor(num);
  const fracPart = Math.round((num - intPart) * 100);

  const intStr = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  if (fracPart > 0) {
    return `${intStr}.${String(fracPart).padStart(2, '0')}`;
  }
  return intStr;
}

/**
 * Генерирует полную строку: "Всего оказано услуг на сумму 200 000 RUB (двести тысяч рублей)"
 */
export function generateSumInWordsLine(amount: number | string, currency: string = 'RUB'): string {
  const formatted = formatAmountWithSpaces(amount);
  const words = amountToWords(amount, currency);
  if (!words) return '';
  return `Всего оказано услуг на сумму ${formatted} ${currency} (${words})`;
}
