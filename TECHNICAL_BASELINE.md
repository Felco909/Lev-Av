# Lev&AV LLC TMS - Technical Baseline

## Current Architecture
- Application type: single Next.js App Router project (frontend + backend in one workspace).
- Frontend UI routes live in `app/(app)/...`.
- Backend API routes live in `app/api/...` as Next.js route handlers.
- Authentication uses NextAuth credentials flow (`app/api/auth/[...nextauth]/route.ts`, `lib/auth-options.ts`).
- File/document operations use S3-compatible storage helpers in `lib/s3.ts`.

## Next.js Structure
- Root layout and global bootstrapping: `app/layout.tsx`
- Root redirect logic: `app/page.tsx`
- Auth page: `app/login/page.tsx`
- Protected business pages: `app/(app)/...`
- API surface: `app/api/**/route.ts`
- Middleware protection: `middleware.ts`

## Data Layer: Prisma + PostgreSQL
- Prisma schema: `prisma/schema.prisma`
- ORM client: `@prisma/client`
- Datasource provider: PostgreSQL (`provider = "postgresql"`)
- DB connection source: `DATABASE_URL` from `.env`
- Important: current `DATABASE_URL` points to external PostgreSQL, not local SQLite.

## How System Starts
- Development start command: `npm run dev`
- Stable Windows launcher: `start.bat`
- `start.bat` validates project root, checks port `3000`, opens browser, then starts dev server.

## Critically Important Files
- `package.json`
- `package-lock.json`
- `next.config.js`
- `middleware.ts`
- `prisma/schema.prisma`
- `.env` (local secrets/runtime config, never commit)
- `start.bat`

## Folders You Must Not Touch
- `app/`
- `components/`
- `lib/`
- `prisma/`
- `scripts/`
- `.git/`
- `BACKUP_RESTORE_POINT/`
- `SYSTEM_BACKUP_INFO/`

## Safe Update Process
1. Ensure working tree is clean or intentionally staged.
2. Create a backup commit before edits.
3. Validate environment files are present (`.env`) and not staged.
4. Apply minimal scoped changes.
5. Run health checks:
   - `npm run dev`
   - `npx tsc --noEmit`
   - `npm run build`
   - `npm run lint` (known lint rules may still require manual handling)
6. Commit with clear message.

## Backup Before Changes
- Git restore baseline commit is the primary rollback mechanism.
- Keep file snapshots in:
  - `BACKUP_RESTORE_POINT/`
  - `SYSTEM_BACKUP_INFO/`
- Before major edits, refresh these folders and create a new commit.
