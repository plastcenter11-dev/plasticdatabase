<#
  Takes the PlasticDB server off a computer. Run as Administrator, from the program folder:

    powershell -ExecutionPolicy Bypass -File deploy\windows\uninstall-server.ps1

  By default it only switches the server off for good: it stops it, removes the Windows tasks (the server and
  the daily backup), the firewall rule and the desktop icons. The program folder, the database and its backups
  are LEFT, so nothing is lost and a later Setup simply carries on.

    -DropDatabase   also deletes the database and its limited account from MySQL (all the data is gone)
    -RemoveFiles    also deletes the program folder (including its database\ backups and backend\.env)
    -DryRun         prints what would be done and changes nothing

  Never touched: Node.js, Git, MySQL itself, Tailscale, the sleep settings.
#>
param([switch]$DropDatabase, [switch]$RemoveFiles, [switch]$DryRun, [int]$Port = 3001)

$ErrorActionPreference = 'Stop'
$root    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backend = Join-Path $root 'backend'

function Step($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Do-It($desc, [scriptblock]$act) {
  if ($DryRun) { Write-Host "   [dry-run] $desc" -ForegroundColor Yellow } else { Write-Host "   $desc"; & $act }
}
function Native([scriptblock]$cmd) { $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; try { & $cmd } finally { $ErrorActionPreference = $old } }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $DryRun) { throw 'Run this as Administrator.' }
if (-not (Test-Path (Join-Path $backend 'server.js'))) { throw "$root does not look like a PlasticDB folder." }
Write-Host "Program folder: $root"
if ($DropDatabase) { Write-Host 'The database will be DELETED.' -ForegroundColor Red }
if ($RemoveFiles)  { Write-Host 'The program folder will be DELETED (with its backups).' -ForegroundColor Red }

# what the database is called, read before anything is removed
$envFile = Join-Path $backend '.env'
$dbName = 'plasticdatabase'; $dbUser = 'plasticdb_app'
if (Test-Path $envFile) {
  foreach ($l in Get-Content $envFile) {
    if ($l -match '^DB_NAME=(.+)$') { $dbName = $Matches[1].Trim() }
    if ($l -match '^DB_USER=(.+)$') { $dbUser = $Matches[1].Trim() }
  }
}

if (-not $DryRun -and ($DropDatabase -or $RemoveFiles)) {
  $what = if ($DropDatabase) { "the database '$dbName'" } else { 'the program folder' }
  $typed = Read-Host "This cannot be undone. Type DELETE to remove $what"
  if ($typed -cne 'DELETE') { throw 'Cancelled: nothing was changed.' }
}

# ---- 1. stop the server ------------------------------------------------------------------------
Step '1/5 Stop the server'
Do-It 'stop the task and any server.js of this folder' {
  Stop-ScheduledTask -TaskName 'PlasticDB Server' -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'server\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

# ---- 2. tasks ----------------------------------------------------------------------------------
Step '2/5 Windows tasks'
foreach ($t in 'PlasticDB Server', 'PlasticDB Daily Backup') {
  if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) { Do-It "remove the task '$t'" { Unregister-ScheduledTask -TaskName $t -Confirm:$false } }
  else { Write-Host "   no task '$t'." }
}

# ---- 3. firewall and icons ---------------------------------------------------------------------
Step '3/5 Firewall rule and desktop icons'
if (Get-NetFirewallRule -DisplayName 'PlasticDB (VPN only)' -ErrorAction SilentlyContinue) {
  Do-It 'remove the firewall rule "PlasticDB (VPN only)"' { Get-NetFirewallRule -DisplayName 'PlasticDB (VPN only)' | Remove-NetFirewallRule }
} else { Write-Host '   no firewall rule.' }
foreach ($dir in [Environment]::GetFolderPath('CommonDesktopDirectory'), [Environment]::GetFolderPath('Desktop')) {
  foreach ($n in 'PlasticDB.lnk', 'PlasticDB.url') {
    $f = Join-Path $dir $n
    if (Test-Path $f) { Do-It "remove $f" { Remove-Item $f -Force } }
  }
}

# ---- 4. database -------------------------------------------------------------------------------
Step '4/5 Database'
if (-not $DropDatabase) {
  Write-Host "   left as it is ('$dbName'). Use -DropDatabase to delete it."
} else {
  $mysql = (Get-Command mysql -ErrorAction SilentlyContinue).Source
  if (-not $mysql) { $mysql = Get-ChildItem 'C:\Program Files\MySQL\*\bin\mysql.exe' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName }
  if (-not $mysql -and -not $DryRun) { throw 'The MySQL client was not found.' }
  Do-It "delete the database '$dbName' and the account '$dbUser' (the MySQL root password is asked for)" {
    $sec = Read-Host 'MySQL root password' -AsSecureString
    $env:MYSQL_PWD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    try {
      $sql = "DROP DATABASE IF EXISTS ``$dbName``; DROP DATABASE IF EXISTS ``plasticdb_restore_test``; DROP USER IF EXISTS '$dbUser'@'localhost'; FLUSH PRIVILEGES;"
      Native { $sql | & $mysql -u root }; if ($LASTEXITCODE) { throw 'MySQL refused: is the root password right?' }
    } finally { Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue }
  }
}

# ---- 5. files ----------------------------------------------------------------------------------
Step '5/5 Program folder'
if (-not $RemoveFiles) {
  Write-Host "   left as it is ($root). Use -RemoveFiles to delete it."
} else {
  Do-It "delete $root (a moment after this window closes) and the Setup log" {
    $cmd = "ping -n 4 127.0.0.1 >nul & rmdir /s /q `"$root`" & rmdir /s /q `"$env:ProgramData\PlasticDB`""
    Start-Process -FilePath cmd.exe -ArgumentList '/c', "`"$cmd`"" -WindowStyle Hidden
  }
}

Write-Host "`nDone." -ForegroundColor Green
if (-not $RemoveFiles) { Write-Host 'To install again, run PlasticDB-Setup.exe and choose this same folder.' }
