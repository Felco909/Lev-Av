# Карта базы данных — LevAV TMS

28 моделей в `prisma/schema.prisma`, PostgreSQL, отслеживается через Prisma Migrate (`prisma/migrations/`). Новые изменения схемы — **только** `npx prisma migrate dev --name <описание>`, никогда `prisma db push`.

## Ядро: заявки и рейсы

**Trip** — центральная сущность (сделка/заявка). Ключевые поля: `tripNumber` (уникальный), `tripType` (`own_transport`|`expedition`), `status` (workflow: new→in_progress→unloaded→awaiting_payment→sverka→completed, либо archived/cancelled в любой момент), `clientRateAmd`/`carrierRateAmd`, `clientPaidAmountAmd`/`carrierPaidAmountAmd` (денормализованные суммы, пересчитываются из `Payment` при каждой мутации), `vehicleTripId` (связь с VehicleTrip — единственный источник дохода собственного транспорта), `invoiceDocNumber`/`actDocNumber`/`taxCode`. Связи: `Client`, `ClientContact`, `Vehicle`, `Driver`, `Carrier`, `Expense[]`, `Payment[]`, `TripAttachment[]`, `TripHistory[]`.

**VehicleTrip** — рейс машины (собственный транспорт). `departureDate`/`returnDate` (с точным временем), `status` (`active`|`completed`), денежные поля рейса (`salaryAmd`, `perDiemAmd`×4, `otherExpensesAmd`, `fuelCostAmd` — единственный источник стоимости топлива), `calculatedKm`/`calculatedFuelConsumedL`/`fuelCalcSource` (из Wialon), `geofenceStatus`/`geofenceStatusAt` (момент GPS-подтверждённого выезда — НЕ heartbeat синхронизации), `departureConfirmedByGps`. Связь `Trip[]` — обратная сторона `Trip.vehicleTripId` (много заявок на один рейс).

**Expense** — расход, привязанный к заявке. `expenseType` (fuel|toll|ferry|other), `description` — единственное поле, определяющее сторону: маркер `__carrier__` = перевозчицкий расход, иначе клиентский (`lib/finance/formulas.ts: splitExpensesAmd`).

**Payment** — платёж по заявке. `type` (client|carrier), `amountAmd`. Единственный источник истины для `Trip.clientPaidAmountAmd`/`carrierPaidAmountAmd` (пересчитывается через `recalcTripPayments` после каждой мутации). Защищён от дублей на уровне API (advisory-лок + окно 15 сек).

**TripHistory** — журнал изменений заявки (action/field/oldValue/newValue).

## Автопарк

**Vehicle** — машина. `status` (active|archived, мягкое удаление), `currentMileage`, `wialonUnitId`, `atBase`/`atBaseChangedAt` (присутствие на базе, обновляется фоновой задачей раз в 5 мин через `CompanyZone`).

**Driver** — водитель, тот же паттерн мягкого удаления.

**Carrier** — перевозчик (для expedition-заявок), тот же паттерн.

**DriverVehicleHistory** — лог смен водителя на машине (не интервальная таблица, только `changedAt`).

**Maintenance** — **устаревшая модель, 0 строк в проде, нет write-пути из UI**. `/maintenance` работает через `ServiceRecord`+`ServiceRegulation`. Оставлена для истории/legacy-отчётов, не расширять.

**ServiceRegulation** / **ServiceRecord** — актуальная система регламентов и записей ТО.

**TireSet** — комплекты шин. **FuelRecord** — только ручной журнал заправок на `/fuel`, больше нигде не читается (единственный источник расхода топлива — `VehicleTrip`/Wialon). **DocumentExpiry** — сроки действия документов машин/водителей.

## Контрагенты

**Client** — клиент. **Внимание:** нет поля `status` (в отличие от Vehicle/Driver/Carrier) — физическое удаление с защитой по количеству заявок (`tripCount > 0` блокирует). `paymentTermsDays` — срок оплаты по умолчанию для расчёта `paymentDueDate`. Нумерация счетов/актов — `lastInvoiceNum`/`lastActNum`/`invoicePrefix`/`actPrefix`/`numberFormat`.

**ClientContact** — контактное лицо клиента (может быть привязано к конкретной заявке через `Trip.contactId`).

**Supplier** — поставщик запчастей. **PartPurchase**/**PartPayment** — закупки и оплаты (тот же паттерн пересчёта `paidAmount`/`paymentStatus` из журнала платежей, что и у Trip). **PartAttachment** — вложения закупки.

## Финансы (вспомогательное)

**FleetExpense** — расходы парка **отдельным потоком** (даже `expenseType='fuel'` — не путать с топливом на VehicleTrip, никогда не подмешивается).

## Документы / файлы

**TripAttachment** — вложения заявки (локальное хранилище `storage/uploads/`, кроме legacy S3-пути). **DocumentTemplate** — шаблоны документов.

## Телематика

**CompanyZone** — зоны TMS (база компании и т.п.), используется вместо Wialon-геозон. **VehicleTripEvent** — лог событий рейса (детект выезда и т.п.).

## Система

**User** — пользователь (роли: admin/owner/director/accountant/dispatcher/…). **Setting** — плоский key-value (реквизиты компании, `wialon_last_sync_at` heartbeat, пользовательские настройки виджетов).

## Индексы (важные, не тривиальные)

`Trip` — индексы на `tripDate`, `status`, `tripType`, `currency`, `contactId`, `vehicleTripId`, и отдельно на `clientId`/`vehicleId`/`driverId`/`carrierId` (самые частые фильтры в analytics/reports/поиске). `Payment` — `tripId`, `(tripId, type)`. `TripHistory` — `tripId`, `createdAt`. `Maintenance` — `vehicleId`, `nextDate`.

## Целостность (по факту, на 01.08.2026)

Проверено READ-ONLY SQL на реальной БД (Enterprise-аудит 01.08.2026): 0 дублей `tripNumber`, 0 orphaned FK, 0 некорректных значений `status`, 0 NULL там, где ожидается 0. Единственные найденные аномалии — данные, не схема: дубль платежа TMS-2026-0105 (исправлен), 3 заявки без `paymentDueDate` при наличии долга (требуют ручной простановки срока бухгалтером), 1 машина (521DF61) без активности ~4 месяца при рабочем GPS-трекере (требует операционной проверки).
