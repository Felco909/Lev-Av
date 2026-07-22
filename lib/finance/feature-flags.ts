import { prisma } from '@/lib/prisma';

/**
 * Переключатель миграции "доход собственного транспорта" на явную связь
 * Trip.vehicleTripId вместо сопоставления по датам (см. согласованную архитектуру).
 * Хранится в Setting, а не в .env — переключение должно быть мгновенным
 * (без пересборки/перезапуска прода) и мгновенно обратимым.
 *
 * legacy — старое поведение везде, ничего не изменилось (значение по умолчанию).
 * shadow — пользователи по-прежнему видят старый расчёт, но параллельно можно
 *          сверять новый (см. lib/finance/own-fleet-income.ts) и смотреть расхождения.
 * new    — экраны показывают новый расчёт (переключается по одному месту за раз,
 *          см. план по этапам).
 */
export type IncomeCalcMode = 'legacy' | 'shadow' | 'new';

const SETTING_KEY = 'income_calc_mode';
const DEFAULT_MODE: IncomeCalcMode = 'legacy';

export async function getIncomeCalcMode(): Promise<IncomeCalcMode> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  if (row?.value === 'shadow' || row?.value === 'new' || row?.value === 'legacy') return row.value;
  return DEFAULT_MODE;
}

export async function setIncomeCalcMode(mode: IncomeCalcMode): Promise<void> {
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value: mode },
    create: { key: SETTING_KEY, value: mode },
  });
}
