<#
.SYNOPSIS
  Registers a Windows Scheduled Task: company-base presence check every 5 minutes
  (Phase 7 revised) - updates Vehicle.atBase/atBaseChangedAt and, for active VehicleTrips,
  auto-fills departureDate/returnDate based on real GPS crossing of the company base zone
  (TMS-native CompanyZone, not Wialon geofences - see lib/company-base/baseCheck.ts).

  Replaces Install-LevAv-GeofenceCheckTask.ps1 (unregisters the old
  "LevAV Wialon Geofence Check" task if present).

  Run as a user with read access to the project and internet access (Wialon API).
  Run PowerShell "as Administrator" if needed.
#>
param(
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$TaskName = 'LevAV Company Base Check',
  [string]$OldTaskName = 'LevAV Wialon Geofence Check',
  [int]$IntervalMinutes = 5
)

$ps1 = Join-Path $PSScriptRoot 'company-base-check-run.ps1'
if (-not (Test-Path -LiteralPath $ps1)) {
  Write-Error "Not found: $ps1"
  exit 1
}

try {
  Unregister-ScheduledTask -TaskName $OldTaskName -TaskPath '\' -Confirm:$false -ErrorAction SilentlyContinue
}
catch {}

try {
  Unregister-ScheduledTask -TaskName $TaskName -TaskPath '\' -Confirm:$false -ErrorAction SilentlyContinue
}
catch {}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`" -ProjectDir `"$ProjectDir`""
# RepetitionDuration must be a bounded TimeSpan - [TimeSpan]::MaxValue is rejected by Task
# Scheduler's XML validation (HRESULT 0x80041318) with a *non-terminating* error, which is
# why -ErrorAction Stop below is required (otherwise this script would print "Task created"
# even when registration silently failed - hit this exact bug once already, see project history).
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 4)
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
# -TaskPath '\' explicit - see project chat history (Phase 1) about a pre-existing corrupted
# Task Scheduler folder on this machine that a task once landed in without an explicit path.
Register-ScheduledTask -TaskName $TaskName -TaskPath '\' -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description 'Lev&Av TMS: company base check every 5 min - auto-updates Vehicle.atBase and VehicleTrip departure/return (Phase 7 revised)' -ErrorAction Stop | Out-Null

Write-Host "Task created: $TaskName" -ForegroundColor Green
Write-Host "Schedule: every $IntervalMinutes minutes" -ForegroundColor Green
Write-Host "Log: $ProjectDir\logs\company_base_check.log" -ForegroundColor Cyan
Write-Host "Check: taskschd.msc -> find the task -> Run (test)" -ForegroundColor Cyan
exit 0
