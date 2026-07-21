/**
 * Статус активности машины по последнему сообщению Wialon — общая логика для страницы
 * «Телематика» (таблица статуса парка) и карты онлайн-мониторинга (Этап 6), чтобы оба места
 * не разъезжались в определении "движется/стоит/нет связи".
 */

export type VehicleActivityStatus = 'moving' | 'stopped' | 'no_signal';

/** Нет сообщений дольше этого — считаем "нет связи", независимо от последней скорости. */
const STALE_MS = 30 * 60 * 1000;
/** Выше этой скорости считаем, что машина реально едет (не GPS-дрожание на стоянке). */
const MOVING_SPEED_THRESHOLD_KMH = 3;

export function getVehicleActivityStatus(
  speedKmh: number | null | undefined,
  lastMessageAt: string | Date | null | undefined
): VehicleActivityStatus {
  if (!lastMessageAt) return 'no_signal';
  const lastMs = typeof lastMessageAt === 'string' ? new Date(lastMessageAt).getTime() : lastMessageAt.getTime();
  if (Number.isNaN(lastMs) || Date.now() - lastMs > STALE_MS) return 'no_signal';
  return (speedKmh ?? 0) > MOVING_SPEED_THRESHOLD_KMH ? 'moving' : 'stopped';
}
