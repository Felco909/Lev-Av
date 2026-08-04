export const WARNING_CLIENT_PAYMENT_TERMS =
  'У клиента не указан срок оплаты. Заполните срок оплаты в карточке клиента или укажите срок оплаты вручную.';

/** Дата @db.Date + N календарных дней (локальная полуночь). */
export function addCalendarDaysFromDateOnly(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}
