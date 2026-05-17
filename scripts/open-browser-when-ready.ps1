param(
  [string]$Url = "http://localhost:3000",
  [int]$TimeoutSeconds = 90,
  [switch]$OpenImmediately
)

function Open-UrlInBrowser {
  param([string]$TargetUrl)
  # Эквивалент cmd: start "" "http://localhost:3000"
  try {
    Start-Process cmd.exe -ArgumentList @('/c', 'start', '""', $TargetUrl) -WindowStyle Hidden
  } catch {
    # Запасной вариант: Start-Process "http://..."
    Start-Process -FilePath $TargetUrl
  }
}

function Test-HttpReady {
  param([string]$tryUrl)
  try {
    $response = Invoke-WebRequest -Uri $tryUrl -UseBasicParsing -TimeoutSec 2
    return ($response.StatusCode -ge 200)
  } catch {
    # Next.js / middleware могут отвечать 401/302 — соединение есть, сервер уже слушает
    $resp = $_.Exception.Response
    if ($null -ne $resp) {
      return $true
    }
    return $false
  }
}

if ($OpenImmediately) {
  Open-UrlInBrowser -TargetUrl $Url
  exit 0
}

$maxAttempts = [Math]::Max(1, $TimeoutSeconds)
$candidates = @($Url)
if ($Url -match '(?i)localhost') {
  $candidates += ($Url -replace '(?i)localhost', '127.0.0.1')
}

for ($i = 0; $i -lt $maxAttempts; $i++) {
  foreach ($tryUrl in $candidates) {
    if (Test-HttpReady -tryUrl $tryUrl) {
      Open-UrlInBrowser -TargetUrl $Url
      exit 0
    }
  }
  Start-Sleep -Seconds 1
}

exit 1
