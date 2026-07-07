<#
.SYNOPSIS
  COPY последнего успешного .sql дампа в папку Google Drive (без MOVE, без синхронизации БД).

.NOTES
  - Только Copy-Item; live PostgreSQL и DATABASE_URL не трогаются.
  - Если диск G: или папка недоступны — пишется WARN в лог, код выхода 0 (локальный backup не страдает).
  - Старые файлы на Google Drive не удаляются.
  - Переопределить каталог: переменная окружения LEVAV_GDRIVE_BACKUP_DIR (полный путь, например G:\Мой диск\LevAv_DB_Backups)
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$SourceFile,

  [Parameter(Mandatory = $true)]
  [string]$BackupRoot,

  [string]$GDriveDir = ''
)

if ([string]::IsNullOrWhiteSpace($GDriveDir)) {
  if (-not [string]::IsNullOrWhiteSpace($env:LEVAV_GDRIVE_BACKUP_DIR)) {
    $GDriveDir = $env:LEVAV_GDRIVE_BACKUP_DIR
  }
  else {
    # "Мой диск" via code points — стабильно при любой кодировке файла .ps1 на Windows
    $myDiskRu = -join [char[]](0x041C, 0x043E, 0x0439, 0x0020, 0x0434, 0x0438, 0x0441, 0x043A)
    $GDriveDir = Join-Path (Join-Path 'G:' $myDiskRu) 'LevAv_DB_Backups'
  }
}

$ErrorActionPreference = 'Continue'
$logDir = Join-Path $BackupRoot 'logs'
$logFile = Join-Path $logDir 'google_drive_backup.log'

function Write-GLog([string]$Message) {
  try {
    if (-not (Test-Path -LiteralPath $logDir)) {
      New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
  }
  catch { }
}

try {
  if (-not (Test-Path -LiteralPath $SourceFile)) {
    Write-GLog "ERROR: source file not found: $SourceFile"
    exit 0
  }

  $gdriveRoot = Split-Path -Parent $GDriveDir
  if (-not [string]::IsNullOrWhiteSpace($gdriveRoot) -and -not (Test-Path -LiteralPath $gdriveRoot)) {
    Write-GLog "SKIP: Google Drive root not available (e.g. G: offline): $gdriveRoot"
    exit 0
  }

  if (-not (Test-Path -LiteralPath $GDriveDir)) {
    try {
      New-Item -ItemType Directory -Path $GDriveDir -Force | Out-Null
    }
    catch {
      Write-GLog "SKIP: cannot create LevAv folder on Google Drive: $GDriveDir - $($_.Exception.Message)"
      exit 0
    }
  }

  $name = Split-Path -Leaf $SourceFile
  $dest = Join-Path $GDriveDir $name

  Copy-Item -LiteralPath $SourceFile -Destination $dest -Force
  if (-not (Test-Path -LiteralPath $dest)) {
    Write-GLog "ERROR: copy finished but destination missing: $dest"
    exit 0
  }

  $sz = (Get-Item -LiteralPath $dest).Length
  Write-GLog "OK copied to Google Drive: $dest ($sz bytes)"
}
catch {
  Write-GLog "ERROR: $($_.Exception.Message)"
}

exit 0
