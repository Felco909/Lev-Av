/**
 * Конечный автомат статусов рейса по геозонам (Этап 7). Чистая функция — без обращений к БД,
 * решает "что должно стать новым geofenceStatus", вызывающий код (lib/wialon/geofenceCheck.ts)
 * сам решает, сохранять ли переход и писать ли событие в историю.
 */

export type GeofenceStatus =
  | 'departed'
  | 'arrived_loading'
  | 'loading'
  | 'in_transit'
  | 'arrived_unloading'
  | 'unloaded'
  | 'returned_to_garage';

export type ZoneRole = 'garage' | 'loading' | 'unloading';

export const GEOFENCE_STATUS_LABEL: Record<GeofenceStatus, string> = {
  departed: 'Выехал',
  arrived_loading: 'Прибыл на загрузку',
  loading: 'Загрузка',
  in_transit: 'В пути',
  arrived_unloading: 'Прибыл на выгрузку',
  unloaded: 'Разгружен',
  returned_to_garage: 'Вернулся в гараж',
};

/** Сколько машина должна пробыть внутри зоны погрузки/выгрузки, прежде чем "прибыл на..."
 *  станет "загрузка"/"разгружен" — иначе короткая остановка у ворот сразу считалась бы погрузкой. */
export const DWELL_UPGRADE_MINUTES = 10;

/**
 * Переход при ВЪЕЗДЕ в зону роли `role`. current — текущий geofenceStatus рейса (null, если
 * ещё не выезжал). Возвращает новый статус или null, если переход не нужен (в этой роли/
 * состоянии въезд ничего не меняет — например, машина заехала в зону погрузки повторно, уже
 * будучи в статусе "загрузка").
 */
export function onZoneEnter(current: GeofenceStatus | null, role: ZoneRole): GeofenceStatus | null {
  if (role === 'garage') {
    // Возврат в гараж имеет смысл только после того, как рейс реально начался (departed и далее).
    if (current && current !== 'returned_to_garage') return 'returned_to_garage';
    return null;
  }
  if (role === 'loading') {
    if (current === null || current === 'departed') return 'arrived_loading';
    return null;
  }
  if (role === 'unloading') {
    if (current === 'departed' || current === 'in_transit') return 'arrived_unloading';
    return null;
  }
  return null;
}

/** Переход при ВЫЕЗДЕ из зоны роли `role`. */
export function onZoneExit(current: GeofenceStatus | null, role: ZoneRole): GeofenceStatus | null {
  if (role === 'garage') {
    if (current === null) return 'departed';
    return null;
  }
  if (role === 'loading') {
    if (current === 'arrived_loading' || current === 'loading') return 'in_transit';
    return null;
  }
  if (role === 'unloading') {
    if (current === 'arrived_unloading' || current === 'unloaded') return 'in_transit';
    return null;
  }
  return null;
}

/**
 * "Дозревание" статуса при длительном нахождении внутри зоны без выезда — arrived_loading
 * становится loading, arrived_unloading становится unloaded, если прошло >= DWELL_UPGRADE_MINUTES
 * с момента последнего изменения статуса (geofenceStatusAt).
 */
export function onZoneDwell(current: GeofenceStatus | null, role: ZoneRole, minutesSinceStatusChange: number): GeofenceStatus | null {
  if (minutesSinceStatusChange < DWELL_UPGRADE_MINUTES) return null;
  if (role === 'loading' && current === 'arrived_loading') return 'loading';
  if (role === 'unloading' && current === 'arrived_unloading') return 'unloaded';
  return null;
}
