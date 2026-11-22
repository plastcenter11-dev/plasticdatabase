<#
  Builds PlasticDB-Update.exe (a console program that asks for Administrator rights and runs updater\update.ps1),
  with the C# compiler that ships with Windows - nothing to install.

    powershell -ExecutionPolicy Bypass -File deploy\windows\build-updater.ps1 [-CopyTo <folder>]

  The result is deploy\windows\Output\PlasticDB-Update.exe (not in git, like the two Setups): keep it next to them.
#>
param([string]$CopyTo = '')
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$csc = @("$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe", "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) { throw 'csc.exe (the .NET Framework compiler) was not found.' }
$out = Join-Path $here 'Output'
New-Item -ItemType Directory -Force $out | Out-Null
$exe = Join-Path $out 'PlasticDB-Update.exe'
$src = Join-Path $here 'updater'
& $csc /nologo /target:exe /optimize+ "/out:$exe" "/win32manifest:$(Join-Path $src 'app.manifest')" "/resource:$(Join-Path $src 'update.ps1'),update.ps1" (Join-Path $src 'Program.cs')
if ($LASTEXITCODE) { throw "csc failed ($LASTEXITCODE)" }
Write-Host "Built $exe ($([int]((Get-Item $exe).Length / 1KB)) KB)" -ForegroundColor Green
if ($CopyTo) { Copy-Item $exe $CopyTo -Force; Write-Host "Copied to $CopyTo" }
