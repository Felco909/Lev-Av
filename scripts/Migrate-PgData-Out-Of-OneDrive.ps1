<#
.SYNOPSIS
  Move PostgreSQL PGDATA from the project tree (e.g. OneDrive) to C:\LevAV_DB.

.DESCRIPTION
  Does not change DATABASE_URL, Prisma, API, or UI.
  Optional pg_dump via pg-backup-daily.ps1 before stop.
  pg_ctl stop, robocopy to new path, pg_ctl start, pg_isready.
  Patches PG_DATA in PRODUCTION_START.bat, HEALTH_CHECK.bat, SAFE_SHUTDOWN.bat.

  Rollback (manual): stop postgres on new path; restore old folder name;
  set PG_DATA back in bat files; pg_ctl start -D <old path>.

.PARAMETER DryRun
  Print paths and exit without changing anything.

.PARAMETER SkipLogicalBackup
  Do not run pg-backup-daily.ps1.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Migrate-PgData-Out-Of-OneDrive.ps1 -ProjectDir "C:\Users\user\OneDrive\Desktop\LevAV_MAIN_SYSTEM"
#>
param(
  [string]$ProjectDir = '',
  [string]$NewPgData = 'C:\LevAV_DB\pgdata_localprod_utf8',
  [string]$PgPort = '5434',
  [switch]$DryRun,
  [switch]$SkipLogicalBackup,
  [switch]$SkipLauncherPatch
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "[Migrate-PgData] $Message" -ForegroundColor Cyan
}

if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
  $ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}
else {
  $ProjectDir = (Resolve-Path -LiteralPath $ProjectDir).Path
}

$oldPgData = Join-Path $ProjectDir 'LOCAL_DB_RUNTIME\pgdata_localprod_utf8'
$pgBin = Join-Path $ProjectDir 'LOCAL_DB_RUNTIME\pgsql_full\pgsql\bin'
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
$pgIsready = Join-Path $pgBin 'pg_isready.exe'
$pgLog = Join-Path $ProjectDir 'LOCAL_DB_RUNTIME\pg_local_utf8.log'
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$archiveName = "pgdata_localprod_utf8__onedrive_archive_$stamp"

$launcherFiles = @(
  (Join-Path $ProjectDir 'PRODUCTION_START.bat'),
  (Join-Path $ProjectDir 'HEALTH_CHECK.bat'),
  (Join-Path $ProjectDir 'SAFE_SHUTDOWN.bat')
)

Write-Step "ProjectDir: $ProjectDir"
Write-Step "Old PGDATA: $oldPgData"
Write-Step "New PGDATA: $NewPgData"
Write-Step "PostgreSQL port: $PgPort"

if (-not (Test-Path -LiteralPath (Join-Path $pgBin 'pg_ctl.exe'))) {
  throw "pg_ctl not found: $pgCtl"
}

# Already migrated: old path gone, new cluster present
if (-not (Test-Path -LiteralPath (Join-Path $oldPgData 'PG_VERSION'))) {
  if (Test-Path -LiteralPath (Join-Path $NewPgData 'PG_VERSION')) {
    Write-Step "Old PGDATA missing, new PGDATA present - migration likely done. Exiting."
    exit 0
  }
  throw "PG_VERSION not found under old or new path. Check paths and PostgreSQL install."
}

if ($DryRun) {
  Write-Step "DRY RUN: no stop, copy, or start."
  exit 0
}

$newParent = Split-Path -Parent $NewPgData
if (-not (Test-Path -LiteralPath $newParent)) {
  Write-Step "Creating directory: $newParent"
  New-Item -ItemType Directory -Path $newParent -Force | Out-Null
}

if ((Test-Path -LiteralPath $NewPgData) -and (Test-Path -LiteralPath (Join-Path $NewPgData 'PG_VERSION'))) {
  throw "Target folder already contains a cluster (PG_VERSION). Choose another -NewPgData or remove after you are sure."
}

if (-not $SkipLogicalBackup) {
  $backupScript = Join-Path $PSScriptRoot 'pg-backup-daily.ps1'
  if (-not (Test-Path -LiteralPath $backupScript)) {
    throw "Backup script not found: $backupScript"
  }
  Write-Step "Logical backup (pg_dump) via pg-backup-daily.ps1 ..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File $backupScript -ProjectDir $ProjectDir
  if ($LASTEXITCODE -ne 0) {
    throw "pg-backup-daily.ps1 exited with $LASTEXITCODE. Fix error or retry with -SkipLogicalBackup at your risk."
  }
}
else {
  Write-Step "Skipping logical backup (-SkipLogicalBackup)."
}

Write-Step "Stopping PostgreSQL (pg_ctl stop -m fast) ..."
& $pgCtl -D $oldPgData stop -m fast 2>&1 | Out-Null
Start-Sleep -Seconds 2

$tries = 0
while ($tries -lt 30) {
  & $pgIsready -h localhost -p $PgPort -d levav_prod_local 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { break }
  $tries++
  Start-Sleep -Seconds 1
}
if ($tries -ge 30) {
  throw "PostgreSQL still answers on port $PgPort after stop. Stop processes manually and retry."
}

Write-Step "Robocopy: $oldPgData -> $NewPgData"
if (-not (Test-Path -LiteralPath $NewPgData)) {
  New-Item -ItemType Directory -Path $NewPgData -Force | Out-Null
}
$robolog = Join-Path $env:TEMP "levav_robocopy_pgdata_$stamp.log"
$rc = Start-Process -FilePath 'robocopy.exe' -ArgumentList @(
  $oldPgData, $NewPgData, '/E', '/COPY:DAT', '/DCOPY:DAT', '/R:2', '/W:5', '/NP', '/NDL', '/NFL', "/LOG:$robolog"
) -Wait -PassThru
$robocode = $rc.ExitCode
if ($robocode -gt 7) {
  throw "robocopy failed with exit code $robocode (see $robolog)"
}

if (-not (Test-Path -LiteralPath (Join-Path $NewPgData 'PG_VERSION'))) {
  throw "PG_VERSION missing under new path after robocopy."
}

$oldVer = Get-Content -LiteralPath (Join-Path $oldPgData 'PG_VERSION') -Raw -Encoding UTF8
$newVer = Get-Content -LiteralPath (Join-Path $NewPgData 'PG_VERSION') -Raw -Encoding UTF8
if ($oldVer.Trim() -ne $newVer.Trim()) {
  throw "PG_VERSION mismatch between old and new. Copy is suspect."
}

Write-Step "Starting PostgreSQL from new data directory..."
if (-not (Test-Path -LiteralPath $pgLog)) {
  New-Item -ItemType File -Path $pgLog -Force | Out-Null
}
& $pgCtl -D $NewPgData -l $pgLog -o "-p $PgPort" start 2>&1 | Out-Null
Start-Sleep -Seconds 3

& $pgIsready -h localhost -p $PgPort -d levav_prod_local 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "pg_isready failed after start on new PGDATA. Check $pgLog"
}

if (-not $SkipLauncherPatch) {
  $newLineBat = "set `"PG_DATA=$NewPgData`""
  foreach ($f in $launcherFiles) {
    if (-not (Test-Path -LiteralPath $f)) {
      Write-Warning "Launcher file missing, skip: $f"
      continue
    }
    $raw = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::Default)
    $patProd = 'set "PG_DATA=%PROJECT_DIR%\LOCAL_DB_RUNTIME\pgdata_localprod_utf8"'
    $patRel = 'set "PG_DATA=%PROJECT_DIR%LOCAL_DB_RUNTIME\pgdata_localprod_utf8"'
    if ($raw.Contains($patProd)) {
      $raw = $raw.Replace($patProd, $newLineBat)
    }
    elseif ($raw.Contains($patRel)) {
      $raw = $raw.Replace($patRel, $newLineBat)
    }
    else {
      $alreadyMarker = 'set "PG_DATA=' + $NewPgData + '"'
      if ($raw.Contains($alreadyMarker)) {
        Write-Step "Already updated: $f"
      }
      else {
        Write-Warning "Expected PG_DATA line not found in $f - edit manually."
        continue
      }
    }
    [System.IO.File]::WriteAllText($f, $raw, [System.Text.Encoding]::Default)
    Write-Step "Updated launcher: $f"
  }
}

$archivePath = Join-Path (Split-Path -Parent $oldPgData) $archiveName
if (-not $SkipLauncherPatch) {
  Write-Step "Renaming old directory (no delete): $archiveName"
  if (Test-Path -LiteralPath $archivePath) {
    throw "Archive path already exists: $archivePath"
  }
  Rename-Item -LiteralPath $oldPgData -NewName $archiveName
}
else {
  Write-Warning "Old directory not renamed (-SkipLauncherPatch). After you fix bat files, rename manually: $oldPgData -> $archiveName"
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Previous PGDATA: $oldPgData"
Write-Host "Active PGDATA:   $NewPgData"
if (-not $SkipLauncherPatch) {
  Write-Host "Archive folder:  $archivePath"
}
else {
  Write-Host "Archive folder:  (not created - see warning above)"
}
if ($SkipLogicalBackup) {
  Write-Host "Logical backup: skipped (-SkipLogicalBackup)."
}
else {
  Write-Host "Logical backup: OK. See pg_backup.log under backup root from pg-backup-daily.ps1."
}
Write-Host "Robocopy log:    $robolog"
exit 0
