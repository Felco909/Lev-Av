<#
.SYNOPSIS
  Регистрирует задание планировщика Windows: ежедневный pg_dump в D:\LevAv_Backups

  Запуск от имени пользователя, у которого есть права на запись D:\ и на чтение проекта.
  При необходимости выполните PowerShell «От имени администратора».
#>
param(
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$TaskName = 'LevAV PostgreSQL Daily Backup',
  [string]$StartTime = '13:00'
)

$ps1 = Join-Path $PSScriptRoot 'pg-backup-daily.ps1'
if (-not (Test-Path -LiteralPath $ps1)) {
  Write-Error "Не найден: $ps1"
  exit 1
}

try {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
}
catch {}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`" -ProjectDir `"$ProjectDir`""
$trigger = New-ScheduledTaskTrigger -Daily -At $StartTime
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description 'Lev&Av TMS: ежедневный pg_dump, 30 копий, D:\LevAv_Backups' | Out-Null

Write-Host "Задание создано: $TaskName" -ForegroundColor Green
Write-Host "Расписание: каждый день в $StartTime" -ForegroundColor Green
Write-Host "Проверка: taskschd.msc -> найти задание -> Выполнить (тест)" -ForegroundColor Cyan
exit 0
