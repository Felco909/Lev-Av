<#
.SYNOPSIS
  Восстановление базы из SQL-дампа pg_dump (plain).

ВНИМАНИЕ:
  Перед восстановлением необходимо остановить приложение Next.js и корректно остановить PostgreSQL
  или переключиться на другую пустую БД — иначе восстановление в ту же БД при активных подключениях может не удаться.

  Рекомендуемый порядок см. SYSTEM_BACKUP_INFO\POSTGRES_BACKUP_RESTORE.md
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,

  [Parameter(Mandatory = $true)]
  [string]$ProjectDir,

  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $BackupFile)) {
  Write-Error "Файл бэкапа не найден: $BackupFile"
  exit 1
}

$envPath = Join-Path $ProjectDir '.env'
if (-not (Test-Path -LiteralPath $envPath)) {
  Write-Error ".env не найден: $envPath"
  exit 2
}

$line = Get-Content -LiteralPath $envPath -Encoding UTF8 |
  Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
  Select-Object -First 1
$raw = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
if ($raw.Contains('?')) { $raw = $raw.Split('?')[0] }

$psql = Join-Path $ProjectDir 'LOCAL_DB_RUNTIME\pgsql_full\pgsql\bin\psql.exe'
if (-not (Test-Path -LiteralPath $psql)) {
  $psql = 'psql'
}

Write-Host "Будет выполнено восстановление из:" -ForegroundColor Yellow
Write-Host "  $BackupFile"
Write-Host "В целевую БД из DATABASE_URL (только метаданные команды в дампе)." -ForegroundColor Yellow
Write-Host "Убедитесь: остановлен TMS (Next.js) и нет активных подключений к БД, если перезаписываете существующую схему." -ForegroundColor Red

if ($WhatIf) {
  Write-Host '[WhatIf] Команда не выполнялась.'
  exit 0
}

$confirm = Read-Host "Введите YES для продолжения"
if ($confirm -ne 'YES') {
  Write-Host 'Отменено.'
  exit 10
}

Write-Host "Запуск: $psql --dbname=... -v ON_ERROR_STOP=1 -f `"$BackupFile`"" -ForegroundColor Cyan
& $psql --dbname=$raw -v ON_ERROR_STOP=1 -f $BackupFile
if ($LASTEXITCODE -ne 0) {
  Write-Error "psql завершился с кодом $LASTEXITCODE"
  exit $LASTEXITCODE
}
Write-Host 'Готово. Запустите PostgreSQL и PRODUCTION_START.bat при необходимости.' -ForegroundColor Green
exit 0
