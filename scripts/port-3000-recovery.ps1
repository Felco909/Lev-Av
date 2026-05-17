param(
  [string]$ProjectDir,
  [string]$StateFile = ""
)

$ErrorActionPreference = "Stop"
$port = 3000

function Get-PortOwner {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) { return $null }
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction SilentlyContinue
  if (-not $proc) { return $null }
  [pscustomobject]@{
    Pid = $proc.ProcessId
    Name = $proc.Name
    CommandLine = $proc.CommandLine
  }
}

function Save-State {
  param([string]$state, [string]$procId = "", [string]$name = "")
  if ([string]::IsNullOrWhiteSpace($StateFile)) { return }
  $lines = @("PORT_STATE=$state")
  if ($procId) { $lines += "PORT_PID=$procId" }
  if ($name) { $lines += "PORT_NAME=$name" }
  $dir = Split-Path -Parent $StateFile
  if ($dir) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Set-Content -Path $StateFile -Value $lines -Encoding ASCII
}

function Test-LocalReady {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2
    return ($r.StatusCode -ge 200)
  } catch {
    return $false
  }
}

function Resolve-ProjectDirNormalized {
  param([string]$ProjDir)
  try {
    return ((Resolve-Path -LiteralPath $ProjDir).Path.TrimEnd('\', '/'))
  } catch {
    return ($ProjDir.TrimEnd('\', '/'))
  }
}

function Test-ProcessBelongsToProject {
  param(
    $Owner,
    [string]$ProjDirNorm
  )
  if ($Owner.Name -notlike "node.exe") { return $false }
  $cmd = [string]$Owner.CommandLine
  if ([string]::IsNullOrWhiteSpace($cmd)) { return $false }

  # Совпадение полного пути (учёт регистра и слэшей)
  $pn = $ProjDirNorm.ToLowerInvariant().Replace('/', '\')
  $cn = $cmd.ToLowerInvariant().Replace('/', '\')
  if ($cn.Contains($pn)) { return $true }

  # Короткий путь Windows (8.3) может отличаться от длинного в командной строке
  try {
    $fso = New-Object -ComObject Scripting.FileSystemObject
    $short = $fso.GetFolder($ProjDirNorm).ShortPath
    if (-not [string]::IsNullOrWhiteSpace($short) -and $cn.Contains($short.ToLowerInvariant())) {
      return $true
    }
  } catch {}

  # Эвристика: процесс node с Next.js из этой папки (имя последней директории + next в командной строке)
  $leaf = Split-Path $ProjDirNorm -Leaf
  if ($cn.Contains($leaf.ToLowerInvariant()) -and ($cn -match '\\node_modules\\|\\\.next\\|next(\.cmd)?\"?\s+start')) {
    return $true
  }

  return $false
}

$normProject = Resolve-ProjectDirNormalized -ProjDir $ProjectDir

$owner = Get-PortOwner
if (-not $owner) {
  Save-State "FREE"
  Write-Output "PORT_STATE=FREE"
  exit 0
}

$isMainSystemNode = Test-ProcessBelongsToProject -Owner $owner -ProjDirNorm $normProject
if (-not $isMainSystemNode) {
  Save-State "FOREIGN_BUSY" ([string]$owner.Pid) $owner.Name
  Write-Output "PORT_STATE=FOREIGN_BUSY"
  Write-Output "PORT_PID=$($owner.Pid)"
  Write-Output "PORT_NAME=$($owner.Name)"
  exit 3
}

# Same LevAV Next.js already on 3000: stop so a new "npm run start" can bind (fixes EADDRINUSE on re-launch).
$killedPid = [string]$owner.Pid
try {
  Stop-Process -Id $owner.Pid -Force -ErrorAction Stop
} catch {
  Save-State "KILL_FAILED" ([string]$owner.Pid) $owner.Name
  Write-Output "PORT_STATE=KILL_FAILED"
  Write-Output "PORT_PID=$($owner.Pid)"
  exit 4
}

Start-Sleep -Seconds 2
for ($i = 0; $i -lt 12; $i++) {
  $again = Get-PortOwner
  if (-not $again) { break }
  if ([string]$again.Pid -eq $killedPid) {
    try { Stop-Process -Id $again.Pid -Force -ErrorAction SilentlyContinue } catch {}
  } elseif (-not (Test-ProcessBelongsToProject -Owner $again -ProjDirNorm $normProject)) {
    Save-State "FOREIGN_AFTER_KILL" ([string]$again.Pid) $again.Name
    Write-Output "PORT_STATE=FOREIGN_AFTER_KILL"
    Write-Output "PORT_PID=$($again.Pid)"
    exit 3
  } else {
    try { Stop-Process -Id $again.Pid -Force -ErrorAction SilentlyContinue } catch {}
  }
  Start-Sleep -Milliseconds 500
}

$still = Get-PortOwner
if ($still) {
  Save-State "STILL_LISTENING" ([string]$still.Pid) $still.Name
  Write-Output "PORT_STATE=STILL_LISTENING"
  Write-Output "PORT_PID=$($still.Pid)"
  exit 4
}

Save-State "KILLED_PREVIOUS" $killedPid $owner.Name
Write-Output "PORT_STATE=KILLED_PREVIOUS"
Write-Output "PORT_PID=$killedPid"
exit 0
