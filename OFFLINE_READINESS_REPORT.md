# Lev&AV LLC TMS - Offline / Local Infrastructure Audit

## Audit Scope
- Read-only infrastructure audit (no deletes, no resets, no business-logic changes)
- Sources reviewed:
  - current workspace code/config
  - `.env`
  - API/pages/modules
  - cloud/storage/document integrations

---

## 1) Fully Local Modules

These modules are implemented to run locally **if DB and env are local**:
- Trips workflow (`trips`, `vehicle-trips`, statuses, history, costs)
- Fleet operations (vehicles, drivers, fuel, maintenance, tires, expiry)
- Counterparties (clients, carriers, suppliers, contacts)
- Finance core (payments, debts, reconciliation calculations)
- Reports/dashboard logic (server-side aggregation)
- Auth flow with local credentials (`next-auth` + `CredentialsProvider`)

---

## 2) Cloud / External Dependencies Found

### Critical External
1. **Database connection (currently external PostgreSQL)**
   - `DATABASE_URL` in `.env` points to remote host (`db-...hosteddb.reai.io`)
2. **PDF generation service**
   - `/api/trips/[id]/generate-docs` uses `https://apps.abacus.ai/api/*`
   - requires `ABACUSAI_API_KEY`
3. **File storage / uploads**
   - S3 presigned upload/download in `lib/s3.ts`, `/api/upload/presigned`
   - requires `AWS_*` env and reachable object storage
4. **External script in layout**
   - `app/layout.tsx` includes `<script src="https://apps.abacus.ai/chatllm/appllm-lib.js" />`

### Medium External
5. **Google Fonts at build/runtime path**
   - `next/font/google` in `app/layout.tsx` (DM Sans / Plus Jakarta / JetBrains Mono)
6. **npm registry dependency retrieval**
   - needed for fresh install/update (`package-lock` resolves to `registry.npmjs.org`)

### Not Found / Minimal
- SMTP/email providers: not found in code
- OAuth social auth providers (Google/GitHub/etc): not used (credentials auth only)
- External analytics SDKs (Sentry/Datadog/Amplitude/Mixpanel): not found as active integrations

---

## 3) What Requires Internet vs Works Offline

### Requires Internet (current architecture)
- Remote DB access (current `DATABASE_URL`)
- PDF generation via Abacus API
- S3 upload/download presigned URL flow
- External script load from apps.abacus.ai
- Font fetch via `next/font/google` (especially on fresh build/cache)

### Works Locally (if dependencies localized)
- Business CRUD and calculations
- Auth (credentials against local DB)
- Most API routes and pages
- Dashboard/report logic

### What May Break Without Internet
- Document PDF generation (hard dependency on external API)
- Uploads/attachments if S3 unreachable
- App boot/layout warnings or script failures due to external script
- Initial font fetch on clean environment
- Any DB request if remote DB is unreachable

---

## 4) Prisma / PostgreSQL Localization Readiness

### Current
- Prisma provider: `postgresql` (schema is suitable for local Postgres)
- DB URL currently external (not LAN/local host)

### Can be fully localized?
- **Yes**. Schema and app architecture are compatible with local PostgreSQL.
- Required localization step: move `DATABASE_URL` to local/LAN PostgreSQL host.

### Mandatory env variables (core)
- `DATABASE_URL` (required)
- `NEXTAUTH_SECRET` (required)

### Mandatory env variables (feature-dependent)
- `ABACUSAI_API_KEY` (required only for current external PDF generation path)
- `AWS_REGION`, `AWS_BUCKET_NAME`, `AWS_FOLDER_PREFIX` (+ credentials) for S3 uploads

---

## 5) Safe-to-Disable vs Critical External Services

### Safe to disable first (for strict office-local mode)
- External chat script from `apps.abacus.ai` in layout
- External PDF API path (if replaced by local/offline doc generation fallback)
- S3 uploads (if replaced by local file storage policy)

### Critical to replace, not just disable
- Remote `DATABASE_URL` must be replaced with local/LAN Postgres
- Document workflow must have local fallback for PDF output
- Upload pipeline must switch to local/LAN storage backend

---

## 6) Prioritized Localization Plan (No Logic Rewrite)

1. **Database first**: local/LAN PostgreSQL and updated `DATABASE_URL`
2. **Documents second**: local PDF generation path (or DOCX/XLSX-only temporary office mode)
3. **Uploads third**: local NAS/share or local object storage replacement for S3
4. **UI hardening**: remove/guard external script include
5. **Fonts hardening**: move to local/self-hosted fonts to remove external fetch risk

---

## 7) LAN Readiness (3-5 Office PCs)

### Current readiness
- **Partial**: app can run in office, but key external dependencies remain.

### For stable LAN mode (3-5 PCs)
- Host DB on office server or dedicated local machine
- Run app on fixed LAN host/IP with service wrapper (pm2/nssm/windows service)
- Shared local storage for documents/uploads
- Unified env config per environment (no internet-only credentials required)
- Add internal backup/restore schedule for Postgres and critical configs

---

## 8) Production Office Setup Recommendations

- Keep one authoritative production workspace and one controlled backup pipeline
- Freeze dependency versions (already lockfile-based) and avoid internet-required reinstall during office hours
- Maintain offline-start checklist:
  - DB reachable on LAN
  - app host reachable from client PCs
  - uploads path writable
  - docs pipeline available without cloud API
- Document failover:
  - “No internet mode” behavior for docs/uploads
  - manual fallback export (DOCX/XLSX) if PDF service unavailable

---

## 9) Module Readiness Classification

### Production-ready (with local DB)
- Trips + expedition/own transport split
- Drivers/vehicles/fleet modules
- Payments/debts/reconciliation logic
- Dashboard/report aggregation
- Credentials auth and protected routing

### Requires infrastructure stabilization
- Documents/PDF (currently cloud-dependent API)
- Uploads/attachments (currently S3-dependent)
- External script and font loading hardening
- Full offline startup guarantees across clean machines

---

## Final Offline Readiness Verdict
- **Current state:** not fully offline-ready due to DB/API/storage/script external dependencies.
- **After targeted localization (DB + docs + storage):** system can be stabilized for reliable office-local operation without internet dependency.
