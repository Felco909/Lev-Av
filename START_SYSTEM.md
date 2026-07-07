# Lev&AV LLC TMS - Start Guide

## Main System Location
- Main workspace path: `C:\Users\user\OneDrive\Desktop\LevAV_MAIN_SYSTEM`
- Start script: `start.bat` in the project root

## How To Start
1. Open project root folder `LevAV_MAIN_SYSTEM`.
2. Run `start.bat`.
3. Script opens `http://localhost:3000` and starts `npm run dev`.

## DATABASE_URL Location
- Database connection string is stored in local environment file: `.env`
- Prisma reads it via `prisma/schema.prisma` datasource `url = env("DATABASE_URL")`

## Folders/Files You Must Not Delete
- `app/`
- `components/`
- `lib/`
- `prisma/`
- `scripts/`
- `package.json`
- `package-lock.json`
- `.env` (local runtime config)
- `.git/` (restore history)

## Backup Restore Point Location
- Git restore commit: `d85ad8e` (`Stable restore point - Lev&AV LLC TMS`)
- Files backup folder: `BACKUP_RESTORE_POINT/`
- System snapshot folder: `SYSTEM_BACKUP_INFO/`

## Recovery After Failure
1. Stop running Node/Next processes.
2. Open project root.
3. Validate `.env` exists and has correct `DATABASE_URL`.
4. Run `npm install`.
5. Run `npx prisma generate`.
6. Start with `start.bat` (or `npm run dev`).
7. If code regression occurs, rollback to restore commit:
   - `git checkout d85ad8e`
   - or create a rollback branch from this commit.

## Safety Notes
- Do not run destructive Prisma commands (`migrate reset`, dropping DB, etc.) on production connection.
- Keep `.env` and `.env.local` out of Git.
