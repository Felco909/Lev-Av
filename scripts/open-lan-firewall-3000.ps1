# Allow inbound TCP 3000 for Next.js LAN access (Private, Domain, Public profiles).
# Run as Administrator once if automatic creation fails.

$ruleName = 'LevAV TMS Inbound TCP 3000 (LAN)'

$ErrorActionPreference = 'Stop'
try {
  $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  if ($existing) {
    try {
      Set-NetFirewallRule -DisplayName $ruleName -Profile Private, Domain, Public -ErrorAction Stop | Out-Null
      Write-Host "[OK] Updated firewall rule profiles: $ruleName" -ForegroundColor DarkGray
    } catch {
      Write-Host "[OK] Rule exists: $ruleName (re-run as Admin if LAN still blocked)" -ForegroundColor DarkGray
    }
    exit 0
  }
} catch { }

try {
  New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 3000 `
    -Profile Private, Domain, Public `
    -ErrorAction Stop | Out-Null
  Write-Host "[OK] Windows Firewall: inbound TCP 3000 (Private/Domain/Public)" -ForegroundColor Green
} catch {
  Write-Host "[WARN] Could not create firewall rule: $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Host "  Run PowerShell as Administrator and execute:" -ForegroundColor Yellow
  Write-Host '  New-NetFirewallRule -DisplayName "LevAV TMS 3000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private,Domain,Public' -ForegroundColor Yellow
}

exit 0
