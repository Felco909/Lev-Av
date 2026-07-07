# Returns 0 when .next is a complete production build, 1 otherwise.
param([string]$ProjectDir = ".")

$ErrorActionPreference = "Stop"
$root = $ProjectDir
if (-not (Test-Path $root)) { Write-Error "Project dir not found: $root"; exit 1 }
$next = Join-Path $root ".next"
$required = @(
  "BUILD_ID",
  "build-manifest.json",
  "server\app-paths-manifest.json",
  "server\app\login\page.js"
)

if (-not (Test-Path $next)) { exit 1 }

foreach ($rel in $required) {
  $path = Join-Path $next $rel
  if (-not (Test-Path $path)) { exit 1 }
}

exit 0
