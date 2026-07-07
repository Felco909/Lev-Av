# Lev&AV LLC TMS - Business Logic Recovery Map

## Data Sources Used
- Current workspace code: `LevAV_MAIN_SYSTEM` (`app/`, `components/`, `lib/`, `prisma/`)
- Database backup: `C:\Users\user\OneDrive\Desktop\TMS-Lev&Av\backup (1).sql`
- Backup folders: `BACKUP_RESTORE_POINT/`, `SYSTEM_BACKUP_INFO/`, `DAILY_BACKUP/`
- Cursor historical metadata/transcripts (available traces)

No destructive actions were performed.

---

## 1) Recovery Coverage Summary

### Ready (implemented and mapped in UI + API + DB schema)
- **Заявки (Trips)**: pages + full CRUD API + history + attachments + close + stats + calendar
- **Собственные рейсы (Vehicle Trips)**: dedicated pages/API + linkage with trips/fleet expenses
- **Экспедиция**: `tripType` split (`own_transport` / `expedition`) in UI, API, schema, analytics
- **Финансы**: payments, debts, reconciliation, profit, currency revaluation, paid statuses
- **Контрагенты**: clients, carriers, suppliers + contacts/templates
- **Водители и машины**: drivers, vehicles, driver history, maintenance/fuel/tire/expiry
- **Отчёты/аналитика**: dashboard, reports, XLSX/PDF exports, route/client/driver analytics
- **Auth/Login**: login page + NextAuth credentials + middleware protection
- **Dashboard**: API and page present with debt/profit and KPI aggregation

### Partially Ready (works but has external/runtime dependencies)
- **Счета/акты/документы**:
  - generation routes exist (`/api/documents/generate`, `/api/trips/[id]/generate-docs`)
  - supports PDF/DOCX/XLSX and numbering
  - depends on external PDF service token and template storage availability
- **Файлы/вложения**:
  - upload and attachment APIs exist
  - depends on configured S3/cloud credentials and bucket availability

### Missing / Not Found as standalone module
- Separate offline-only document rendering engine (without external provider) not found.
- Separate module for explicit production/test DB switching UI not found (managed by env/config).

---

## 2) Module-by-Module Recovery Status (Requested Business Areas)

### Заявки
- **Status:** Ready
- Evidence:
  - pages: `app/(app)/trips/...`
  - API: `app/api/trips/*`
  - DB: `trips`, `expenses`, `trip_history`, `trip_attachments`

### Собственные рейсы
- **Status:** Ready
- Evidence:
  - page: `app/(app)/vehicle-trips/page.tsx`
  - API: `app/api/vehicle-trips/*`
  - DB: `vehicle_trips`, `fleet_expenses`

### Экспедиция
- **Status:** Ready
- Evidence:
  - `tripType` and carrier economics in `Trip` model + trips/report APIs
  - DB fields: `carrier_rate*`, `carrier_payment_*`

### Финансы
- **Status:** Ready
- Evidence:
  - APIs: `payments`, `debts`, `reports/reconciliation`, dashboard aggregates
  - DB: `payments`, payment status/amount fields in `trips`

### Счета / Акты
- **Status:** Partially Ready
- Evidence:
  - APIs: `documents/generate`, `trips/[id]/generate-docs`
  - libs: `document-templates`, `doc-generators`, `doc-numbering`
  - dependency: external PDF conversion endpoint + env tokens/templates

### Контрагенты
- **Status:** Ready
- Evidence:
  - APIs: `clients`, `carriers`, `suppliers`, client contacts/templates
  - DB: `clients`, `client_contacts`, `carriers`, `suppliers`

### Водители
- **Status:** Ready
- Evidence:
  - pages/API: drivers + analytics
  - DB: `drivers`, `driver_vehicle_history`

### Машины
- **Status:** Ready
- Evidence:
  - pages/API: vehicles + availability + maintenance/fuel/tire/expiry
  - DB: `vehicles`, `maintenances`, `fuel_records`, `tire_sets`, `document_expiries`

### Отчёты
- **Status:** Ready
- Evidence:
  - pages/API: `reports`, `dashboard`, route/client/driver analytics
  - exports: pdf/xlsx endpoints

### Auth/Login
- **Status:** Ready
- Evidence:
  - UI: `app/login/page.tsx`
  - API: `app/api/auth/[...nextauth]`, `app/api/auth/login`, `app/api/signup`
  - config: `lib/auth-options.ts`, `middleware.ts`

### Dashboard
- **Status:** Ready
- Evidence:
  - page: `app/(app)/dashboard/page.tsx`
  - API: `app/api/dashboard/route.ts`, plus pdf/xlsx variants

---

## 3) Prisma Models vs SQL Backup Tables

Backup SQL includes table definitions/data for all core business entities:
- `users`, `clients`, `client_contacts`, `carriers`
- `trips`, `expenses`, `payments`, `trip_history`, `trip_attachments`
- `vehicles`, `drivers`, `vehicle_trips`, `fleet_expenses`, `driver_vehicle_history`
- `maintenances`, `fuel_records`, `tire_sets`, `document_expiries`
- `route_templates`, `service_regulations`, `service_records`
- `suppliers`, `part_purchases`, `part_payments`, `part_attachments`
- `document_templates`, `settings`

Mapping quality:
- **High match** between Prisma `@@map(...)` names and SQL `public.*` tables.
- This indicates business entities are substantially restored and aligned between code and backup.

---

## 4) What Can Be Recovered from SQL Backup

Directly recoverable business data (if restored into compatible Postgres):
- Clients/carriers/suppliers master data
- Trips and payment/debt history
- Vehicle/driver operational history
- Fleet expenses and maintenance records
- Document templates/attachments metadata
- User accounts and roles

Not inside SQL (or externalized):
- Actual cloud files in object storage (only paths are in DB)
- Runtime secrets/env values
- Some external integration state (PDF service, cloud auth)

---

## 5) Likely Previously Implemented Tasks (from code + metadata traces)

High-probability already implemented earlier:
- Hard split between own transport and expedition flows
- Debt/payment tracking on both client and carrier sides
- Currency conversion to AMD + exchange difference accounting
- Document numbering/templates and multi-format generation
- Fleet operations modules (fuel, maintenance, tire, expiry, vehicle trips)
- Dashboard/reporting exports (PDF/XLSX)
- Operational startup/recovery scripts and production safety docs

---

## 6) Criticality Ranking (Most Critical Modules)

1. **Auth + middleware access control**
2. **Trips core + payment/debt logic**
3. **Prisma/PostgreSQL data integrity**
4. **Document generation + numbering**
5. **Uploads/attachments cloud integration**
6. **Dashboard/reports for operational visibility**
7. **Fleet modules (vehicle trips/maintenance/fuel)**

---

## 7) Dependency Map (System Interdependencies)

- **Auth Layer**
  - `login page` -> `next-auth` API -> `User` model -> middleware-protected routes

- **Core Ops**
  - `Trips UI/API` -> `Trip` model
  - `Trip` depends on `Client`, optional `Contact`, optional `Vehicle/Driver` or `Carrier`
  - `Expense` + `Payment` aggregate into profit/debt status

- **Own Transport / Expedition**
  - `own_transport` -> `Vehicle`, `Driver`, `VehicleTrip`, `FleetExpense`
  - `expedition` -> `Carrier`, carrier rates/payments

- **Finance & Reporting**
  - `payments/debts/dashboard/reports` consume `Trip`, `Payment`, `Expense`, `FleetExpense`
  - currency conversions depend on exchange-rate fields and revaluation endpoints

- **Documents**
  - docs APIs -> `Trip + Client/Carrier` data -> template libs -> output (PDF/DOCX/XLSX)
  - PDF path depends on external conversion service/token

- **Uploads**
  - upload presign API -> cloud storage config -> attachment tables (`trip_attachments`, `part_attachments`, `document_templates`)

- **Master Data**
  - `Clients/Carriers/Suppliers/Drivers/Vehicles` feed trips, finance, analytics, reports

---

## Final Recovery Assessment
- **Overall business logic recovery state:** **High (production-grade core present)**
- **Primary gaps:** external integration dependencies (cloud/PDF service) and operational env correctness.
- **Recovery from historical artifacts:** feasible using current codebase + SQL backup + existing backup folders + metadata traces.
