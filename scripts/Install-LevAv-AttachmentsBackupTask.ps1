<#
.SYNOPSIS
  Регистрирует задание планировщика Windows: ежедневный бэкап вложений заявок
  (storage/uploads) — TMS-AUDIT-0041. Скрипт scripts/attachments-backup-daily.ps1
  существовал и был рабочим с 01.08.2026, но задачи в планировщике для него не было —
  реально прогонялся один раз вручную.

  Запуск от имени пользователя, у которого есть права на запись в корень бэкапов и на
  чтение проекта. При необходимости выполните PowerShell «От имени администратора».
#>
param(
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$TaskName = 'LevAV Attachments Daily Backup',
  [string]$StartTime = '13:15'
)

$ps1 = Join-Path $PSScriptRoot 'attachments-backup-daily.ps1'
if (-not (Test-Path -LiteralPath $ps1)) {
  Write-Error "Не найден: $ps1"
  exit 1
}

try {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
}
catch {}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ps1`" -ProjectDir `"$ProjectDir`""
# 13:15 — на 15 минут позже "LevAV PostgreSQL Daily Backup" (13:00), чтобы не стартовать
# одновременно с ним на одной машине.
$trigger = New-ScheduledTaskTrigger -Daily -At $StartTime
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description 'Lev&Av TMS: ежедневный Zip-бэкап вложений заявок (storage/uploads) + копия на Google Drive' | Out-Null

Write-Host "Задание создано: $TaskName" -ForegroundColor Green
Write-Host "Расписание: каждый день в $StartTime" -ForegroundColor Green
Write-Host "Проверка: taskschd.msc -> найти задание -> Выполнить (тест)" -ForegroundColor Cyan
exit 0
