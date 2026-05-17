param(
  [int]$Port = 3000
)

# ASCII-only output: avoids CMD/PowerShell 5.1 encoding errors when launched from PRODUCTION_START.bat
$ErrorActionPreference = 'SilentlyContinue'
Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ' Lev&AV LLC TMS - LAN access (other PCs) ' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ("  This PC (server):   http://localhost:{0}" -f $Port) -ForegroundColor Gray
Write-Host ''

$ips = @()
try {
  $ips = @(
    Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object {
        $_.IPAddress -notmatch '^127\.' -and
        $_.IPAddress -notmatch '^169\.254\.'
      } |
      Select-Object -ExpandProperty IPAddress -Unique
  )
} catch { }

if (-not $ips -or $ips.Count -eq 0) {
  Write-Host "  [WARN] Could not detect LAN IPv4. Run ipconfig, open http://<YOUR_IP>:$Port" -ForegroundColor Yellow
  Write-Host ''
  exit 0
}

foreach ($ip in ($ips | Sort-Object)) {
  Write-Host ("  Other PCs:          http://{0}:{1}" -f $ip, $Port) -ForegroundColor Green
}
Write-Host ''
Write-Host '  Other workstations: browser only to URL above (no npm on client).' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  LAN kit: copy folder LAN_CLIENT_WORKSTATION to each PC desktop.' -ForegroundColor DarkCyan
Write-Host '  Set LAN_SERVER_URL.txt to one URL above; run OPEN_LEVAV_TMS.bat (not localhost).' -ForegroundColor DarkCyan
Write-Host ''
