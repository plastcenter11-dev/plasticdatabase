<#
  Updates the running server to the newest version on GitHub (run as Administrator, outside working hours:
  the branches are cut off for a minute or two):

    powershell -ExecutionPolicy Bypass -File deploy\windows\update-server.ps1

  Order of work: refuse if the code folder has uncommitted changes -> backup of the database ->
  stop the server -> git pull -> npm install + build -> start -> health check + accounting check.
  If the new version does not come up healthy, the previous code is put back and started again
  (the database is never rolled back: new columns are harmless to the old code; if you ever need the
  old data too, the backup taken in step 2 is in the database folder).
  -DryRun prints the plan and changes nothing.
#>
param([switch]$DryRun, [int]$Port = 3001, [string]$Branch = 'main')

$ErrorActionPreference = 'Stop'
$env:GIT_TERMINAL_PROMPT = '0'   # never wait for a credential prompt nobody can answer
$root    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backend = Join-Path $root 'backend'
$front   = Join-Path $root 'frontend'
$taskName = 'PlasticDB Server'

# npm and vite write progress and warnings to the error stream; with ErrorActionPreference=Stop Windows
# PowerShell 5.1 would turn each of those lines into a fatal error. Native commands are judged by exit code only.
function Native([scriptblock]$cmd) { $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; try { & $cmd } finally { $ErrorActionPreference = $old } }
function Step($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Run-Git { $a = $args; Native { & git.exe -C $root @a }; if ($LASTEXITCODE) { throw "git $($args -join ' ') failed" } }
function Wait-Server {
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    try { Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/api/options" -TimeoutSec 5 | Out-Null; return $true }
    catch { if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) { return $true } }
  }
  return $false
}
# A process can end by itself between being listed and being stopped (the task has just been told to stop): that
# is success, not an error. Then wait until none is left, so the port is free for the new one.
function Stop-Server {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  for ($i = 0; $i -lt 20; $i++) {
    $procs = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'server\.js' })
    if (-not $procs.Count) { return }
    $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
  }
  throw 'The running server could not be stopped.'
}
function Build-All {
  Push-Location $backend; Native { npm install --no-audit --no-fund }; if ($LASTEXITCODE) { throw 'backend npm install failed' }; Pop-Location
  Push-Location $front;   Native { npm install --no-audit --no-fund }; if ($LASTEXITCODE) { throw 'frontend npm install failed' }
  Native { npm run build }; if ($LASTEXITCODE) { throw 'frontend build failed' }; Pop-Location
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $DryRun) { throw 'Run this from an Administrator PowerShell.' }

Step '1/6 Is the code folder clean?'
$dirty = (& git.exe -C $root status --porcelain) | Where-Object { $_ -notmatch '^\?\?' }
if ($dirty) { Write-Host ($dirty -join "`n"); throw 'There are uncommitted changes in the code folder. Commit or discard them first; an update must not overwrite work.' }
$before = (& git.exe -C $root rev-parse HEAD).Trim()
Run-Git fetch origin $Branch
$after = (& git.exe -C $root rev-parse "origin/$Branch").Trim()
Write-Host "   running : $before`n   newest  : $after"
# the commit the running program was last built and started from (written at the end of a good update): the code
# folder can already be on the newest commit (pulled by hand) while the program still runs the old build
$builtFile = Join-Path $root '.built-commit'
$built = if (Test-Path $builtFile) { (Get-Content $builtFile -TotalCount 1).Trim() } else { '' }
if ($before -eq $after -and $built -eq $after) { Write-Host '   Already up to date.' -ForegroundColor Green; return }
if ($before -eq $after) { Write-Host '   The code is the newest, but the running program was not built from it yet: building and restarting.' -ForegroundColor Yellow }
Write-Host ((& git.exe -C $root log --oneline "$before..$after") -join "`n")
if ($DryRun) { Write-Host "`n[dry-run] would back up, stop the server, pull, build, start and check. Nothing changed." -ForegroundColor Yellow; return }

Step '2/6 Backup (a failed backup stops the update)'
$node = (Get-Command node).Source
Native { & $node (Join-Path $backend 'scripts\backup.js') }; if ($LASTEXITCODE) { throw 'The backup failed: nothing was changed.' }

# From here on the server may be down: whatever fails, the catch below starts it again.
try {
  Step '3/6 Stop the server'
  Stop-Server

  Step '4/6 New code'
  Run-Git merge --ff-only "origin/$Branch"
  Build-All

  Step '5/6 Start and check'
  Start-ScheduledTask -TaskName $taskName
  if (-not (Wait-Server)) { throw 'The new version did not come up.' }
  Push-Location $backend; Native { & $node scripts\check_invariants.js }; $inv = $LASTEXITCODE; Pop-Location
  if ($inv) { throw 'The accounting check found errors with the new version.' }
  Set-Content -Path $builtFile -Value $after -Encoding ascii
  Write-Host "`nUpdated to $after and healthy." -ForegroundColor Green
}
catch {
  Write-Host "`nFAILED: $($_.Exception.Message)`nPutting the previous version back..." -ForegroundColor Red
  # nothing here may keep the server from being started again
  try { Stop-Server } catch { Write-Host $_.Exception.Message -ForegroundColor Red }
  try { Run-Git reset --hard $before; Build-All } catch { Write-Host $_.Exception.Message -ForegroundColor Red }
  Start-ScheduledTask -TaskName $taskName
  if (Wait-Server) { Write-Host "Back on $before and running." -ForegroundColor Yellow } else { Write-Host 'The old version did not start either: read logs\app.log and restore the backup if needed.' -ForegroundColor Red }
  exit 1
}
