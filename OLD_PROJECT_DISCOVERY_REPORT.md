# Old Project Discovery Report (Lev&Av TMS)

## Scope
Read-only discovery was performed across Cursor metadata, user folders, and common archive locations. No files were deleted or modified.

## 1) Was an old project found?
- **No second active old workspace** was found on disk as a runnable Next.js project.
- Historical traces of older workspaces were found in Cursor metadata, but those paths are currently missing on disk.

## 2) Where historical workspaces were referenced
From Cursor storage (`globalStorage/storage.json`) these historical workspace paths were recorded:
- `C:\Users\user\Desktop\LevAv-TMS` (missing)
- `C:\Users\user\Desktop\Lev&Av LLC TMS` (missing)
- `C:\TMS_SAFE\LevAv-TMS` (missing)
- `C:\TMS_SAFE\LevAv-TMS\tms_system_unpacked\nextjs_space\app\(app)\test-pdf` (missing)
- `C:\Users\user\LevAv-TMS-local` (missing)
- `C:\Users\user\OneDrive\Desktop\LevAV_MAIN_SYSTEM` (**exists**, current active project)

## 3) Cursor workspace/session history findings
- Current workspace storage points to `C:\Users\user\OneDrive\Desktop\LevAV_MAIN_SYSTEM`.
- Additional workspace storage entry points to `C:\Users\user\.cursor` (tooling/internal workspace).
- Old relevant chat sessions were found in transcripts:
  - [PC readiness audit](6d9e8924-35a9-4928-88ee-bc3426a4fa56)
  - [TMS path investigation](4a90d110-e75d-4300-8b13-b2d7940550dc)

## 4) Search results for old project artifacts

### Old app/prisma/package/start/next projects
- `package.json` found only in:
  - current project root
  - backup copies (`BACKUP_RESTORE_POINT`, `DAILY_BACKUP/...`)
- `prisma/schema.prisma` found only in:
  - current project root
  - backup copy (`BACKUP_RESTORE_POINT`)
- `start.bat` found only in:
  - current project root
  - backup copy (`DAILY_BACKUP/...`)
- `next.config.js` found only in current project root.

### Downloads / Desktop / Documents / archives
- `Downloads`: no `zip/rar/7z`, no TMS package files found.
- `OneDrive\Desktop\TMS-Lev&Av`: found only `backup (1).sql`.
- `Documents` / `OneDrive\Documents`: path not present in this profile.

## 5) Old tasks / reports / plan files
- No separate old `plan/report` markdown sets were found outside current workspace and backup exports.
- Historical task context is recoverable from Cursor transcripts listed above.

## 6) Can business logic be restored?
- **Yes, partially to fully**, from the following sources:
  1. Current active project: `C:\Users\user\OneDrive\Desktop\LevAV_MAIN_SYSTEM`
  2. SQL backup artifact: `C:\Users\user\OneDrive\Desktop\TMS-Lev&Av\backup (1).sql`
  3. Cursor transcript history links above (task intent and implementation trail)
  4. Local backup folders inside current project:
     - `BACKUP_RESTORE_POINT`
     - `SYSTEM_BACKUP_INFO`
     - `DAILY_BACKUP`

## 7) What data is preserved now
- Active codebase (current production workspace)
- Git history inside current workspace
- SQL backup dump (`backup (1).sql`)
- Infrastructure backups and project tree exports
- Cursor conversation and edit-trace metadata

## Conclusion
- A separate old runnable Lev&Av TMS workspace was **not** found on disk.
- Historical evidence strongly indicates old workspace paths existed before but are currently absent.
- Recovery of business logic is still feasible from current codebase + SQL dump + transcript history.
