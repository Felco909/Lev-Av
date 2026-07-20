<#
.SYNOPSIS
  Registers a Windows Scheduled Task: daily Wialon mileage sync
  (Vehicle.currentMileage), used by the "km/days until next service" calculation
  on /maintenance.

  Run as a user with read access to the project and internet access (Wialon API).
  Run PowerShell "as Administrator" if needed.
#>
param(
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$TaskName = 'LevAV Wialon Mileage Sync',
  [string]$StartTime = '06:00'
)

$ps1 = Join-Path $PSScriptRoot 'wialon-sync-mileage-daily.ps1'
if (-not (Test-Path -LiteralPath $ps1)) {
  Write-Error "Not found: $ps1"
  exit 1
}

try {
  Unregister-ScheduledTask -TaskName $TaskName -TaskPath '\' -Confirm:$false -ErrorAction SilentlyContinue
}
catch {}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`" -ProjectDir `"$ProjectDir`""
$trigger = New-ScheduledTaskTrigger -Daily -At $StartTime
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
# -TaskPath '\' is explicit - this machine already has an unrelated Task Scheduler folder
# with a corrupted (unreadable) name; without an explicit path a task once registered
# inside it instead of root (see project chat history) - root pinned here on purpose.
Register-ScheduledTask -TaskName $TaskName -TaskPath '\' -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description 'Lev&Av TMS: daily sync of vehicle mileage from Wialon (Vehicle.currentMileage) for the maintenance-due calculation' | Out-Null

Write-Host "Task created: $TaskName" -ForegroundColor Green
Write-Host "Schedule: daily at $StartTime" -ForegroundColor Green
Write-Host "Log: $ProjectDir\logs\wialon_sync.log" -ForegroundColor Cyan
Write-Host "Check: taskschd.msc -> find the task -> Run (test)" -ForegroundColor Cyan
exit 0
