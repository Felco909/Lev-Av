param([int]$Port = 3000)
$ErrorActionPreference = "SilentlyContinue"
$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $conns) {
  Write-Host "(нет процессов на порту $Port)"
  exit 0
}
$rows = foreach ($c in $conns) {
  $ownPid = $c.OwningProcess
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$ownPid" -ErrorAction SilentlyContinue
  [PSCustomObject]@{
    PID         = $ownPid
    Name        = $p.Name
    CommandLine = $p.CommandLine
  }
}
$rows | Format-Table -AutoSize -Wrap
