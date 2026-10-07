# One-time: point the LevAV_Postgres Windows service at the Postgres binaries copied to
# C:\LevAV_DB\pgsql (out of the OneDrive-synced project folder). Data dir is not touched.
# Requires Administrator. Rolls back to the old ImagePath automatically if the service
# does not come up on the new binaries. Log: logs\pg-binaries-move.log

$ErrorActionPreference = 'Stop'
$serviceName = 'LevAV_Postgres'
$projectDir = Split-Path -Parent $PSScriptRoot
$oldBinDir = Join-Path $projectDir 'LOCAL_DB_RUNTIME\pgsql_full\pgsql\bin'
$newBinDir = 'C:\LevAV_DB\pgsql\bin'
$regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$serviceName"
$logFile = Join-Path $projectDir 'logs\pg-binaries-move.log'
New-Item -ItemType Directory -Force -Path (Split-Path $logFile) | Out-Null

function Write-Log([string]$msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Write-Host $line
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

function Wait-ServiceStatus([string]$status, [int]$timeoutSec) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    if ((Get-Service $serviceName).Status -eq $status) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Test-PgReady {
  & (Join-Path $newBinDir 'pg_isready.exe') -h 127.0.0.1 -p 5434 | Out-Null
  return ($LASTEXITCODE -eq 0)
}

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host '[ERROR] Run as Administrator.' -ForegroundColor Red
  exit 1
}

Write-Log '=== START move LevAV_Postgres binaries out of OneDrive ==='
if (-not (Test-Path -LiteralPath (Join-Path $newBinDir 'pg_ctl.exe'))) {
  Write-Log "ABORT: $newBinDir\pg_ctl.exe not found - copy binaries first"
  exit 1
}

$oldImagePath = (Get-ItemProperty -Path $regPath -Name ImagePath).ImagePath
Write-Log "ImagePath(before)=$oldImagePath"
$idx = $oldImagePath.IndexOf($oldBinDir, [StringComparison]::OrdinalIgnoreCase)
if ($idx -lt 0) {
  if ($oldImagePath.IndexOf($newBinDir, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
    Write-Log 'Already pointing at new binaries - nothing to do.'
    exit 0
  }
  Write-Log "ABORT: ImagePath does not contain expected old bin dir: $oldBinDir"
  exit 1
}
$newImagePath = $oldImagePath.Substring(0, $idx) + $newBinDir + $oldImagePath.Substring($idx + $oldBinDir.Length)

try {
  Write-Log 'Stopping service...'
  Stop-Service $serviceName -Force
  if (-not (Wait-ServiceStatus 'Stopped' 90)) { throw 'service did not stop within 90s' }

  Set-ItemProperty -Path $regPath -Name ImagePath -Value $newImagePath
  Write-Log "ImagePath(after)=$((Get-ItemProperty -Path $regPath -Name ImagePath).ImagePath)"

  Write-Log 'Starting service on new binaries...'
  Start-Service $serviceName
  if (-not (Wait-ServiceStatus 'Running' 90)) { throw 'service did not reach Running within 90s' }
  $ready = $false
  for ($i = 0; $i -lt 30 -and -not $ready; $i++) { $ready = Test-PgReady; if (-not $ready) { Start-Sleep 1 } }
  if (-not $ready) { throw 'pg_isready failed on port 5434' }

  $exe = (Get-Process postgres -ErrorAction SilentlyContinue | Select-Object -First 1).Path
  Write-Log "postgres.exe running from: $exe"
  Write-Log '=== SUCCESS ==='
  exit 0
}
catch {
  Write-Log "ERROR: $($_.Exception.Message) - rolling back to old ImagePath"
  try {
    Stop-Service $serviceName -Force -ErrorAction SilentlyContinue
    Wait-ServiceStatus 'Stopped' 60 | Out-Null
    Set-ItemProperty -Path $regPath -Name ImagePath -Value $oldImagePath
    Start-Service $serviceName
    $ok = Wait-ServiceStatus 'Running' 90
    Write-Log "ROLLBACK done, service running=$ok"
  }
  catch {
    Write-Log "ROLLBACK FAILED: $($_.Exception.Message) - start service manually"
  }
  exit 1
}
