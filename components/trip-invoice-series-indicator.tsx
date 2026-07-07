import { getTripInvoiceSeriesIndicator } from '@/lib/trip-invoice-series';

type Props = {
  tripType?: string | null;
  clientInvoiceSeries?: string | null;
  carrierInvoiceSeries?: string | null;
  className?: string;
};

export default function TripInvoiceSeriesIndicator({
  tripType,
  clientInvoiceSeries,
  carrierInvoiceSeries,
  className = '',
}: Props) {
  const ind = getTripInvoiceSeriesIndicator(tripType, clientInvoiceSeries, carrierInvoiceSeries);
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap font-medium ${ind.badgeClass} ${className}`.trim()}
    >
      {ind.label}
    </span>
  );
}
