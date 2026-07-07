# Creates a single desktop shortcut "Lev&AV LLC TMS.lnk" pointing at start.bat in this repo.
# Run from repo root: powershell -ExecutionPolicy Bypass -File scripts\Create-LevavDesktopShortcut.ps1
param(
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
  $ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
}

$prLower = $ProjectRoot.ToLowerInvariant().Replace("/", "\")
$badTokens = @("DAILY_BACKUP", "BACKUP_RESTORE_POINT", "LAUNCHER_ARCHIVE", "SYSTEM_BACKUP", "PREVIOUS_COPIES", "__MACOSX")
foreach ($t in $badTokens) {
  if ($prLower -like "*\$t\*" -or $prLower -like "*\$t") {
    Write-Error "Shortcut blocked: path looks like backup/archive ($t). Use LevAV_MAIN_SYSTEM root only."
    exit 1
  }
}

$startBat = Join-Path $ProjectRoot "start.bat"
if (-not (Test-Path -LiteralPath $startBat)) {
  Write-Error "start.bat not found: $startBat"
  exit 1
}

$desktop = [Environment]::GetFolderPath("Desktop")
if ([string]::IsNullOrWhiteSpace($desktop)) {
  Write-Error "Could not resolve Desktop folder."
  exit 1
}

$lnkPath = Join-Path $desktop "Lev&AV LLC TMS.lnk"
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($lnkPath)
# Target must be the batch file; WorkingDirectory helps Explorer and some APIs.
$sc.TargetPath = $startBat
$sc.WorkingDirectory = $ProjectRoot
$sc.Description = "Lev&AV LLC TMS / workspace: $($ProjectRoot)"
# Generic application icon (shield/building style in system imageres)
$sc.IconLocation = "$env:SystemRoot\System32\imageres.dll,176"
$sc.Save()

Write-Host "Shortcut created: $lnkPath"
Write-Host "Project root:    $ProjectRoot"
