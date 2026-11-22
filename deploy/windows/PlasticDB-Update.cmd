@echo off
rem ============================================================================
rem  PlasticDB-Update.cmd  -  double-click it ON THE SERVER PC to update PlasticDB.
rem
rem  It asks for Administrator permission, finds the PlasticDB folder, fetches the
rem  newest version from GitHub, backs the database up, stops the server, installs
rem  the new version, starts it again and checks it. If the new version does not
rem  come up, the previous one is put back. Branches are cut off for a minute or two:
rem  run it when nobody is working. Nothing in the database is deleted.
rem
rem  One file, keep it next to PlasticDB-Setup.exe. Safe to run again at any time.
rem ============================================================================
setlocal
title PlasticDB - update
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Asking for Administrator permission...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t = [IO.File]::ReadAllText('%~f0'); Invoke-Expression $t.Substring($t.IndexOf('#PS-START' + '#'))"
echo.
pause
exit /b
#PS-START#
$ErrorActionPreference = 'Stop'
$env:GIT_TERMINAL_PROMPT = '0'

# native programs write progress to the error stream; judge them by their exit code only
function Native([scriptblock]$cmd) { $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; try { & $cmd } finally { $ErrorActionPreference = $old } }

# where PlasticDB is installed: the Windows "installed apps" entry of the Setup, else the server task, else the usual places
function Find-Root {
  $id = '{8C1F7A52-3D4B-4E9A-9B1E-5A7D2C6F0B31}_is1'
  foreach ($base in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall') {
    $key = Join-Path $base $id
    if (Test-Path $key) { $p = (Get-ItemProperty $key).InstallLocation; if ($p) { return $p.TrimEnd('\') } }
  }
  try { $wd = (Get-ScheduledTask -TaskName 'PlasticDB Server' -ErrorAction Stop).Actions[0].WorkingDirectory; if ($wd) { return (Split-Path $wd -Parent) } } catch { }
  foreach ($c in 'D:\plasticdatabase', 'C:\plasticdatabase', 'C:\PlasticDB', 'D:\PlasticDB') { if (Test-Path (Join-Path $c 'deploy\windows\update-server.ps1')) { return $c } }
  return $null
}
$isRoot = { param($p) $p -and (Test-Path (Join-Path $p 'deploy\windows\update-server.ps1')) -and (Test-Path (Join-Path $p '.git')) }

try {
  Write-Host ''
  Write-Host '=== PlasticDB update ===' -ForegroundColor Cyan
  $root = Find-Root
  while (-not (& $isRoot $root)) {
    Write-Host 'Could not find the PlasticDB folder by itself.' -ForegroundColor Yellow
    $root = (Read-Host 'Type the folder PlasticDB is installed in (for example D:\plasticdatabase)').Trim('" ')
    if (-not $root) { throw 'No folder given.' }
  }
  Write-Host "PlasticDB folder: $root"

  $git = (Get-Command git.exe -ErrorAction SilentlyContinue).Source
  if (-not $git) { foreach ($c in 'C:\Program Files\Git\cmd\git.exe', 'C:\Program Files (x86)\Git\cmd\git.exe') { if (Test-Path $c) { $git = $c; break } } }
  if (-not $git) { throw 'Git is not installed on this PC, so the new version cannot be downloaded.' }

  $logs = Join-Path $root 'logs'; New-Item -ItemType Directory -Force $logs | Out-Null
  $log = Join-Path $logs ('update-' + (Get-Date -Format 'yyyy-MM-dd_HHmm') + '.txt')
  try { Start-Transcript -Path $log | Out-Null } catch { }

  # the newest update script first: an older one that is already installed must not be the one that runs
  Write-Host "`nFetching the newest version from GitHub..."
  Native { & $git -C $root fetch origin main }
  if ($LASTEXITCODE) { throw 'Could not reach GitHub (no internet?). Nothing was changed.' }
  $latest = Join-Path $root 'deploy\windows\.update-latest.ps1'
  $script = (Native { & $git -C $root show 'origin/main:deploy/windows/update-server.ps1' }) -join "`r`n"
  if ($LASTEXITCODE -or -not $script) { throw 'Could not read the update script from GitHub. Nothing was changed.' }
  Set-Content -Path $latest -Value $script -Encoding UTF8

  try {
    # set PDB_DRYRUN=1 before running to see what an update would do without changing anything
    $extra = @(); if ($env:PDB_DRYRUN) { $extra = @('-DryRun') }
    Native { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $latest @extra }
    $code = $LASTEXITCODE
  } finally { Remove-Item $latest -Force -ErrorAction SilentlyContinue }

  Write-Host ''
  if ($code) { Write-Host 'The update did not finish. Read the messages above: they say whether anything was changed (a failed new version is replaced by the previous one automatically).' -ForegroundColor Red }
  else {
    Write-Host 'Done. PlasticDB is updated and running.' -ForegroundColor Green
    Write-Host '  Check:  the program opens, and sign in works.'
  }
  Write-Host "Log: $log"
  try { Stop-Transcript | Out-Null } catch { }
}
catch {
  Write-Host "`nSTOPPED: $($_.Exception.Message)" -ForegroundColor Red
  try { Stop-Transcript | Out-Null } catch { }
}
