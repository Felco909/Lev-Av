<#
.SYNOPSIS
  Ежедневный бэкап локального хранилища вложений заявок (storage/uploads) — RC-1,
  01.08.2026: раздел 5 ("восстановление документов") не имел вообще никакого
  механизма резервного копирования. Реальные подписанные документы/счета/акты
  лежат только на диске проекта, без копии.

.DESCRIPTION
  - Zip-архив storage/uploads -> <корень бэкапов>\attachments\levav_attachments_yyyyMMdd_HHmmss.zip
  - Хранит последние 14 архивов (папка вложений растёт медленнее БД, ежедневный полный
    дамп 30 раз избыточен по месту — можно пересмотреть при росте объёма)
  - Копия на Google Drive — тот же универсальный copy-sql-backup-to-google-drive.ps1,
    что и для БД (скрипт файл-агностичен), в отдельную подпапку LevAv_Attachments_Backups
  - Лог: <корень бэкапов>\logs\attachments_backup.log
  - НЕ трогает и не блокирует storage/uploads во время работы приложения — Compress-Archive
    читает файлы, не блокирует запись новых вложений параллельно.

  Переменные окружения (совпадают с pg-backup-daily.ps1 для единого корня бэкапов):
    LEVAV_PG_BACKUP_ROOT  - backup root (default D:\LevAv_Backups, тот же fallback)
    LEVAV_KEEP_ATTACHMENT_BACKUPS - number of archives to keep (default 14)
#>
param(
  [Parameter(Mandatory = $false)]
  [string]$ProjectDir = '',

  [string]$BackupRoot = $(if ($env:LEVAV_PG_BACKUP_ROOT) { $env:LEVAV_PG_BACKUP_ROOT } else { 'D:\LevAv_Backups' }),

  [int]$KeepCount = $(if ($env:LEVAV_KEEP_ATTACHMENT_BACKUPS) { [int]$env:LEVAV_KEEP_ATTACHMENT_BACKUPS } else { 14 })
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
  $scriptBase = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $ProjectDir = (Resolve-Path (Join-Path $scriptBase '..')).Path
}
$scriptsDir = Join-Path $ProjectDir 'scripts'
$uploadsDir = Join-Path $ProjectDir 'storage\uploads'

# Тот же fallback, что и pg-backup-daily.ps1 — единый корень бэкапов на этой машине.
if ($BackupRoot -match '^[a-zA-Z]:') {
  $driveLetter = $BackupRoot.Substring(0, 1)
  if (-not (Get-PSDrive -Name $driveLetter -ErrorAction SilentlyContinue)) {
    $BackupRoot = Join-Path $env:USERPROFILE 'LevAv_Postgres_Backups'
  }
}

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$archiveSub = Join-Path $BackupRoot 'attachments'
$logDir = Join-Path $BackupRoot 'logs'
$logFile = Join-Path $logDir 'attachments_backup.log'

function Write-Log([string]$Message) {
  if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

try {
  if (-not (Test-Path -LiteralPath $uploadsDir)) {
    Write-Log "SKIP: storage/uploads not found at $uploadsDir"
    exit 0
  }
  if (-not (Test-Path -LiteralPath $archiveSub)) {
    New-Item -ItemType Directory -Path $archiveSub -Force | Out-Null
  }

  $outFile = Join-Path $archiveSub "levav_attachments_$stamp.zip"
  Write-Log "START backup -> $outFile"

  Compress-Archive -Path (Join-Path $uploadsDir '*') -DestinationPath $outFile -CompressionLevel Optimal -Force

  if (-not (Test-Path -LiteralPath $outFile)) {
    Write-Log "ERROR: archive was not created"
    exit 1
  }
  $sz = (Get-Item -LiteralPath $outFile).Length
  if ($sz -lt 1024) {
    Write-Log "ERROR: archive suspiciously small ($sz bytes) - not trusting it, removing"
    Remove-Item -LiteralPath $outFile -Force -ErrorAction SilentlyContinue
    exit 1
  }
  Write-Log "OK archive written ($sz bytes)"

  # Retention — храним последние $KeepCount архивов.
  $existing = Get-ChildItem -LiteralPath $archiveSub -Filter 'levav_attachments_*.zip' | Sort-Object Name
  if ($existing.Count -gt $KeepCount) {
    $toRemove = $existing | Select-Object -First ($existing.Count - $KeepCount)
    foreach ($f in $toRemove) {
      Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue
      Write-Log "PRUNE removed $($f.Name)"
    }
  }

  Write-Log "END backup success"
}
catch {
  Write-Log "ERROR: $($_.Exception.Message)"
  exit 1
}

# Копия на Google Drive — переиспользуем универсальный (файл-агностичный) скрипт,
# в отдельную подпапку, чтобы не смешивать с бэкапами БД. Не влияет на код выхода
# основного бэкапа при сбое (та же защита, что и в pg-backup-daily.ps1).
try {
  $gdCopy = Join-Path $scriptsDir 'copy-sql-backup-to-google-drive.ps1'
  if ((Test-Path -LiteralPath $gdCopy) -and (Test-Path -LiteralPath $outFile)) {
    $myDiskRu = -join [char[]](0x041C, 0x043E, 0x0439, 0x0020, 0x0434, 0x0438, 0x0441, 0x043A)
    $gdriveAttachDir = "G:\$myDiskRu\LevAv_Attachments_Backups"
    & $gdCopy -SourceFile $outFile -BackupRoot $BackupRoot -GDriveDir $gdriveAttachDir
  }
}
catch {
  Write-Log "WARN: Google Drive copy launcher: $($_.Exception.Message)"
}

exit 0
