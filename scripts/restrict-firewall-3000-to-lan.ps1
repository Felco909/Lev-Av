# One-time hardening: restrict every inbound ALLOW rule that exposes TCP 3000 or node.exe
# to the local subnet only (RemoteAddress LocalSubnet). Block rules are left untouched.
# Requires Administrator. Writes a before/after report to logs\firewall-restrict-3000.log.

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir 'firewall-restrict-3000.log'

function Write-Log([string]$msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Write-Host $line
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host '[ERROR] Run this script from PowerShell started as Administrator.' -ForegroundColor Red
  exit 1
}

Write-Log '=== START restrict TCP 3000 / node.exe inbound rules to LocalSubnet ==='

$rules = Get-NetFirewallRule -Direction Inbound -Action Allow -Enabled True
$portIds = @{}
Get-NetFirewallPortFilter -All | Where-Object { $_.LocalPort -contains '3000' } | ForEach-Object { $portIds[$_.InstanceID] = $true }
$appIds = @{}
Get-NetFirewallApplicationFilter -All | Where-Object { $_.Program -like '*\node.exe' } | ForEach-Object { $appIds[$_.InstanceID] = $true }

$targets = $rules | Where-Object { $portIds.ContainsKey($_.Name) -or $appIds.ContainsKey($_.Name) }
if (-not $targets) {
  Write-Log 'No matching inbound allow rules found.'
}

foreach ($r in $targets) {
  $before = ($r | Get-NetFirewallAddressFilter).RemoteAddress -join ','
  $program = ($r | Get-NetFirewallApplicationFilter).Program
  $port = ($r | Get-NetFirewallPortFilter).LocalPort -join ','
  Write-Log ("RULE '{0}' profile={1} port={2} program={3} remote(before)={4}" -f $r.DisplayName, $r.Profile, $port, $program, $before)
  if ($before -eq 'LocalSubnet') { Write-Log '  -> already restricted, skip'; continue }
  try {
    # Auto-created program rules (e.g. "Node.js JavaScript Runtime") use EdgeTraversal=DeferToUser,
    # which Windows forbids combining with an address condition — block edge traversal first.
    if ($r.EdgeTraversalPolicy -ne 'Block') {
      Set-NetFirewallRule -Name $r.Name -EdgeTraversalPolicy Block -RemoteAddress LocalSubnet -ErrorAction Stop
    } else {
      Set-NetFirewallRule -Name $r.Name -RemoteAddress LocalSubnet -ErrorAction Stop
    }
    $after = ((Get-NetFirewallRule -Name $r.Name) | Get-NetFirewallAddressFilter).RemoteAddress -join ','
    Write-Log "  -> remote(after)=$after"
  } catch {
    Write-Log "  -> ERROR: $($_.Exception.Message)"
  }
}

Write-Log '=== END ==='
exit 0
