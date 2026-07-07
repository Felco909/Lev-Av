# Lev&AV LLC TMS — Desktop Launcher Report

## Scope
Production desktop launcher hardening for current workspace only:
- Workspace: `C:\Users\user\OneDrive\Desktop\LevAV_MAIN_SYSTEM`
- Main launcher target: `PRODUCTION_START.bat`

## Implemented Changes

### 1) Desktop Shortcut Created
- New shortcut: `C:\Users\user\OneDrive\Desktop\Lev&AV LLC TMS.lnk`
- Target: `C:\Users\user\OneDrive\Desktop\LevAV_MAIN_SYSTEM\PRODUCTION_START.bat`
- Working directory: `C:\Users\user\OneDrive\Desktop\LevAV_MAIN_SYSTEM`
- Custom icon: `%SystemRoot%\System32\shell32.dll,44`
- Description: `Lev&AV LLC TMS production launcher`

### 2) Production Launcher Hardening (`PRODUCTION_START.bat`)
- Added strict workspace-path check (expected production path only).
- Kept mandatory preflight checks:
  - `package.json`
  - `app/`
  - `.env`
  - `node`
  - `npm`
  - port `3000`
- Added conflict warning for foreign `node/next dev` processes.
- Added hint to run `SAFE_SHUTDOWN.bat` when conflict or port block is detected.
- Added safe startup logging to:
  - `C:\Users\user\OneDrive\Desktop\LevAV_MAIN_SYSTEM\.runtime\production_start_YYYYMMDD_HHMMSS.log`

### 3) Legacy Desktop Launcher Neutralization
- Existing old desktop shortcut detected:
  - `LevAV LLC TMS (LOCAL).lnk`
- It was redirected to the same production target (`PRODUCTION_START.bat`) to prevent accidental launch of older paths.

## Verification Results

### Desktop Shortcuts
- Present:
  - `Lev&AV LLC TMS.lnk` (new production button)
  - `LevAV LLC TMS (LOCAL).lnk` (legacy, now redirected to production)

### Old Workspace Risk Check
- Desktop folder contains legacy directory name: `TMS-Lev&Av`
- No `.bat` launchers found inside that legacy folder during this check.

### Conflicting `start.bat` Check
- Found:
  - `LevAV_MAIN_SYSTEM/start.bat` (current workspace helper)
  - `LevAV_MAIN_SYSTEM/DAILY_BACKUP/.../start.bat` (backup copy, non-active)
- No evidence that the new desktop production shortcut points to any of these; it points only to `PRODUCTION_START.bat`.

### Port/Service Snapshot
- At check time, no active listener confirmed on port `3000`.
- If port becomes busy, launcher now prints PID + warning + `SAFE_SHUTDOWN.bat` hint.

## Safety Notes
- No production data deleted.
- No DB reset/migrate reset executed.
- No business logic changed.
- Only launcher infrastructure and shortcut configuration were changed.
