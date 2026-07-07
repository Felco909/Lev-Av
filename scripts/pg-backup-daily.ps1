<#
.SYNOPSIS
  Ежедневный pg_dump базы Lev&Av TMS (вне папки проекта).

.DESCRIPTION
  - Читает DATABASE_URL из .env в каталоге проекта
  - pg_dump в plain SQL (удобно psql -f при restore)
  - Имя: levav_prod_local_yyyyMMdd_HHmmss.sql
  - Хранит последние 30 файлов, старые удаляет
  - Лог: <корень бэкапов>\logs\pg_backup.log
  - pg_dump не блокирует работу (снимок MVCC); при очень большой БД возможна краткая нагрузка на IO.

  Переменные окружения (необязательно):
    LEVAV_PG_BACKUP_ROOT  - backup root (default D:\LevAv_Backups)
    LEVAV_KEEP_BACKUPS    - number of files to keep (default 30)
#>
param(
  [Parameter(Mandatory = $false)]
  [string]$ProjectDir = '',

  [string]$BackupRoot = $(if ($env:LEVAV_PG_BACKUP_ROOT) { $env:LEVAV_PG_BACKUP_ROOT } else { 'D:\LevAv_Backups' }),

  [int]$KeepCount = $(if ($env:LEVAV_KEEP_BACKUPS) { [int]$env:LEVAV_KEEP_BACKUPS } else { 30 })
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
  $scriptBase = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $ProjectDir = (Resolve-Path (Join-Path $scriptBase '..')).Path
}
$scriptsDir = Join-Path $ProjectDir 'scripts'
# If drive (e.g. D:) does not exist, use a folder outside the project under the user profile
if ($BackupRoot -match '^[a-zA-Z]:' ) {
  $driveLetter = $BackupRoot.Substring(0, 1)
  if (-not (Get-PSDrive -Name $driveLetter -ErrorAction SilentlyContinue)) {
    $BackupRoot = Join-Path $env:USERPROFILE 'LevAv_Postgres_Backups'
  }
}
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$dbSub = Join-Path $BackupRoot 'db'
$logDir = Join-Path $BackupRoot 'logs'
$logFile = Join-Path $logDir 'pg_backup.log'

function Write-Log([string]$Message) {
  if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

try {
  New-Item -ItemType Directory -Path $dbSub -Force | Out-Null
}
catch {
  Write-Log "ERROR: cannot create backup root: $BackupRoot - $($_.Exception.Message)"
  Write-Error $_
  exit 2
}

function Get-DatabaseUrlFromEnv([string]$proj) {
  $envPath = Join-Path $proj '.env'
  if (-not (Test-Path -LiteralPath $envPath)) {
    throw ".env not found: $envPath"
  }
  $line = Get-Content -LiteralPath $envPath -Encoding UTF8 |
    Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
    Select-Object -First 1
  if (-not $line) { throw 'DATABASE_URL not found in .env' }
  $raw = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim()
  if ($raw.StartsWith('"') -and $raw.EndsWith('"')) { $raw = $raw.Trim('"') }
  if ($raw.StartsWith("'") -and $raw.EndsWith("'")) { $raw = $raw.Trim("'") }
  if (-not $raw) { throw 'DATABASE_URL is empty' }
  # pg_dump does not accept Prisma's ?schema=public in the URI
  if ($raw.Contains('?')) { $raw = $raw.Split('?')[0] }
  return $raw
}

$pgDump = Join-Path $ProjectDir 'LOCAL_DB_RUNTIME\pgsql_full\pgsql\bin\pg_dump.exe'
if (-not (Test-Path -LiteralPath $pgDump)) {
  $pgDump = 'pg_dump'
}

try {
  $dbUrl = Get-DatabaseUrlFromEnv -proj $ProjectDir
}
catch {
  Write-Log "ERROR: $($_.Exception.Message)"
  Write-Error $_
  exit 3
}

$outFile = Join-Path $dbSub "levav_prod_local_$stamp.sql"
Write-Log "START backup -> $outFile (pg_dump=$pgDump)"

$errTemp = Join-Path $env:TEMP "levav_pgdump_err_$stamp.txt"
$outTemp = Join-Path $env:TEMP "levav_pgdump_out_$stamp.txt"
Remove-Item $errTemp, $outTemp -ErrorAction SilentlyContinue

# --clean + --if-exists: easier full restore after app stop (see POSTGRES_BACKUP_RESTORE.md)
$argList = @(
  '-F', 'p',
  '--clean',
  '--if-exists',
  '--no-owner',
  '--no-acl',
  '-f', $outFile,
  '--dbname', $dbUrl
)

try {
  $p = Start-Process -FilePath $pgDump -ArgumentList $argList -Wait -PassThru -NoNewWindow `
    -RedirectStandardError $errTemp -RedirectStandardOutput $outTemp
}
catch {
  Write-Log "ERROR: cannot start pg_dump: $($_.Exception.Message)"
  exit 4
}

if (Test-Path -LiteralPath $outTemp) {
  $so = (Get-Content -LiteralPath $outTemp -Raw -ErrorAction SilentlyContinue)
  if ($null -ne $so -and $so.Trim().Length -gt 0) { Write-Log "pg_dump stdout: $($so.Trim())" }
}
if (Test-Path -LiteralPath $errTemp) {
  $se = (Get-Content -LiteralPath $errTemp -Raw -ErrorAction SilentlyContinue)
  if ($null -ne $se -and $se.Trim().Length -gt 0) { Write-Log "pg_dump stderr: $($se.Trim())" }
}
Remove-Item $errTemp, $outTemp -ErrorAction SilentlyContinue

if ($p.ExitCode -ne 0) {
  Write-Log "ERROR: pg_dump exit code $($p.ExitCode)"
  if (Test-Path -LiteralPath $outFile) { Remove-Item -LiteralPath $outFile -Force -ErrorAction SilentlyContinue }
  exit 4
}

if (-not (Test-Path -LiteralPath $outFile)) {
  Write-Log 'ERROR: dump file missing after pg_dump'
  exit 5
}

$len = (Get-Item -LiteralPath $outFile).Length
if ($len -lt 2048) {
  Write-Log "ERROR: dump file too small ($len bytes), treating as failure"
  Remove-Item -LiteralPath $outFile -Force -ErrorAction SilentlyContinue
  exit 6
}

Write-Log "OK dump written ($len bytes)"

# Prune old files: keep newest $KeepCount by filename
$pattern = 'levav_prod_local_*.sql'
$all = Get-ChildItem -LiteralPath $dbSub -Filter $pattern -File -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending
if ($all.Count -gt $KeepCount) {
  $toRemove = $all | Select-Object -Skip $KeepCount
  foreach ($f in $toRemove) {
    try {
      Remove-Item -LiteralPath $f.FullName -Force
      Write-Log "PRUNE removed $($f.Name)"
    }
    catch {
      Write-Log "WARN prune failed $($f.Name): $($_.Exception.Message)"
    }
  }
}

Write-Log "END backup success"

# COPY свежего .sql на Google Drive (не влияет на код выхода pg_dump при сбое G:)
try {
  $gdCopy = Join-Path $scriptsDir 'copy-sql-backup-to-google-drive.ps1'
  if (Test-Path -LiteralPath $gdCopy) {
    & $gdCopy -SourceFile $outFile -BackupRoot $BackupRoot
  }
}
catch {
  Write-Log "WARN: Google Drive copy launcher: $($_.Exception.Message)"
}

exit 0
