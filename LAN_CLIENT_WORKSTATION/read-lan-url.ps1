$p = Join-Path $PSScriptRoot 'LAN_SERVER_URL.txt'
if (-not (Test-Path -LiteralPath $p)) { exit 1 }
$urls = @(Get-Content -LiteralPath $p -Encoding UTF8 | ForEach-Object { $_.Trim() } | Where-Object {
  $_ -and -not $_.StartsWith('#') -and ($_ -match '^\s*https?://')
})

if (-not $urls -or $urls.Count -eq 0) { exit 1 }

# Prefer server hostname first to survive DHCP IP changes.
$preferredHostUrl = 'http://WIN-H4E5L2021CS:3000'
$urls = @($preferredHostUrl) + ($urls | Where-Object { $_ -ne $preferredHostUrl })

foreach ($url in $urls) {
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -ge 200) {
      Write-Output $url
      exit 0
    }
  } catch {
    if ($null -ne $_.Exception.Response) {
      # 302/401 etc still means server is reachable
      Write-Output $url
      exit 0
    }
  }
}

# Fallback to first configured URL if live check did not pass
Write-Output $urls[0]
