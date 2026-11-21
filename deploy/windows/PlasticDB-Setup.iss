; Builds PlasticDB-Setup.exe (Inno Setup 6):
;   "C:\Users\<you>\AppData\Local\Programs\Inno Setup 6\ISCC.exe" deploy\windows\PlasticDB-Setup.iss
; The result lands in deploy\windows\Output\PlasticDB-Setup.exe.
;
; The Setup is thin on purpose: it checks that Node.js, Git and MySQL are installed, asks for the MySQL root
; password (used once, never stored), downloads the newest program from GitHub into the chosen folder and runs
; bootstrap-install.ps1, which does the real work. Updating later is deploy\windows\update-server.ps1.

#define AppName "PlasticDB Server"

[Setup]
; a fixed id: it is what makes this entry appear in Windows "Installed apps" and lets a newer Setup find it
AppId={{8C1F7A52-3D4B-4E9A-9B1E-5A7D2C6F0B31}
AppName={#AppName}
AppVersion=1.0
AppPublisher=PlasticDB
DefaultDirName=C:\PlasticDB
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=Output
OutputBaseFilename=PlasticDB-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; Shows up in Windows "Installed apps" and can be removed from there. The uninstaller itself is kept OUTSIDE the
; program folder: that folder has to stay empty until the code is downloaded into it.
Uninstallable=yes
CreateUninstallRegKey=yes
UninstallFilesDir={commonappdata}\PlasticDB\uninstall-server
UninstallDisplayName=PlasticDB Server
DirExistsWarning=no

[Files]
Source: "bootstrap-install.ps1"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Code]
function SetEnvironmentVariableW(lpName, lpValue: String): Boolean;
  external 'SetEnvironmentVariableW@kernel32.dll stdcall';

var
  PwPage: TInputQueryWizardPage;

function MySqlFound: Boolean;
var
  R: TFindRec;
begin
  Result := False;
  if FindFirst('C:\Program Files\MySQL\*', R) then
  try
    repeat
      if FileExists('C:\Program Files\MySQL\' + R.Name + '\bin\mysql.exe') then Result := True;
    until Result or not FindNext(R);
  finally
    FindClose(R);
  end;
end;

function InitializeSetup: Boolean;
var
  Missing: String;
begin
  Missing := '';
  if not (FileExists(ExpandConstant('{commonpf64}\nodejs\node.exe')) or FileExists(ExpandConstant('{commonpf32}\nodejs\node.exe'))) then
    Missing := Missing + #13#10 + '- Node.js (LTS):  https://nodejs.org';
  if not (FileExists(ExpandConstant('{commonpf64}\Git\cmd\git.exe')) or FileExists(ExpandConstant('{commonpf32}\Git\cmd\git.exe'))
          or FileExists(ExpandConstant('{localappdata}\Programs\Git\cmd\git.exe'))) then
    Missing := Missing + #13#10 + '- Git for Windows:  https://git-scm.com/download/win';
  if not MySqlFound then
    Missing := Missing + #13#10 + '- MySQL Server 8:  https://dev.mysql.com/downloads/installer/';
  Result := (Missing = '');
  if not Result then
    MsgBox('Install these first, then run this Setup again:' + #13#10 + Missing, mbInformation, MB_OK);
end;

procedure InitializeWizard;
begin
  PwPage := CreateInputQueryPage(wpSelectDir, 'MySQL', 'Database administrator password',
    'The password of the MySQL "root" user. It is used once to create the program''s own database and a limited account, and is not saved.');
  PwPage.Add('MySQL root password:', True);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = PwPage.ID then
    if PwPage.Values[0] = '' then
    begin
      MsgBox('Type the MySQL root password.', mbError, MB_OK);
      Result := False;
    end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  Params, Login: String;
  Lines: TArrayOfString;
begin
  if CurStep = ssPostInstall then
  begin
    SetEnvironmentVariableW('PDB_MYSQL_ROOT_PW', PwPage.Values[0]);
    Params := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\bootstrap-install.ps1') + '" -InstallDir "' + ExpandConstant('{app}') + '"';
    if (not Exec('powershell.exe', Params, '', SW_SHOWNORMAL, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
    begin
      MsgBox('The installation did not finish. What went wrong is in the black window and in the file C:\ProgramData\PlasticDB\setup-log.txt (send it, or a photo of the window). It can be run again safely.', mbError, MB_OK);
      Exit;
    end;
    if LoadStringsFromFile(ExpandConstant('{app}\first-login.txt'), Lines) and (GetArrayLength(Lines) >= 3) then
    begin
      Login := Lines[1] + #13#10 + Lines[2];
      MsgBox('PlasticDB is installed and running.' + #13#10#13#10 + 'First sign-in:' + #13#10 + Login + #13#10#13#10 +
        'It is also saved in ' + ExpandConstant('{app}\first-login.txt') + '. Delete that file after you have noted it.', mbInformation, MB_OK);
    end else
      MsgBox('PlasticDB is installed and running.', mbInformation, MB_OK);
  end;
end;

{ ---- removing it from Windows "Installed apps" ---- }

function InitializeUninstall: Boolean;
begin
  Result := MsgBox('Remove the PlasticDB server from this computer?' + #13#10#13#10 +
    'The server is stopped and its Windows tasks (including the daily backup), the firewall rule and the desktop icon are removed. ' +
    'Your data (the MySQL database and the backups) is NOT deleted.', mbConfirmation, MB_YESNO) = IDYES;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
  AppDir, Script, Params: String;
begin
  if CurUninstallStep = usUninstall then
  begin
    AppDir := ExpandConstant('{app}');
    Script := AppDir + '\deploy\windows\uninstall-server.ps1';
    if not FileExists(Script) then
    begin
      MsgBox('The program folder ' + AppDir + ' was not found (already deleted?), so only the Windows entry is removed. ' +
        'If the server tasks are still there, delete them in Task Scheduler.', mbInformation, MB_OK);
      Exit;
    end;
    Params := '-NoProfile -ExecutionPolicy Bypass -File "' + Script + '" -Force';
    if MsgBox('Also delete the program folder?' + #13#10#13#10 + AppDir + #13#10 +
      '(the program files, its .env settings and the database\ backups folder inside it)' + #13#10#13#10 +
      'The MySQL database stays in MySQL either way. Choose No to keep everything.', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      Params := Params + ' -RemoveFiles';
    if (not Exec('powershell.exe', Params, '', SW_SHOWNORMAL, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
      MsgBox('The removal did not finish. See the black window (it can be repeated: run deploy\windows\uninstall-server.ps1 as administrator).', mbError, MB_OK);
  end;
end;
