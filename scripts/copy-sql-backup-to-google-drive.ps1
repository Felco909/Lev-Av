<#
.SYNOPSIS
  COPY последнего успешного .sql дампа в папку Google Drive (без MOVE, без синхронизации БД).

.NOTES
  - Только Copy-Item; live PostgreSQL и DATABASE_URL не трогаются.
  - Если диск G: или папка недоступны — пишется WARN в лог, код выхода 0 (локальный backup не страдает).
  - Старые файлы на Google Drive не удаляются.
  - Переопределить каталог: переменная окружения LEVAV_GDRIVE_BACKUP_DIR (полный путь, например G:\Мой диск\LevAv_DB_Backups)
  - Авто-восстановление диска G: (инцидент 24-30.07.2026, рецидив 31.07.2026): GoogleDriveFS.exe
    периодически теряет смонтированную букву диска, оставаясь при этом живым процессом
    (не крашится, просто перестаёт быть виден Test-Path "G:\"). Перед копированием — если
    диска нет — пробуем убить процесс и перезапустить launch.bat, с ожиданием до 45 сек.
    Если это не сработало (диск всё ещё недоступен) — как и раньше, пишем WARN и выходим 0.
    Известное ограничение: если этот скрипт запущен из-под задачи планировщика с
    LogonType=S4U (не интерактивная сессия), перезапуск GUI-процесса Google Drive может не
    восстановить диск в интерактивной сессии пользователя — тогда WARN всё равно появится,
    и это сигнал вернуть LogonType=InteractiveToken именно для "LevAV PostgreSQL Daily Backup".
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
    # "Мой диск" via code points — стабильно при любой кодировке файла .ps1 на Windows.
    # Строковая конкатенация, а НЕ Join-Path 'G:' ... — Join-Path с буквой диска как первым
    # сегментом обращается к FileSystem-провайдеру и кидает "Cannot find drive" ДО того, как
    # скрипт вообще успевает проверить/восстановить диск (найдено 31.07.2026 — это и была
    # истинная причина WARN "Не удалось найти диск" в pg_backup.log все прошлые разы).
    $myDiskRu = -join [char[]](0x041C, 0x043E, 0x0439, 0x0020, 0x0434, 0x0438, 0x0441, 0x043A)
    $GDriveDir = "G:\$myDiskRu\LevAv_DB_Backups"
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

<#
  Пытается вернуть диск G: (Google Drive Desktop), если GoogleDriveFS.exe жив, но диск
  не смонтирован (см. .NOTES выше). Не трогает процесс, если диск уже на месте.
#>
function Test-GoogleDriveRoot([string]$Root) {
  try { return (Test-Path -LiteralPath $Root -ErrorAction Stop) } catch { return $false }
}

function Restore-GoogleDriveMount([string]$Root, [int]$TimeoutSeconds = 45) {
  if (Test-GoogleDriveRoot $Root) { return $true }
  Write-GLog "WARN: G: not mounted - attempting automatic restart of Google Drive Desktop..."
  try {
    Get-Process -Name GoogleDriveFS -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $launchBat = 'C:\Program Files\Google\Drive File Stream\launch.bat'
    if (-not (Test-Path -LiteralPath $launchBat)) {
      Write-GLog "ERROR: auto-restart failed - launch.bat not found at $launchBat"
      return $false
    }
    Start-Process -FilePath $launchBat -WindowStyle Hidden
  }
  catch {
    Write-GLog "ERROR: auto-restart failed to launch Google Drive Desktop: $($_.Exception.Message)"
    return $false
  }
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    if (Test-GoogleDriveRoot $Root) {
      Write-GLog "OK: G: remounted automatically after restart"
      return $true
    }
  }
  Write-GLog "ERROR: G: still not mounted after automatic restart (timeout ${TimeoutSeconds}s) - manual check needed"
  return $false
}

try {
  if (-not (Test-Path -LiteralPath $SourceFile)) {
    Write-GLog "ERROR: source file not found: $SourceFile"
    exit 0
  }

  $gdriveRoot = Split-Path -Parent $GDriveDir
  if (-not [string]::IsNullOrWhiteSpace($gdriveRoot) -and -not (Restore-GoogleDriveMount $gdriveRoot)) {
    Write-GLog "SKIP: Google Drive root not available even after auto-restart attempt: $gdriveRoot"
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
