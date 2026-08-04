import { roundMoney } from '@/lib/finance/formulas';

export interface CashGapRow {
  id: string;
  cashGap: number;
}

/**
 * Суммарный кассовый разрыв по объединённому списку клиентских + перевозчицких
 * долговых строк (getClientDebtRows/getCarrierDebtRows) — с дедупликацией по id
 * заявки. Одна и та же заявка может одновременно быть и в клиентских, и в
 * перевозчицких долгах; cashGap в обеих строках — одно и то же число (та же формула
 * computeCashGapAmd от тех же client/carrier paid), поэтому наивная сумма по обеим
 * строкам удваивала итог (аудит 01.08.2026, п.4 — подтверждено на живых данных,
 * 6 419 500 вместо верных 6 039 500 ֏). Используется в /api/dashboard, /api/day-tasks
 * и /api/trips/stats (колокольчик) — единая логика во всех трёх местах.
 */
export function dedupeCashGapTotal(rows: readonly CashGapRow[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const r of rows) {
    if (r.cashGap > 0 && !seen.has(r.id)) {
      seen.add(r.id);
      total += r.cashGap;
    }
  }
  return roundMoney(total);
}
