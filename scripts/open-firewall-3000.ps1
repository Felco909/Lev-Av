# Allow inbound TCP 3000 for LevAV TMS LAN access (Private, Domain, Public).
# Requires Administrator to create or update the firewall rule.

$ErrorActionPreference = 'Stop'
$ruleName = 'LevAV TMS Inbound TCP 3000 (LAN)'

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
  Write-Host '[INFO] Administrator rights required to open port 3000 in Windows Firewall.'
  Write-Host '[INFO] Approve the UAC prompt to continue...'
  $args = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', $PSCommandPath
  )
  try {
    $proc = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $args -Wait -PassThru
    exit $(if ($null -ne $proc.ExitCode) { $proc.ExitCode } else { 1 })
  } catch {
    Write-Host "[ERROR] Could not elevate: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '[HINT] Right-click start.bat -> Run as administrator, once.' -ForegroundColor Yellow
    exit 1
  }
}

try {
  $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  if ($existing) {
    Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Profile Private, Domain, Public -ErrorAction Stop | Out-Null
    Write-Host "[OK] Firewall rule active: $ruleName" -ForegroundColor Green
    exit 0
  }
} catch {
  # fall through to create
}

try {
  New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 3000 `
    -Profile Private, Domain, Public `
    -Enabled True `
    -ErrorAction Stop | Out-Null
  Write-Host "[OK] Windows Firewall: inbound TCP 3000 allowed (Private/Domain/Public)" -ForegroundColor Green
  exit 0
} catch {
  Write-Host "[ERROR] Could not create firewall rule: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
