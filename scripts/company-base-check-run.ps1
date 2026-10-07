<#
.SYNOPSIS
  Runs the company-base presence check (scripts/company-base-check.ts) for Windows Task
  Scheduler, same pattern as wialon-sync-mileage-daily.ps1 - just a different trigger
  (every 5 min, not once a day). Replaces wialon-geofence-check-run.ps1 (Wialon geofences,
  Phase 7 revised - see lib/company-base/baseCheck.ts for why).

.DESCRIPTION
  - Runs scripts/company-base-check.ts via npx tsx (explicitly loads WIALON_TOKEN
    from .env.local - Prisma Client picks up DATABASE_URL from .env on its own)
  - Log: <ProjectDir>\logs\company_base_check.log (rotated at 5 MB, keeps .1-.3)
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
$logFile = Join-Path $logDir 'company_base_check.log'
$logMaxBytes = 5MB
$logKeep = 3

# Size-based rotation: company_base_check.log -> .1 -> .2 -> .3 (oldest dropped).
# Runs every 5 min, so without this the log grows ~40 MB/year.
function Invoke-LogRotation {
  if (-not (Test-Path -LiteralPath $logFile)) { return }
  if ((Get-Item -LiteralPath $logFile).Length -lt $logMaxBytes) { return }
  try {
    Remove-Item -LiteralPath "$logFile.$logKeep" -ErrorAction SilentlyContinue
    for ($i = $logKeep - 1; $i -ge 1; $i--) {
      if (Test-Path -LiteralPath "$logFile.$i") {
        Move-Item -LiteralPath "$logFile.$i" -Destination "$logFile.$($i + 1)" -Force
      }
    }
    Move-Item -LiteralPath $logFile -Destination "$logFile.1" -Force
  }
  catch {
    # Rotation must never break the check itself; just keep appending.
  }
}

function Write-Log([string]$Message) {
  if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

Invoke-LogRotation
Write-Log 'START company-base-check'

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$outTemp = Join-Path $env:TEMP "levav_base_check_out_$stamp.txt"
$errTemp = Join-Path $env:TEMP "levav_base_check_err_$stamp.txt"
Remove-Item $outTemp, $errTemp -ErrorAction SilentlyContinue

$argList = @('tsx', '-r', 'dotenv/config', 'scripts/company-base-check.ts', 'dotenv_config_path=.env.local')

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
  Write-Log "END company-base-check FAILED (exit code $($p.ExitCode))"
  exit $p.ExitCode
}

Write-Log 'END company-base-check OK'
exit 0
