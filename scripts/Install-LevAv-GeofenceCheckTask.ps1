<#
.SYNOPSIS
  Registers a Windows Scheduled Task: geofence check every 5 minutes (Phase 7) - updates
  VehicleTrip.geofenceStatus (departed/arrived_loading/loading/in_transit/arrived_unloading/
  unloaded/returned_to_garage) based on real vehicle position vs. role-tagged Wialon zones.

  Run as a user with read access to the project and internet access (Wialon API).
  Run PowerShell "as Administrator" if needed.
#>
param(
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$TaskName = 'LevAV Wialon Geofence Check',
  [int]$IntervalMinutes = 5
)

$ps1 = Join-Path $PSScriptRoot 'wialon-geofence-check-run.ps1'
if (-not (Test-Path -LiteralPath $ps1)) {
  Write-Error "Not found: $ps1"
  exit 1
}

try {
  Unregister-ScheduledTask -TaskName $TaskName -TaskPath '\' -Confirm:$false -ErrorAction SilentlyContinue
}
catch {}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`" -ProjectDir `"$ProjectDir`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 4)
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
# -TaskPath '\' explicit - see project chat history (Phase 1) about a pre-existing corrupted
# Task Scheduler folder on this machine that a task once landed in without an explicit path.
Register-ScheduledTask -TaskName $TaskName -TaskPath '\' -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description 'Lev&Av TMS: geofence check every 5 min - auto-updates VehicleTrip.geofenceStatus (Phase 7)' -ErrorAction Stop | Out-Null

Write-Host "Task created: $TaskName" -ForegroundColor Green
Write-Host "Schedule: every $IntervalMinutes minutes" -ForegroundColor Green
Write-Host "Log: $ProjectDir\logs\wialon_geofence_check.log" -ForegroundColor Cyan
Write-Host "Check: taskschd.msc -> find the task -> Run (test)" -ForegroundColor Cyan
exit 0
