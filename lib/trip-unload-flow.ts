import type { PrismaClient } from '@prisma/client';

export const MSG_UNLOAD_DATE_REQUIRED =
  'Укажите дату разгрузки в заявке. Без неё нельзя перевести заявку в статус «Разгружен».';

export const MSG_AWAITING_PAYMENT_UNLOAD_REQUIRED =
  'Укажите дату разгрузки. Без неё нельзя перевести заявку в статус «На оплату».';

export const WARNING_CLIENT_PAYMENT_TERMS =
  'У клиента не указан срок оплаты. Заполните срок оплаты в карточке клиента или укажите срок оплаты вручную.';

/** Дата @db.Date + N календарных дней (локальная полуночь). */
export function addCalendarDaysFromDateOnly(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function parseDateOnly(input: string | Date | null | undefined): Date | null {
  if (input == null || input === '') return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export type UnloadedTransitionOk = {
  ok: true;
  finalStatus: 'unloaded';
  unloadDate: Date;
  warnings: string[];
};

export type AwaitingPaymentTransitionOk = {
  ok: true;
  finalStatus: 'awaiting_payment';
  paymentDueDate: Date | null;
  warnings: string[];
};

export type WorkflowTransitionErr = { ok: false; error: string; statusCode: number };

/** Перевод в «Разгружен»: только дата разгрузки, без старта дебиторки. */
export async function resolveUnloadedStatusTransition(
  prisma: PrismaClient,
  args: {
    clientId: string;
    unloadDateFromBody: string | null | undefined;
    unloadDateExisting: Date | null | undefined;
  },
): Promise<UnloadedTransitionOk | WorkflowTransitionErr> {
  void prisma;
  void args.clientId;
  const unload =
    parseDateOnly(args.unloadDateFromBody) ??
    parseDateOnly(args.unloadDateExisting ?? null);
  if (!unload) {
    return { ok: false, error: MSG_UNLOAD_DATE_REQUIRED, statusCode: 400 };
  }

  return {
    ok: true,
    finalStatus: 'unloaded',
    unloadDate: unload,
    warnings: [],
  };
}

/** Перевод в «На оплату»: документы выставлены, считается срок оплаты. */
export async function resolveAwaitingPaymentStatusTransition(
  prisma: PrismaClient,
  args: {
    clientId: string;
    unloadDateFromBody: string | null | undefined;
    unloadDateExisting: Date | null | undefined;
    paymentDueFromBody: string | null | undefined;
    paymentDueExisting: Date | null | undefined;
  },
): Promise<AwaitingPaymentTransitionOk | WorkflowTransitionErr> {
  const unload =
    parseDateOnly(args.unloadDateFromBody) ??
    parseDateOnly(args.unloadDateExisting ?? null);
  if (!unload) {
    return { ok: false, error: MSG_AWAITING_PAYMENT_UNLOAD_REQUIRED, statusCode: 400 };
  }

  const client = await prisma.client.findUnique({
    where: { id: args.clientId },
    select: { paymentTermsDays: true },
  });
  const days = client?.paymentTermsDays;

  if (days != null && days > 0) {
    const paymentDueDate = addCalendarDaysFromDateOnly(unload, days);
    return {
      ok: true,
      finalStatus: 'awaiting_payment',
      paymentDueDate,
      warnings: [],
    };
  }

  const manualDue =
    parseDateOnly(args.paymentDueFromBody) ?? parseDateOnly(args.paymentDueExisting ?? null);

  return {
    ok: true,
    finalStatus: 'awaiting_payment',
    paymentDueDate: manualDue,
    warnings: [WARNING_CLIENT_PAYMENT_TERMS],
  };
}
