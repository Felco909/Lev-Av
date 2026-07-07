# Lev&AV LLC TMS — Production Baseline Lock (Immutable Snapshot)

## Snapshot Metadata
- Workspace: `C:\Users\user\OneDrive\Desktop\LevAV_MAIN_SYSTEM`
- Git commit (baseline): `d85ad8ee2430be2fd494a06b53b637a9eada1a98`
- Working tree at capture: has uncommitted infra/docs files (no destructive actions)
- Node: `v22.22.0`
- npm: `10.8.2`
- Prisma CLI: `6.7.0`
- Prisma Client: `6.7.0`

---

## 1) Environment Inventory (`.env`)

Detected env keys (values intentionally not repeated in this lock):
- `NEXTAUTH_SECRET`
- `ABACUSAI_API_KEY`
- `AWS_PROFILE`
- `AWS_REGION`
- `AWS_BUCKET_NAME`
- `AWS_FOLDER_PREFIX`
- `DATABASE_URL`

Environment characteristics:
- Auth secret configured
- External PDF token configured
- Cloud storage configuration configured
- `DATABASE_URL` currently points to external PostgreSQL host (not localhost)

---

## 2) Prisma Inventory

- Prisma schema file: `prisma/schema.prisma`
- Provider: `postgresql`
- Datasource URL source: `env("DATABASE_URL")`
- Prisma model scope: core logistics + finance + fleet + docs + auth

### DB Schema Hash
- Source hashed: `prisma/schema.prisma`
- SHA256: `A959D3EFA8B3C4C08B63EE95CA785B6A306A0672C34283BF0556AC6C6A38D8F4`

---

## 3) Routes and Pages Inventory

### API Routes
- Route handlers found in `app/api/**/route.ts`: **75**
- Coverage includes:
  - trips, vehicle-trips, payments, debts, reports, dashboard
  - documents/templates/uploads
  - clients/carriers/suppliers/drivers/vehicles
  - maintenance/fuel/expiry/tires/service-records
  - auth/signup/search/settings/analytics/stats

### App Pages
- Pages found in `app/(app)/**/page.tsx`: **25**
- Main office modules present:
  - dashboard, trips, vehicle-trips, documents, reports, debts
  - clients, carriers, drivers, vehicles
  - maintenance, fuel, expiry, statistics, analytics, settings

---

## 4) Package / Version Inventory

From `package.json`:
- App runtime: `next@14.2.28`, `react@18.2.0`, `react-dom@18.2.0`
- Auth: `next-auth@4.24.11`, `@next-auth/prisma-adapter@1.0.7`
- ORM: `prisma@6.7.0`, `@prisma/client@6.7.0`
- Documents: `docx`, `docxtemplater`, `exceljs`
- Storage SDKs: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@azure/storage-blob`
- Lint/TS: `eslint@8.57.0`, `eslint-config-next@14.2.28`, `typescript@5.2.2`
- Package manager pin: `npm@10.8.2`

---

## 5) Startup / Operations Scripts Inventory

Batch scripts detected in project root:
- `start.bat`
- `PRODUCTION_START.bat`
- `SAFE_SHUTDOWN.bat`
- `HEALTH_CHECK.bat`
- `PROJECT_RECOVERY.bat`
- `DAILY_BACKUP.bat`

Operational docs already present:
- `START_SYSTEM.md`
- `TECHNICAL_BASELINE.md`
- `SAFE_UPDATE_RULES.md`
- `FINAL_PRODUCTION_LOCK.md`
- `FINAL_SYSTEM_REPORT.md`
- `OFFLINE_READINESS_REPORT.md`
- `BUSINESS_LOGIC_RECOVERY_MAP.md`

---

## 6) Active Services / Runtime State at Capture

### Processes
- Running `node.exe` processes detected: 3
- No confirmed active `postgres.exe` process from tasklist snapshot

### Listening Ports (snapshot)
- Port `3000`: not listening at capture time
- Common OS/service listeners observed: `135`, `445`, `5040`, `7680`, dynamic `49664+`

Interpretation:
- App server was not actively listening on 3000 during this snapshot.
- System-level services are active as expected.

---

## 7) External Dependency Baseline

Configured external integrations at snapshot:
- External PostgreSQL endpoint via `DATABASE_URL`
- Abacus PDF API via `ABACUSAI_API_KEY`
- S3 cloud upload/download path via AWS env
- External script/font dependencies present in app stack (see offline report)

---

## 8) Baseline Integrity Notes

- This file is an inventory lock record only.
- No business logic or DB content was altered during capture.
- Use together with:
  - `SYSTEM_BACKUP_INFO/`
  - `BACKUP_RESTORE_POINT/`
  - Git commit `d85ad8ee...`
for rollback/recovery operations.
