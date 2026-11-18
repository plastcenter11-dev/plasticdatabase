<#
  The work behind PlasticDB-Client-Setup.exe: makes a branch computer able to open the program on the server.
  Run as Administrator. Safe to repeat.

    powershell -ExecutionPolicy Bypass -File client-install.ps1 -ServerUrl http://100.93.43.62:3001

  1. installs Tailscale (the private link to the server) if it is not there: downloaded from tailscale.com and
     checked for Tailscale's own digital signature before it is run
  2. connects it: opens the sign-in page (or uses the one-time key in PDB_TS_AUTHKEY when the branch was given one)
  3. waits until the server answers
  -DryRun prints the plan and changes nothing.
#>
param(
  [string]$ServerUrl = 'http://100.93.43.62:3001',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$msiUrl = 'https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi'
$ts     = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
$tsGui  = Join-Path $env:ProgramFiles 'Tailscale\tailscale-ipn.exe'

function Step($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Native([scriptblock]$cmd) { $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; try { & $cmd } finally { $ErrorActionPreference = $old } }
function Server-Answers {
  try { Invoke-WebRequest -UseBasicParsing $ServerUrl -TimeoutSec 8 | Out-Null; return $true } catch { return $false }
}
function My-TailscaleIp {
  if (-not (Test-Path $ts)) { return $null }
  $ip = (Native { & $ts ip -4 2>$null } | Select-Object -First 1)
  if ($ip -match '^100\.') { return $ip } else { return $null }
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $DryRun) { throw 'Run this as Administrator.' }
if ($ServerUrl -notmatch '^https?://[A-Za-z0-9.\-]+(:[0-9]+)?/?$') { throw "The server address does not look right: $ServerUrl" }
Write-Host "Server: $ServerUrl"

# ---- 1. Tailscale ------------------------------------------------------------------------------
Step '1/3 Tailscale (the private link to the server)'
if (Test-Path $ts) {
  Write-Host '   already installed.'
} elseif ($DryRun) {
  Write-Host "   [dry-run] download $msiUrl, check its signature, install it silently" -ForegroundColor Yellow
} else {
  $dir = Join-Path $env:TEMP ('pdb-ts-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory $dir | Out-Null
  $msi = Join-Path $dir 'tailscale.msi'
  Write-Host '   downloading Tailscale (about 37 MB)...'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -UseBasicParsing $msiUrl -OutFile $msi -TimeoutSec 600
  $sig = Get-AuthenticodeSignature $msi
  if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'Tailscale') {
    throw "The downloaded file is not signed by Tailscale (status: $($sig.Status)). Nothing was installed."
  }
  Write-Host '   signature checked: Tailscale Inc. Installing...'
  $p = Start-Process msiexec.exe -ArgumentList '/i', "`"$msi`"", '/quiet', '/norestart' -Wait -PassThru
  if ($p.ExitCode -notin 0, 3010) { throw "The Tailscale installer failed (code $($p.ExitCode))." }
  if (-not (Test-Path $ts)) { throw 'Tailscale did not install.' }
  Write-Host '   installed.'
}

# ---- 2. connect --------------------------------------------------------------------------------
Step '2/3 Connect to the private network'
if (My-TailscaleIp) {
  Write-Host "   already connected (address $(My-TailscaleIp))."
} elseif ($DryRun) {
  Write-Host '   [dry-run] sign in (browser page, or the one-time key if one was given)' -ForegroundColor Yellow
} else {
  if (Test-Path $tsGui) { Start-Process $tsGui -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 5
  $key = $env:PDB_TS_AUTHKEY
  if ($key) {
    Write-Host '   signing in with the key you were given...'
    Native { & $ts up --auth-key=$key --unattended 2>&1 | Out-Null }
  } else {
    Write-Host '   opening the sign-in page: sign in (or create a free account) and accept.'
    $out = Join-Path $env:TEMP 'pdb-ts-up.txt'
    Remove-Item $out -ErrorAction SilentlyContinue
    Start-Process -FilePath $ts -ArgumentList 'up', '--unattended' -WindowStyle Hidden -RedirectStandardError $out -RedirectStandardOutput "$out.o" | Out-Null
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Seconds 1
      $txt = (Get-Content $out, "$out.o" -ErrorAction SilentlyContinue) -join ' '
      if ($txt -match '(https://login\.tailscale\.com/a/[A-Za-z0-9]+)') { Start-Process $Matches[1]; break }
    }
  }
  Write-Host '   waiting for the sign-in to finish (up to 5 minutes)...'
  for ($i = 0; $i -lt 100 -and -not (My-TailscaleIp); $i++) { Start-Sleep -Seconds 3 }
  if (-not (My-TailscaleIp)) { throw 'Tailscale is not signed in yet. Open the Tailscale icon next to the clock, choose "Log in", then run this Setup again.' }
  Write-Host "   connected (address $(My-TailscaleIp))."
}

# ---- 3. the server -----------------------------------------------------------------------------
Step '3/3 Is the server reachable?'
if ($DryRun) {
  Write-Host "   [dry-run] wait until $ServerUrl answers" -ForegroundColor Yellow
} else {
  $ok = $false
  for ($i = 0; $i -lt 10 -and -not $ok; $i++) { $ok = Server-Answers; if (-not $ok) { Start-Sleep -Seconds 3 } }
  if ($ok) { Write-Host '   the server answers.' -ForegroundColor Green }
  else {
    Write-Host '   The server does not answer yet. This is normal until the owner has shared the server with your account' -ForegroundColor Yellow
    Write-Host '   (accept the invitation link you were sent) or if the server computer is off. The shortcut is ready anyway.' -ForegroundColor Yellow
  }
}
Write-Host "`nDone. Open the PlasticDB shortcut on the desktop ($ServerUrl)." -ForegroundColor Green
