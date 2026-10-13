<#
.SYNOPSIS
  Locks the workstation once TMS and Claude Remote Control are up after logon.

.DESCRIPTION
  Run at logon by Task Scheduler "LevAV Lock After Startup" (with Windows autologon).
  Waits until Next.js listens on port 3000 and a `claude remote-control` process exists,
  then calls LockWorkStation. Locks anyway after the timeout so the PC never stays open.
  Locking does not stop running programs (TMS console, Remote Control keep working).
  Log: <ProjectDir>\.runtime\lock_after_startup.log
#>
param(
  [int]$TimeoutSeconds = 300
)

$projectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$logFile = Join-Path $projectDir '.runtime\lock_after_startup.log'

function Write-Log([string]$Message) {
  try {
    Add-Content -LiteralPath $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message" -Encoding UTF8
  }
  catch {}
}

function Test-TmsUp {
  [bool](Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue)
}

function Test-RemoteControlUp {
  # The Claude desktop app is also claude.exe — match the CLI subcommand argument exactly.
  [bool](Get-CimInstance Win32_Process -Filter "Name='claude.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match '\sremote-control(\s|$)' })
}

Write-Log 'START waiting for TMS (port 3000) and remote-control'
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$tms = $false
$rc = $false
while ((Get-Date) -lt $deadline) {
  $tms = Test-TmsUp
  $rc = Test-RemoteControlUp
  if ($tms -and $rc) { break }
  Start-Sleep -Seconds 5
}

if ($tms -and $rc) {
  Write-Log 'READY tms=up rc=up'
}
else {
  Write-Log "TIMEOUT after $TimeoutSeconds s: tms=$tms rc=$rc (locking anyway)"
}

Add-Type -Name Native -Namespace LevAv -MemberDefinition '[DllImport("user32.dll")] public static extern bool LockWorkStation();'
if ([LevAv.Native]::LockWorkStation()) {
  Write-Log 'LOCKED'
}
else {
  Write-Log 'ERROR LockWorkStation failed'
  exit 1
}
