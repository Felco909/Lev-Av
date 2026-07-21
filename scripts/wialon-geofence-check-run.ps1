<#
.SYNOPSIS
  Runs the geofence check (scripts/wialon-geofence-check.ts) for Windows Task Scheduler,
  same pattern as wialon-sync-mileage-daily.ps1 - just a different trigger (every 5 min,
  not once a day).

.DESCRIPTION
  - Runs scripts/wialon-geofence-check.ts via npx tsx (explicitly loads WIALON_TOKEN
    from .env.local - Prisma Client picks up DATABASE_URL from .env on its own)
  - Log: <ProjectDir>\logs\wialon_geofence_check.log
#>
param(
  [string]$ProjectDir = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
  $scriptBase = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $ProjectDir = (Resolve-Path (Join-Path $scriptBase '..')).Path
}

$logDir = Join-Path $ProjectDir 'logs'
$logFile = Join-Path $logDir 'wialon_geofence_check.log'

function Write-Log([string]$Message) {
  if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

Write-Log 'START wialon-geofence-check'

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$outTemp = Join-Path $env:TEMP "levav_geofence_check_out_$stamp.txt"
$errTemp = Join-Path $env:TEMP "levav_geofence_check_err_$stamp.txt"
Remove-Item $outTemp, $errTemp -ErrorAction SilentlyContinue

$argList = @('tsx', '-r', 'dotenv/config', 'scripts/wialon-geofence-check.ts', 'dotenv_config_path=.env.local')

try {
  $p = Start-Process -FilePath 'npx.cmd' -ArgumentList $argList -WorkingDirectory $ProjectDir -Wait -PassThru -NoNewWindow `
    -RedirectStandardOutput $outTemp -RedirectStandardError $errTemp
}
catch {
  Write-Log "ERROR: cannot start npx tsx: $($_.Exception.Message)"
  exit 2
}

$captureEncoding = if ($PSVersionTable.PSVersion.Major -ge 6) { 'utf8' } else { 'UTF8' }
if (Test-Path -LiteralPath $outTemp) {
  $so = (Get-Content -LiteralPath $outTemp -Raw -Encoding $captureEncoding -ErrorAction SilentlyContinue)
  if ($null -ne $so -and $so.Trim().Length -gt 0) { Write-Log "stdout: $($so.Trim())" }
}
if (Test-Path -LiteralPath $errTemp) {
  $se = (Get-Content -LiteralPath $errTemp -Raw -Encoding $captureEncoding -ErrorAction SilentlyContinue)
  if ($null -ne $se -and $se.Trim().Length -gt 0) { Write-Log "stderr: $($se.Trim())" }
}
Remove-Item $outTemp, $errTemp -ErrorAction SilentlyContinue

if ($p.ExitCode -ne 0) {
  Write-Log "END wialon-geofence-check FAILED (exit code $($p.ExitCode))"
  exit $p.ExitCode
}

Write-Log 'END wialon-geofence-check OK'
exit 0
