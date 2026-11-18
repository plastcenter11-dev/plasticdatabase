<#
  Turns this Windows machine into the PlasticDB server (run once, as Administrator):

    powershell -ExecutionPolicy Bypass -File deploy\windows\install-server.ps1

  What it does (every step is safe to repeat):
    1. builds the screens (frontend\dist) and installs the backend packages
    2. makes backend\.env production-ready (a strong JWT_SECRET, NODE_ENV=production); the old .env is copied first
    3. registers the Windows scheduled task "PlasticDB Server": starts with the machine, restarts itself if it stops
    4. stops this machine from going to sleep (a sleeping server stops every branch)
    5. opens port 3001 ONLY to the private VPN range (Tailscale 100.64.0.0/10), not to the internet
    6. puts a "PlasticDB" shortcut on the desktop and waits until the server answers

  Nothing here touches the database contents. The daily backup task ("PlasticDB Daily Backup") is left as it is.
  -DryRun prints what would be done and changes nothing.
#>
param([switch]$DryRun, [int]$Port = 3001)

$ErrorActionPreference = 'Stop'
$root    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backend = Join-Path $root 'backend'
$front   = Join-Path $root 'frontend'
$logs    = Join-Path $root 'logs'
$taskName = 'PlasticDB Server'

# npm and vite write progress and warnings to the error stream; with ErrorActionPreference=Stop Windows
# PowerShell 5.1 would turn each of those lines into a fatal error. Native commands are judged by exit code only.
function Native([scriptblock]$cmd) { $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; try { & $cmd } finally { $ErrorActionPreference = $old } }
function Step($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Do-It($desc, [scriptblock]$act) {
  if ($DryRun) { Write-Host "   [dry-run] $desc" -ForegroundColor Yellow } else { Write-Host "   $desc"; & $act }
}

# ---- checks -----------------------------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $DryRun) { throw 'Run this from an Administrator PowerShell (right click > Run as administrator).' }
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Node.js is not installed (https://nodejs.org, the LTS version).' }
if (-not (Get-Service | Where-Object { $_.Name -match 'mysql|mariadb' })) { Write-Warning 'No MySQL service found. The program needs MySQL on this machine.' }
if (-not (Test-Path (Join-Path $backend '.env'))) { throw 'backend\.env is missing. Copy deploy\env.production.example to backend\.env and fill in the database user first.' }
Write-Host "Project : $root`nNode    : $node`nPort    : $Port"

# ---- 1. build ---------------------------------------------------------------------------------
Step '1/6 Screens and packages'
Do-It 'npm install (backend)'  { Push-Location $backend; Native { npm install --no-audit --no-fund }; if ($LASTEXITCODE) { throw 'backend npm install failed' }; Pop-Location }
Do-It 'npm install + build (frontend)' {
  Push-Location $front
  Native { npm install --no-audit --no-fund }; if ($LASTEXITCODE) { throw 'frontend npm install failed' }
  Native { npm run build }; if ($LASTEXITCODE) { throw 'frontend build failed' }
  Pop-Location
}

# ---- 2. .env ----------------------------------------------------------------------------------
Step '2/6 backend\.env for production'
$envFile = Join-Path $backend '.env'
$lines = Get-Content $envFile
function Get-Val($k) { ($lines | Where-Object { $_ -match "^$k=" } | Select-Object -First 1) -replace "^$k=", '' }
function Set-Val($k, $v) {
  if ($script:lines | Where-Object { $_ -match "^$k=" }) { $script:lines = $script:lines | ForEach-Object { if ($_ -match "^$k=") { "$k=$v" } else { $_ } } }
  else { $script:lines += "$k=$v" }
}
$secret = Get-Val 'JWT_SECRET'
$changed = $false
if ("$secret".Length -lt 32) {
  Write-Host '   JWT_SECRET is shorter than 32 characters: a new random one is made (everybody has to sign in again once).'
  $bytes = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  Set-Val 'JWT_SECRET' ([Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')); $changed = $true
}
if ((Get-Val 'NODE_ENV') -ne 'production') { Set-Val 'NODE_ENV' 'production'; $changed = $true }
if ((Get-Val 'PORT') -ne "$Port") { Set-Val 'PORT' "$Port"; $changed = $true }
if ((Get-Val 'DB_USER') -eq 'root') { Write-Warning 'The program runs as the MySQL root user. Create the limited user (deploy\mysql_app_user.sql) and put it in .env: DB_USER / DB_PASS.' }
if ($changed) {
  Do-It "copy .env to .env.bak-$(Get-Date -Format yyyyMMdd-HHmm) and save the changes" {
    Copy-Item $envFile "$envFile.bak-$(Get-Date -Format yyyyMMdd-HHmm)"
    Set-Content -Path $envFile -Value $lines -Encoding ASCII
  }
} else { Write-Host '   .env is already fine.' }

# ---- 3. scheduled task ------------------------------------------------------------------------
Step "3/6 Scheduled task '$taskName'"
Do-It 'register the task (starts with the machine, restarts every minute if it stops)' {
  New-Item -ItemType Directory -Force $logs | Out-Null
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  $act  = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$node`" server.js >> `"$logs\app.log`" 2>&1`"" -WorkingDirectory $backend
  $trig = New-ScheduledTaskTrigger -AtStartup
  $set  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
  $pri  = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $taskName -Action $act -Trigger $trig -Settings $set -Principal $pri -Force | Out-Null
}

# ---- 4. no sleep ------------------------------------------------------------------------------
Step '4/6 The machine must not sleep'
Do-It 'sleep and hibernate off while plugged in (the screen may still turn off)' {
  powercfg /change standby-timeout-ac 0; powercfg /change hibernate-timeout-ac 0; powercfg /hibernate off
}

# ---- 5. firewall ------------------------------------------------------------------------------
Step "5/6 Firewall: port $Port only from the VPN range"
Do-It 'rule "PlasticDB (VPN only)"' {
  Get-NetFirewallRule -DisplayName 'PlasticDB (VPN only)' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName 'PlasticDB (VPN only)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -RemoteAddress '100.64.0.0/10' -Profile Any | Out-Null
}

# ---- 6. start ---------------------------------------------------------------------------------
Step '6/6 Start and check'
Do-It 'desktop shortcut' {
  $lnk = Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'PlasticDB.url'
  Set-Content -Path $lnk -Value "[InternetShortcut]`r`nURL=http://localhost:$Port" -Encoding ASCII
}
Do-It 'start the task and wait for the server' {
  Start-ScheduledTask -TaskName $taskName
  $ok = $false
  for ($i = 0; $i -lt 60 -and -not $ok; $i++) {
    Start-Sleep -Seconds 2
    try { Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/api/options" -TimeoutSec 5 | Out-Null; $ok = $true }
    catch { if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) { $ok = $true } }
  }
  if (-not $ok) { throw "The server did not answer on port $Port. Read $logs\app.err.log / app.log." }
  Write-Host "   Server is up: http://localhost:$Port" -ForegroundColor Green
}
Write-Host "`nDone. Next: install Tailscale on this machine and on every branch, then open http://<this machine's Tailscale address>:$Port from the branch." -ForegroundColor Green
