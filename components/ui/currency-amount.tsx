import { cn, formatCurrency, formatCurrencyRaw, formatRate } from '@/lib/utils';

/**
 * Единый визуальный слой отображения валютных сумм: исходная сумма+валюта → курс →
 * AMD-эквивалент. Раньше этот паттерн был инлайн-продублирован (trips/[id]/page.tsx,
 * trip-form.tsx, reports/page.tsx) с разными картами символов и разной вёрсткой —
 * это единственный источник вёрстки теперь. Ничего не считает — только отображает уже
 * готовые amount/currency/rate/amountAmd, взятые из Trip/Expense/Payment/FleetExpense.
 *
 * currency === 'AMD' (или не указана) — просто AMD-число, без "курс 1.00", чтобы не
 * захламлять интерфейс там, где конвертации не было.
 */
export interface CurrencyAmountProps {
  amount: number | string | null | undefined;
  currency: string | null | undefined;
  rate?: number | string | null;
  amountAmd: number | string | null | undefined;
  /** stacked — крупнее, для карточек/детальных страниц. compact — плотный блок для ячеек таблиц. */
  variant?: 'stacked' | 'compact';
  className?: string;
}

export function CurrencyAmount({ amount, currency, rate, amountAmd, variant = 'stacked', className }: CurrencyAmountProps) {
  const cur = (currency || 'AMD').toUpperCase();
  const isAmd = cur === 'AMD';

  if (isAmd) {
    return <span className={cn('font-mono', className)}>{formatCurrency(Number(amountAmd ?? amount ?? 0))}</span>;
  }

  const originalLine = formatCurrencyRaw(Number(amount ?? 0), cur);
  const rateLine = `курс ${formatRate(rate ?? 1)}`;
  const amdLine = formatCurrency(Number(amountAmd ?? 0));

  if (variant === 'compact') {
    return (
      <span className={cn('inline-flex flex-col leading-tight font-mono', className)}>
        <span className="text-xs font-medium whitespace-nowrap">{originalLine}</span>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{rateLine}</span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{amdLine}</span>
      </span>
    );
  }

  return (
    <span className={cn('inline-flex flex-col leading-snug font-mono', className)}>
      <span className="text-sm font-semibold whitespace-nowrap">{originalLine}</span>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{rateLine} → {amdLine}</span>
    </span>
  );
}
