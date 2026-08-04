# Карта API — LevAV TMS

Все роуты требуют авторизованную сессию (next-auth), кроме `/api/auth/*` и `/api/signup`. Финансовые поля (`clientPaidAmount*`/`carrierPaidAmount*`/статусы оплаты) защищены ролями `admin/owner/director/accountant` (`lib/auth/role-guard.ts`).

## Заявки (Trip)
| Роут | Метод | Назначение |
|---|---|---|
| `/api/trips` | GET/POST | Список заявок (с фильтрами/поиском/пагинацией), создание |
| `/api/trips/[id]` | GET/PUT/PATCH/DELETE | Карточка заявки: чтение, полное сохранение (PUT), точечные изменения статуса (PATCH), удаление |
| `/api/trips/[id]/close` | POST/PUT | Завершение сделки (гейт: долг клиента/перевозчика через канонические формулы + налоговый код) / переоткрытие |
| `/api/trips/[id]/archive` | — | Архивирование завершённой заявки |
| `/api/trips/[id]/attachments` | — | Вложения заявки |
| `/api/trips/[id]/costs` | — | Расходы (Expense) по заявке |
| `/api/trips/[id]/detach` | — | Отвязка от рейса (VehicleTrip) |
| `/api/trips/[id]/generate-docs` | — | Генерация счёта/акта (DOCX→PDF через LibreOffice) |
| `/api/trips/[id]/history` | — | История изменений (TripHistory) |
| `/api/trips/stats` | GET | Данные колокольчика уведомлений (просрочка/кассовый разрыв — единый источник `debts-service.ts`) |
| `/api/trips/calendar` | — | События для `/calendar` |
| `/api/trips/unattached` | — | Заявки "ожидают привязки" к рейсу |
| `/api/trips/revalue` | — | Пересчёт по курсу валют |
| `/api/trips/extract-contract` | — | Извлечение данных из загруженного договора |

## Оплаты
| Роут | Метод | Назначение |
|---|---|---|
| `/api/payments` | GET/POST/DELETE | Журнал платежей. POST защищён от дублей (advisory-лок Postgres + окно 15 сек) |
| `/api/payments/history` | GET | История платежей для `/payment-history` |

## Рейсы машин (VehicleTrip)
| Роут | Назначение |
|---|---|
| `/api/vehicle-trips`, `/[id]` | CRUD рейса |
| `/[id]/close` | Закрытие рейса (замораживает итоги по живому снимку Wialon) |
| `/[id]/attach-trips` | Привязка заявок к рейсу |
| `/[id]/archive` | Архивирование |
| `/[id]/events` | Лог событий рейса |
| `/[id]/recalculate-fuel` | Пересчёт расхода топлива из Wialon |

## Финансы / долги / отчётность
| Роут | Назначение |
|---|---|
| `/api/dashboard`, `/xlsx`, `/pdf` | Главная сводка + экспорты |
| `/api/debts` | Единый слой долгов (клиенты/перевозчики, группировка, напоминания) |
| `/api/day-tasks` | Единый агрегатор «Лист дня» (Логист/Бухгалтер/Директор) |
| `/api/finance/audit` | Диагностика расхождений формул (canonical vs as-is) |
| `/api/finance/income-diagnostic`, `/own-fleet-integrity` | Диагностика дохода собственного транспорта |
| `/api/reports/overview` | Общая сводка (используется `getOperationalSummary`) |
| `/api/reports/trips`, `/xlsx` | Таблица заявок за период + экспорт Excel |
| `/api/reports/own-fleet` | Доход/расход/прибыль своего транспорта (единственный источник для вкладки «Свой автопарк») |
| `/api/reports/company-debts`, `/supplier-debts` | Долги компании (перевозчикам + поставщикам запчастей) |
| `/api/reports/carrier-ranking`, `/fleet-heatmap`, `/vehicle-expenses`, `/reconciliation` | Прочая аналитика отчётов |

## Аналитика
| Роут | Назначение |
|---|---|
| `/api/vehicle-analytics` | По каждой машине (доход/расход/прибыль/рентабельность), исключает архивные |
| `/api/driver-analytics` | По водителям |
| `/api/analytics/clients`, `/analytics/routes` | По клиентам / маршрутам |
| `/api/stats/fleet` | Быстрая статистика парка |

## Справочники
| Роут | Назначение |
|---|---|
| `/api/vehicles`, `/[id]`, `/[id]/economics`, `/[id]/driver-history`, `/availability` | Машины |
| `/api/drivers`, `/[id]` | Водители |
| `/api/carriers`, `/[id]` | Перевозчики |
| `/api/clients`, `/[id]`, `/[id]/contacts`, `/[id]/contract`, `/[id]/templates`, `/[id]/next-doc-number`, `/[id]/next-doc-pair`, `/[id]/document-number-warnings` | Клиенты + нумерация документов |
| `/api/suppliers`, `/[id]` | Поставщики запчастей |
| `/api/route-templates`, `/[id]` | Шаблоны маршрутов |

## Автопарк / обслуживание
| Роут | Назначение |
|---|---|
| `/api/maintenance/status` | Статус ТО (через `ServiceRecord`/`ServiceRegulation`, НЕ через устаревшую модель `Maintenance`) |
| `/api/service-records`, `/[id]`, `/service-regulations`, `/[id]` | Регламенты и записи ТО |
| `/api/fleet-expenses` | Расходы парка (FleetExpense) |
| `/api/fuel-records`, `/[id]` | Ручной журнал заправок (только `/fuel`, больше нигде не читается) |
| `/api/tire-sets`, `/[id]` | Шины |
| `/api/document-expiry`, `/[id]` | Сроки действия документов |
| `/api/part-purchases`, `/[id]`, `/[id]/attachments`, `/[id]/payments` | Закупки запчастей |

## Wialon / телематика
| Роут | Назначение |
|---|---|
| `/api/wialon/config` | Настройка токена (роль `WIALON_CONFIG_ROLES`) |
| `/api/wialon/fleet-snapshot` | Живой снимок всего парка |
| `/api/wialon/vehicle-live`, `/vehicle-snapshot` | Точка/снимок по одной машине |
| `/api/wialon/sync-mileage`, `/sync-vehicles` | Синхронизация пробега/списка машин |
| `/api/wialon/test-connection` | Проверка соединения |
| `/api/company-base/check`, `/status` | Проверка присутствия на базе (фоновая задача) |
| `/api/company-zones` | Зоны TMS (не Wialon-геозоны) |

## Документы / файлы
| Роут | Назначение |
|---|---|
| `/api/documents/generate` | Генерация счёта/акта |
| `/api/documents/driver-doc` | Документы водителя |
| `/api/documents/by-client` | **Единственный роут на S3** (legacy, не работает без AWS-креденшелов на этой машине — известный пункт) |
| `/api/upload/local`, `/upload/presigned` | Загрузка файлов (локальное хранилище) |
| `/api/files` | Отдача файлов из локального хранилища |
| `/api/templates` | Шаблоны документов |
| `/api/agents/document` | AI-агент по документам |

## Система
| Роут | Назначение |
|---|---|
| `/api/settings` | Настройки (Setting key-value) |
| `/api/auth/[...nextauth]`, `/auth/login`, `/signup` | Авторизация |
| `/api/health` | Health-check |
| `/api/exchange-rates` | Курсы валют |
| `/api/search` | Глобальный поиск |
