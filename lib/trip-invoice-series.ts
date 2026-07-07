/** Визуальный контроль серий счетов (налоговая отчётность). Без блокировок и валидации сохранения. */

export type TripInvoiceSeriesIndicator = {
  label: string;
  badgeClass: string;
  status: 'ok' | 'warning';
};

export function hasInvoiceSeries(value: string | null | undefined): boolean {
  return String(value ?? '').trim().length > 0;
}

export function isTripInvoiceSeriesComplete(
  tripType: string | null | undefined,
  clientInvoiceSeries: string | null | undefined,
  carrierInvoiceSeries: string | null | undefined,
): boolean {
  if (!hasInvoiceSeries(clientInvoiceSeries)) return false;
  if (tripType === 'expedition' && !hasInvoiceSeries(carrierInvoiceSeries)) return false;
  return true;
}

export function getTripInvoiceSeriesIndicator(
  tripType: string | null | undefined,
  clientInvoiceSeries: string | null | undefined,
  carrierInvoiceSeries: string | null | undefined,
): TripInvoiceSeriesIndicator {
  const clientOk = hasInvoiceSeries(clientInvoiceSeries);
  const carrierOk = hasInvoiceSeries(carrierInvoiceSeries);
  const isExpedition = tripType === 'expedition';
  const warn = 'bg-amber-50 text-amber-800';
  const ok = 'bg-emerald-50 text-emerald-700';

  if (!clientOk && isExpedition && !carrierOk) {
    return { label: '⚠️ Нет серий клиента и перевозчика', badgeClass: warn, status: 'warning' };
  }
  if (!clientOk) {
    return { label: '⚠️ Нет серии клиента', badgeClass: warn, status: 'warning' };
  }
  if (isExpedition && !carrierOk) {
    return { label: '⚠️ Нет серии перевозчика', badgeClass: warn, status: 'warning' };
  }
  return { label: '✅ Серии заполнены', badgeClass: ok, status: 'ok' };
}

/** Prisma-фильтр: завершённые заявки с неполными сериями (для списка и дашборда). */
export function prismaWhereInvoiceSeriesIncomplete() {
  return {
    OR: [
      { clientInvoiceSeries: null },
      { clientInvoiceSeries: '' },
      {
        tripType: 'expedition',
        OR: [{ carrierInvoiceSeries: null }, { carrierInvoiceSeries: '' }],
      },
    ],
  };
}
