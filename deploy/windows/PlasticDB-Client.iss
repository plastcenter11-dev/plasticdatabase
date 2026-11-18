; Builds PlasticDB-Client-Setup.exe (Inno Setup 6) - for every computer that only OPENS the program (a branch,
; the owner's laptop). The server itself is PlasticDB-Setup.exe.
;   "C:\Users\<you>\AppData\Local\Programs\Inno Setup 6\ISCC.exe" deploy\windows\PlasticDB-Client.iss
; The result lands in deploy\windows\Output\PlasticDB-Client-Setup.exe.
;
; What it does on the branch computer: installs Tailscale (checked for Tailscale's signature), signs it in,
; puts a "PlasticDB" shortcut on the desktop that opens the server's address, and checks the server answers.
; Nothing of the program itself is installed: it all runs on the server.
;
; Different server address: ISCC.exe /DServerHost=100.x.y.z deploy\windows\PlasticDB-Client.iss

#ifndef ServerHost
  #define ServerHost "100.93.43.62"
#endif

[Setup]
AppName=PlasticDB (branch)
AppVersion=1.0
AppPublisher=PlasticDB
DefaultDirName={autopf}\PlasticDB Client
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
OutputDir=Output
OutputBaseFilename=PlasticDB-Client-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
Uninstallable=no
CreateUninstallRegKey=no

[Files]
Source: "client-install.ps1"; DestDir: "{tmp}"; Flags: deleteafterinstall

; the desktop shortcut that opens the program in the browser
[INI]
Filename: "{autodesktop}\PlasticDB.url"; Section: "InternetShortcut"; Key: "URL"; String: "{code:ServerUrl}"

[Code]
function SetEnvironmentVariableW(lpName, lpValue: String): Boolean;
  external 'SetEnvironmentVariableW@kernel32.dll stdcall';

var
  AddrPage: TInputQueryWizardPage;

function ServerUrl(Param: String): String;
begin
  Result := 'http://' + Trim(AddrPage.Values[0]) + ':' + Trim(AddrPage.Values[1]);
end;

procedure InitializeWizard;
begin
  AddrPage := CreateInputQueryPage(wpWelcome, 'Server', 'Where is the PlasticDB server?',
    'Normally you do not change these. The one-time key is only for a computer you were given a key for (leave it empty to sign in with a normal account).');
  AddrPage.Add('Server address (the 100.x.x.x of the server):', False);
  AddrPage.Add('Port:', False);
  AddrPage.Add('One-time key (optional):', True);
  AddrPage.Values[0] := '{#ServerHost}';
  AddrPage.Values[1] := '3001';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = AddrPage.ID then
    if (Trim(AddrPage.Values[0]) = '') or (Trim(AddrPage.Values[1]) = '') then
    begin
      MsgBox('Type the server address and the port.', mbError, MB_OK);
      Result := False;
    end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  Params: String;
begin
  if CurStep = ssPostInstall then
  begin
    SetEnvironmentVariableW('PDB_TS_AUTHKEY', Trim(AddrPage.Values[2]));
    Params := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\client-install.ps1') + '" -ServerUrl "' + ServerUrl('') + '"';
    if (not Exec('powershell.exe', Params, '', SW_SHOWNORMAL, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
      MsgBox('Setup did not finish. Read the messages in the black window (this Setup can be run again safely), or send a photo of them.', mbError, MB_OK)
    else
      MsgBox('Done. Open the PlasticDB shortcut on the desktop.', mbInformation, MB_OK);
  end;
end;
