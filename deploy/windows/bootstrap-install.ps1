<#
  The work behind PlasticDB-Setup.exe: turns a Windows machine that already has Node.js, Git and MySQL into
  the PlasticDB server. Run as Administrator. Safe to repeat (a second run only updates what is missing).

    powershell -ExecutionPolicy Bypass -File bootstrap-install.ps1 -InstallDir C:\PlasticDB

  The MySQL root password is read from the environment variable PDB_MYSQL_ROOT_PW (never from the command
  line) and is used only to create the program's own database account; it is not stored anywhere.

  Steps: 1 download the code from GitHub -> 2 database and its limited account -> 3 backend\.env ->
         4 install-server.ps1 (screens, service, no-sleep, VPN-only firewall) -> 5 daily backup task.
  -DryRun prints the plan. -SkipService stops after step 3 (used to test the installer on a machine that
  is already a server).
#>
param(
  [string]$InstallDir = 'C:\PlasticDB',
  [string]$Repo = 'https://github.com/plastcenter11-dev/plasticdatabase.git',
  [string]$DbName = 'plasticdatabase',
  [string]$DbUser = 'plasticdb_app',
  [int]$Port = 3001,
  [switch]$DryRun,
  [switch]$SkipService
)

$ErrorActionPreference = 'Stop'
# Everything printed here is also written to a log file, and an error keeps the window open: without this the
# window vanished with the message and nobody could tell what had gone wrong. (The log never holds a password.)
$logPath = Join-Path $env:ProgramData 'PlasticDB\setup-log.txt'
if (-not $DryRun) {
  New-Item -ItemType Directory -Force (Split-Path $logPath) | Out-Null
  try { Start-Transcript -Path $logPath -Append | Out-Null } catch { }
}
trap {
  Write-Host ("`nERROR: " + $_.Exception.Message) -ForegroundColor Red
  Write-Host "Details are in $logPath (send that file or a photo of this window)" -ForegroundColor Red
  try { Stop-Transcript | Out-Null } catch { }
  if (-not $DryRun) { Read-Host 'Press Enter to close' | Out-Null }
  exit 1
}
$env:GIT_TERMINAL_PROMPT = '0'

function Step($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Do-It($desc, [scriptblock]$act) {
  if ($DryRun) { Write-Host "   [dry-run] $desc" -ForegroundColor Yellow } else { Write-Host "   $desc"; & $act }
}
# native commands (git, npm, mysql) write progress to the error stream: judge them by exit code only
function Native([scriptblock]$cmd) { $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; try { & $cmd } finally { $ErrorActionPreference = $old } }
# a password somebody has to read from a screen and type: no 0/O, 1/l/I that look alike
function New-TypedPassword([int]$length) {
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  $b = New-Object byte[] $length; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  -join ($b | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
}
function New-Secret([int]$bytes) {
  $b = New-Object byte[] $bytes; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

# ---- checks ------------------------------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $DryRun) { throw 'Run this as Administrator.' }
if ($DbName -notmatch '^[A-Za-z0-9_]+$' -or $DbUser -notmatch '^[A-Za-z0-9_]+$') { throw 'The database and user names may only contain letters, digits and _.' }
# Git and Node are looked for on the PATH first and then in their usual folders (a program installed a minute
# ago is not on the PATH of a window that was already open)
function Find-Tool($name, [string[]]$usual) {
  $c = (Get-Command $name -ErrorAction SilentlyContinue).Source
  if ($c) { return $c }
  foreach ($p in $usual) { if (Test-Path $p) { return $p } }
}
$git  = Find-Tool git  @('C:\Program Files\Git\cmd\git.exe', 'C:\Program Files (x86)\Git\cmd\git.exe', "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe")
$node = Find-Tool node @('C:\Program Files\nodejs\node.exe', 'C:\Program Files (x86)\nodejs\node.exe')
foreach ($t in @($git, $node)) { if ($t) { $d = Split-Path $t; if (($env:Path -split ';') -notcontains $d) { $env:Path = "$d;$env:Path" } } }   # npm and git for the steps below
$mysql = (Get-Command mysql -ErrorAction SilentlyContinue).Source
if (-not $mysql) { $mysql = Get-ChildItem 'C:\Program Files\MySQL\*\bin\mysql.exe' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName }
if (-not $git)   { throw 'Git is not installed (https://git-scm.com/download/win).' }
if (-not $node)  { throw 'Node.js is not installed (https://nodejs.org, the LTS version).' }
if (-not $mysql) { throw 'The MySQL command line client was not found (install MySQL Server 8 from https://dev.mysql.com/downloads/installer/).' }
$rootPw = $env:PDB_MYSQL_ROOT_PW
if (-not $rootPw -and -not $DryRun) { throw 'The MySQL root password was not given (environment variable PDB_MYSQL_ROOT_PW).' }
Write-Host "Folder : $InstallDir`nGit    : $git`nNode   : $node`nMySQL  : $mysql`nDatabase: $DbName (account $DbUser)`nPort   : $Port"

# ---- 1. the code -------------------------------------------------------------------------------
Step '1/5 The program files from GitHub'
$isRepo = Test-Path (Join-Path $InstallDir '.git')
if ($isRepo) {
  Do-It 'already downloaded: bringing it up to date' { Native { & $git -C $InstallDir pull --ff-only origin main }; if ($LASTEXITCODE) { throw 'git pull failed' } }
} else {
  if ((Test-Path $InstallDir) -and (Get-ChildItem $InstallDir -Force | Select-Object -First 1)) { throw "$InstallDir is not empty and is not a PlasticDB folder. Pick an empty folder." }
  Do-It "clone $Repo" { Native { & $git clone --branch main $Repo $InstallDir }; if ($LASTEXITCODE) { throw 'git clone failed (is the internet on?)' } }
}
$backend = Join-Path $InstallDir 'backend'
$envFile = Join-Path $backend '.env'

# ---- 2. database and its limited account -------------------------------------------------------
Step "2/5 Database '$DbName' and the limited account '$DbUser'"
$dbPass = $null
if (Test-Path $envFile) {
  $m = (Get-Content $envFile | Where-Object { $_ -match '^DB_PASS=' } | Select-Object -First 1)
  if ($m) { $dbPass = $m -replace '^DB_PASS=', '' }
}
if (-not $dbPass) { $dbPass = New-Secret 24 }
$sql = @"
CREATE DATABASE IF NOT EXISTS ``$DbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DbUser'@'localhost' IDENTIFIED BY '$dbPass';
ALTER USER '$DbUser'@'localhost' IDENTIFIED BY '$dbPass';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, LOCK TABLES, CREATE TEMPORARY TABLES, SHOW VIEW, TRIGGER, EVENT ON ``$DbName``.* TO '$DbUser'@'localhost';
GRANT ALL PRIVILEGES ON ``plasticdb_restore_test``.* TO '$DbUser'@'localhost';
GRANT PROCESS ON *.* TO '$DbUser'@'localhost';
FLUSH PRIVILEGES;
"@
Do-It 'create the database and the account (the root password is used once and not kept)' {
  $env:MYSQL_PWD = $rootPw
  try { Native { $sql | & $mysql -u root --default-character-set=utf8mb4 }; if ($LASTEXITCODE) { throw 'MySQL refused: is the root password right?' } }
  finally { Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue }
}

# ---- 3. backend\.env ---------------------------------------------------------------------------
Step '3/5 backend\.env'
$firstLogin = $null
if (Test-Path $envFile) {
  Write-Host '   backend\.env already exists: left as it is.'
} else {
  $adminPw = New-TypedPassword 12
  $firstLogin = $adminPw
  $lines = @(
    'DB_HOST=localhost', "DB_USER=$DbUser", "DB_PASS=$dbPass", "DB_NAME=$DbName", '',
    "PORT=$Port", 'NODE_ENV=production', "JWT_SECRET=$(New-Secret 48)", 'TOKEN_LIFETIME=12h', '',
    '# only used the first time, when no admin exists yet; removed again once the server has started',
    "ADMIN_INITIAL_PASSWORD=$adminPw")
  Do-It 'write backend\.env (database account, a random signing key, production mode)' {
    New-Item -ItemType Directory -Force $backend | Out-Null
    Set-Content -Path $envFile -Value $lines -Encoding ASCII
  }
}

if ($SkipService) { Write-Host "`n-SkipService: stopped before the service step." -ForegroundColor Yellow; return }

# ---- 4. the service ----------------------------------------------------------------------------
Step '4/5 Server service (install-server.ps1)'
Do-It 'run install-server.ps1' {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallDir 'deploy\windows\install-server.ps1') -Port $Port
  if ($LASTEXITCODE) { throw 'install-server.ps1 failed' }
}
if ($firstLogin) {
  # The server creates "admin" only when there is none. If this database already had one (an earlier install),
  # the password shown here would not be the real one, so it is set explicitly: what is shown always works.
  Do-It 'make sure the admin account has exactly the password shown at the end' {
    Push-Location $backend
    try { Native { & $node (Join-Path $backend 'scripts\reset_password.js') $firstLogin }; if ($LASTEXITCODE) { throw 'Could not set the admin password.' } }
    finally { Pop-Location }
  }
  Do-It 'take the one-time admin password out of backend\.env and keep it in first-login.txt' {
    Set-Content -Path $envFile -Value (Get-Content $envFile | Where-Object { $_ -notmatch '^ADMIN_INITIAL_PASSWORD=|^# only used the first time' }) -Encoding ASCII
    $f = Join-Path $InstallDir 'first-login.txt'
    Set-Content -Path $f -Encoding UTF8 -Value @('PlasticDB first sign-in', 'user:     admin', "password: $firstLogin", '', 'Sign in, change the password (Settings), then DELETE this file.')
  }
}

# ---- 5. daily backup ---------------------------------------------------------------------------
Step "5/5 Daily backup task 'PlasticDB Daily Backup'"
# Every night at 01:00, as the system (nobody has to be signed in). If the computer was off at 01:00 the backup
# runs as soon as it is switched on (StartWhenAvailable); if it fails (MySQL still getting ready) it tries
# again 3 times, 10 minutes apart. Registered again on every run, so an older, weaker task is replaced.
Do-It 'every day at 01:00 (backup + accounting check), made up for when the machine was off' {
  $act = New-ScheduledTaskAction -Execute $node -Argument "`"$(Join-Path $backend 'scripts\daily.js')`"" -WorkingDirectory $backend
  $trg = New-ScheduledTaskTrigger -Daily -At '01:00'
  $set = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10) -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
  $pri = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName 'PlasticDB Daily Backup' -Action $act -Trigger $trg -Settings $set -Principal $pri -Force | Out-Null
}

try { Stop-Transcript | Out-Null } catch { }   # the first sign-in below must not end up in the log
Write-Host "`nDone. The program is at http://localhost:$Port" -ForegroundColor Green
if ($firstLogin) { Write-Host "First sign-in: admin / $firstLogin   (also in $InstallDir\first-login.txt: delete it after you have noted it)" -ForegroundColor Green }
Write-Host 'Next: install Tailscale here and on every branch, then open http://<this machine''s Tailscale address>:' -NoNewline; Write-Host $Port
