# Lists PIDs of node.exe running Next.js (dev or start) for the given project directory only.
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot
)

$ErrorActionPreference = "Stop"

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
    $Proc,
    [string]$ProjDirNorm
  )
  if ($Proc.Name -ne 'node.exe') { return $false }
  $cmd = [string]$Proc.CommandLine
  if ([string]::IsNullOrWhiteSpace($cmd)) { return $false }

  $pn = $ProjDirNorm.ToLowerInvariant().Replace('/', '\')
  $cn = $cmd.ToLowerInvariant().Replace('/', '\')
  if ($cn.Contains($pn)) { return $true }

  try {
    $fso = New-Object -ComObject Scripting.FileSystemObject
    $short = $fso.GetFolder($ProjDirNorm).ShortPath
    if (-not [string]::IsNullOrWhiteSpace($short) -and $cn.Contains($short.ToLowerInvariant())) {
      return $true
    }
  } catch {}

  $leaf = Split-Path $ProjDirNorm -Leaf
  if ($cn.Contains($leaf.ToLowerInvariant()) -and ($cn -match '\\node_modules\\|\\\.next\\|next(\.cmd)?\"?\s+(start|dev)')) {
    return $true
  }

  return $false
}

function Test-IsNextDev {
  param([string]$Cmd)
  return ($Cmd -like '*next*dev*')
}

function Test-IsNextStart {
  param([string]$Cmd)
  return ($Cmd -like '*next*start*' -and -not (Test-IsNextDev $Cmd))
}

$norm = Resolve-ProjectDirNormalized -ProjDir $ProjectRoot
$pids = New-Object System.Collections.Generic.HashSet[int]

Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
  if (-not (Test-ProcessBelongsToProject -Proc $_ -ProjDirNorm $norm)) { return }
  $c = [string]$_.CommandLine
  if ((Test-IsNextDev $c) -or (Test-IsNextStart $c)) {
    [void]$pids.Add([int]$_.ProcessId)
  }
}

foreach ($procId in $pids) {
  Write-Output $procId
}
