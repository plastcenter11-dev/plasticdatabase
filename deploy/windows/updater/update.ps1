$ErrorActionPreference = 'Stop'
$env:GIT_TERMINAL_PROMPT = '0'
$Host.UI.RawUI.WindowTitle = 'PlasticDB update - RUNNING, do not close'

# native programs write progress to the error stream; judge them by their exit code only
function Native([scriptblock]$cmd) { $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; try { & $cmd } finally { $ErrorActionPreference = $old } }

# the ONE line the person reads at the end
function Banner($text, $color, $title) {
  $Host.UI.RawUI.WindowTitle = "PlasticDB update - $title"
  $bar = '=' * 64
  Write-Host ''; Write-Host $bar -ForegroundColor $color
  foreach ($l in $text) { Write-Host "   $l" -ForegroundColor $color }
  Write-Host $bar -ForegroundColor $color
}

# the log starts before anything else, so even a failure at the very beginning leaves something to read
$logDir = Join-Path $env:ProgramData 'PlasticDB'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir ('update-' + (Get-Date -Format 'yyyy-MM-dd_HHmm') + '.txt')
try { Start-Transcript -Path $log | Out-Null } catch { }

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

# does the program answer? (401 = it answers, it just wants a sign-in)
function Server-Answers {
  try { Invoke-WebRequest -UseBasicParsing 'http://localhost:3001/api/options' -TimeoutSec 8 | Out-Null; return $true }
  catch { return ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) }
}

# starts the server (the Windows task, or else the same way as the desktop icon) and waits until it answers
function Start-Program($folder) {
  try { Start-ScheduledTask -TaskName 'PlasticDB Server' -ErrorAction Stop } catch { }
  for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Seconds 2; if (Server-Answers) { return $true } }
  $opener = Join-Path $folder 'deploy\windows\open-server.ps1'
  if (Test-Path $opener) { Native { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $opener -NoBrowser } | Out-Host }
  return (Server-Answers)
}

$verdict = 'FAILED'
$root = $null
try {
  Write-Host ''
  Write-Host '=== PlasticDB update ===' -ForegroundColor Cyan
  Write-Host 'This takes 2 to 5 minutes. Wait for the big FINISHED or FAILED line at the end.'
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

  # the newest update script first: an older one that is already installed must not be the one that runs
  Write-Host "`nFetching the newest version from GitHub..."
  Native { & $git -C $root fetch origin main }
  if ($LASTEXITCODE) { throw 'Could not reach GitHub (is there internet on this PC?). Nothing was changed.' }
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

  # the verdict is checked, not assumed: the update script said OK, the program is built from the newest
  # commit, and it answers
  $newest = ((Native { & $git -C $root rev-parse 'origin/main' }) | Select-Object -First 1).ToString().Trim()
  $builtFile = Join-Path $root '.built-commit'
  $built = if (Test-Path $builtFile) { (Get-Content $builtFile -TotalCount 1).Trim() } else { '' }
  $answers = Server-Answers
  # never leave the program switched off, whatever happened above
  if (-not $answers -and -not $env:PDB_DRYRUN) {
    Write-Host "`nThe program is not answering: starting it again..." -ForegroundColor Yellow
    $answers = Start-Program $root
  }

  if ($code -ne 0) { $verdict = 'FAILED' }
  elseif ($env:PDB_DRYRUN) { $verdict = 'DRYRUN' }
  elseif ($built -eq $newest -and $answers) { $verdict = 'OK' }
  else { $verdict = 'UNSURE' }

  Write-Host ''
  Write-Host ('Version running : ' + $(if ($built) { $built.Substring(0, [Math]::Min(7, $built.Length)) } else { 'unknown' }))
  Write-Host ('Newest version  : ' + $newest.Substring(0, [Math]::Min(7, $newest.Length)))
  Write-Host ('Program answers : ' + $(if ($answers) { 'yes' } else { 'NO' }))
}
catch {
  Write-Host "`nSTOPPED: $($_.Exception.Message)" -ForegroundColor Red
  $verdict = 'FAILED'
}

switch ($verdict) {
  'OK'     { Banner @('FINISHED - the update is DONE.', 'PlasticDB is the newest version and it is running.', 'You can close this window and use the program.') 'Green' 'FINISHED' }
  'DRYRUN' { Banner @('DRY RUN - nothing was changed.') 'Yellow' 'dry run' }
  'UNSURE' { Banner @('NOT SURE - the update script finished without an error,', 'but the check did not pass (see the three lines above).', 'Open the program and look. If it does not open, run this file again.') 'Yellow' 'CHECK' }
  default  {
    # say what is really the case now, not what is supposed to be the case
    $running = Server-Answers
    if (-not $running -and $root -and -not $env:PDB_DRYRUN) { $running = Start-Program $root }
    $state = if ($running) { 'The program IS running, you can keep working.' } else { 'THE PROGRAM IS NOT RUNNING: double-click the PlasticDB icon on the desktop.' }
    Banner @('FAILED - the update did NOT finish.', $state, 'Read the red lines above. Running this file again is safe.', 'Send the log below if you need help.') 'Red' 'FAILED'
  }
}
Write-Host "Log: $log"
try { Stop-Transcript | Out-Null } catch { }
if ($root -and (Test-Path (Join-Path $root 'logs'))) { try { Copy-Item $log (Join-Path $root 'logs') -Force } catch { } }
