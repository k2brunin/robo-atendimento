; Instalador do Robô de Atendimento (gerado automaticamente pelo GitHub Actions)
#ifndef Versao
  #define Versao "1.0.0"
#endif

[Setup]
AppId={{6A1F2C55-9B1E-4E57-9C2B-ROBOATEND01}
AppName=Robô de Atendimento
AppVersion={#Versao}
AppPublisher=Robô de Atendimento
DefaultDirName={localappdata}\Programs\RoboAtendimento
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=..\saida
OutputBaseFilename=Instalador-Robo-Atendimento
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=Robô de Atendimento
CloseApplications=no

[Languages]
Name: "pt"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
Source: "..\pacote\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userstartup}\Robo de Atendimento"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\iniciar-oculto.vbs"""; WorkingDir: "{app}"; Comment: "Liga o robô quando o Windows inicia"
Name: "{userdesktop}\Robo de Atendimento"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\abrir-status.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\node\robo-atendimento.exe"; Comment: "Abre a página de status do robô"
Name: "{userdesktop}\Desligar Robo de Atendimento"; Filename: "{app}\parar-robo.bat"; WorkingDir: "{app}"
Name: "{userprograms}\Robo de Atendimento\Status do robo"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\abrir-status.vbs"""; WorkingDir: "{app}"
Name: "{userprograms}\Robo de Atendimento\Desligar robo"; Filename: "{app}\parar-robo.bat"; WorkingDir: "{app}"

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\abrir-status.vbs"""; WorkingDir: "{app}"; Description: "Ligar o robô agora"; Flags: postinstall nowait

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM robo-atendimento.exe"; Flags: runhidden; RunOnceId: "PararRobo"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Codigo: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM robo-atendimento.exe', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  Sleep(1500);
  Result := '';
end;
