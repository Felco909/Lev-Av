# Lists PIDs of postgres.exe whose command line references this cluster data directory.
param(
  [Parameter(Mandatory = $true)]
  [string]$PgDataPath
)

$ErrorActionPreference = "Stop"
try {
  $norm = ((Resolve-Path -LiteralPath $PgDataPath).Path).ToLowerInvariant().Replace('/', '\')
} catch {
  $norm = $PgDataPath.TrimEnd('\', '/').ToLowerInvariant().Replace('/', '\')
}

Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
  $c = ([string]$_.CommandLine).ToLowerInvariant().Replace('/', '\')
  if ($c.Contains($norm)) {
    Write-Output $_.ProcessId
  }
}
