<#
  The "PlasticDB" icon on the server computer's desktop: makes sure the server is running (starting it hidden
  in the background if it is not) and then opens the program in the browser. Nothing stays open on screen.
  Made by install-server.ps1; can also be run by hand:

    powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File deploy\windows\open-server.ps1

  -NoBrowser only makes sure the server is running (used for testing).
#>
param([int]$Port = 3001, [switch]$NoBrowser)

$root    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backend = Join-Path $root 'backend'
$logs    = Join-Path $root 'logs'
$url     = "http://localhost:$Port"

# 401 (not signed in) also means the server answers
function Answers {
  try { Invoke-WebRequest -UseBasicParsing "$url/api/options" -TimeoutSec 4 | Out-Null; return $true }
  catch { return [bool]$_.Exception.Response }
}
function Wait-Answers([int]$seconds) {
  for ($i = 0; $i -lt $seconds / 2; $i++) { if (Answers) { return $true }; Start-Sleep -Seconds 2 }
  return $false
}

Add-Type -AssemblyName System.Windows.Forms
$tray = $null
function Tell($text) {
  if ($NoBrowser) { Write-Host $text; return }
  if (-not $script:tray) {
    $script:tray = New-Object System.Windows.Forms.NotifyIcon
    $script:tray.Icon = [System.Drawing.SystemIcons]::Information
    $script:tray.Visible = $true
  }
  $script:tray.ShowBalloonTip(8000, 'PlasticDB', $text, [System.Windows.Forms.ToolTipIcon]::Info)
}

try {
  if (-not (Answers)) {
    Tell 'Starting the server... the program opens by itself when it is ready (can take a minute).'
    # the normal way: the Windows task that runs the server (only works for an administrator)
    try { Start-ScheduledTask -TaskName 'PlasticDB Server' -ErrorAction Stop } catch { }
    if (-not (Wait-Answers 6)) {
      # no rights for the task: start the server here, hidden (its own log file: app.log is held open by the task)
      $node = (Get-Command node -ErrorAction SilentlyContinue).Source
      if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
      New-Item -ItemType Directory -Force $logs | Out-Null
      $env:PORT = "$Port"
      Start-Process -FilePath cmd.exe -ArgumentList '/c', "`"`"$node`" server.js >> `"$logs\app-icon.log`" 2>&1`"" -WorkingDirectory $backend -WindowStyle Hidden
      if (-not (Wait-Answers 180)) {
        if ($NoBrowser) { Write-Host "The server did not start (see $logs\app-icon.log)" }
        else { [System.Windows.Forms.MessageBox]::Show("The server did not start. The reason is at the end of:`n$logs\app-icon.log", 'PlasticDB', 'OK', 'Error') | Out-Null }
        return
      }
    }
  }
  if (-not $NoBrowser) { Start-Process $url } else { Write-Host "Server answers on $url" }
}
finally {
  if ($tray) { Start-Sleep -Seconds 1; $tray.Visible = $false; $tray.Dispose() }
}
