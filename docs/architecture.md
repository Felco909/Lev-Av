# Архитектура LevAV TMS

## Стек

| Слой | Технология |
|---|---|
| Frontend | Next.js 16.2.10 (App Router), React 19.2.7, TypeScript 5.2.2, Tailwind CSS |
| Backend | Next.js API Routes (`app/api/**/route.ts`), Node.js |
| БД | PostgreSQL (служба Windows `LevAV_Postgres`), Prisma ORM 6.7.0 |
| Авторизация | next-auth 4.24.14 (credentials, JWT-сессия) |
| Документы | `docx`, `exceljs`, `pdf-lib`, локальный LibreOffice (`soffice --headless`) для DOCX/HTML → PDF |
| Файлы | Локальное хранилище (`storage/uploads/`), кроме одного legacy-роута на S3 |
| Телематика | Wialon API (GPS/пробег/топливо) |
| Тесты | Vitest (`npm test`) — юнит-тесты чистых функций в `lib/**/*.test.ts` |

## Принцип: Single Source of Truth

Ядро архитектуры — все финансовые расчёты идут через **один набор функций** в `lib/finance/*`, а не дублируются в каждом API-роуте:

```
lib/finance/formulas.ts          — базовые формулы (прибыль, долг, кассовый разрыв, просрочка)
lib/finance/finance-metrics-service.ts — агрегация по набору заявок
lib/finance/debts-service.ts     — единый слой чтения долгов (client/carrier debt rows)
lib/finance/own-fleet-income.ts  — доход собственного транспорта (через Trip.vehicleTripId)
lib/finance/cash-gap-dedup.ts    — дедупликация кассового разрыва при объединении client+carrier строк
lib/vehicle-trips/close-trip.ts  — расход рейса (зарплата+суточные+топливо+прочее+FleetExpense)
lib/wialon/status.ts             — статус активности машины (moving/stopped/no_signal)
```

**Потребители** (Dashboard, Долги, Лист дня, Отчёты, Колокольчик, карточки заявки/машины) — каждый вызывает эти функции напрямую, ничего не пересчитывая по-своему. Это подтверждено вживую (Enterprise-аудит 01.08.2026): одинаковые фильтры → идентичные числа во всех разделах.

## Ключевые архитектурные решения

1. **Доход собственного транспорта** — только через явную связь `Trip.vehicleTripId` (не по датам). Заявка без рейса — «Ожидает привязки», не считается доходом, пока не привязана явно (`lib/vehicle-trips/attach-service.ts`).
2. **Топливо** — единственный источник истины: `VehicleTrip.calculatedFuelConsumedL`/`calculatedKm`/`fuelCostAmd` (из Wialon). `FleetExpense` (даже `expenseType='fuel'`) — отдельный поток, никогда не подмешивается.
3. **Присутствие машины на базе** — не Wialon-геозоны (сознательно не используются), а собственные зоны TMS (`CompanyZone`) + фоновая проверка каждые 5 минут по живым GPS-координатам (`lib/company-base/baseCheck.ts`).
4. **Задачи "Лист дня"** — вычисляются на лету при каждом запросе из текущего состояния Trip/VehicleTrip, ничего не хранится отдельно (нет отдельной модели "Задача").
5. **Мягкое удаление** — Vehicle/Driver/Carrier архивируются (`status='archived'`), не удаляются физически. Client — исключение, физическое удаление с защитой по количеству заявок.

## Инфраструктура (эта конкретная машина)

- Postgres — служба Windows `LevAV_Postgres`, данные в `C:\LevAV_DB\pgdata_localprod_utf8` (вне OneDrive-синхронизации, см. `docs/onedrive-migration.md` если требуется история инцидента).
- Next.js — процесс `npm start`, порт 3000, доступ по LAN (192.168.0.100).
- Бэкапы — `scripts/pg-backup-daily.ps1` (БД) + `scripts/attachments-backup-daily.ps1` (вложения) → `C:\Users\user\LevAv_Postgres_Backups\` + копия на Google Drive.
- Фоновые задачи планировщика Windows: `LevAV Company Base Check` (каждые 5 мин), `LevAV PostgreSQL Daily Backup` (13:00), `LevAV Wialon Mileage Sync` (06:00), `LevAV Attachments Daily Backup` (13:15) — все под `LogonType=S4U` (без визуальных артефактов на рабочем столе).

## Схема потока данных (упрощённо)

```
Клиент создаёт заявку (Trip)
        │
        ▼
Собственный транспорт? ──да──▶ Rейс (VehicleTrip) привязывается через Trip.vehicleTripId
        │ нет (экспедиция)              │
        ▼                               ▼
carrierRateAmd/carrierId          Wialon → пробег/топливо на VehicleTrip
        │                               │
        └───────────────┬───────────────┘
                         ▼
              Expense (перевыставляемые расходы, __carrier__ маркер)
                         ▼
              lib/finance/formulas.ts → profitAmd, долг, кассовый разрыв
                         ▼
     Dashboard / Долги / Лист дня / Отчёты / Карточки — читают ОДНИ И ТЕ ЖЕ числа
```
