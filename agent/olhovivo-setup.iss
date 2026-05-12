; Inno Setup 6 — Instalador Olho Vivo (Windows)
; O token é obtido do nome do arquivo do instalador (ex.: OlhoVivoSetup_TOKEN_abc123.exe)
; ou, para testes/CI: OlhoVivoSetup.exe /TOKEN=abc123
;
; Caminhos [Files] / OutputDir são relativos a este arquivo (pasta agent/).
; Após PyInstaller: ..\dist\olhovivo-agent\ contém o .exe, DLLs e yolov8n.onnx.
; Compilar (exemplo local): ISCC.exe agent\olhovivo-setup.iss

#define MyAppName "Olho Vivo Agente"
#define MyAppPublisher "Dev Machine"
#define MyAppVersion "0.1.0"
#define MyAppExeName "olhovivo-agent.exe"

[Setup]
AppId={{B8E4C9A1-7F2D-4E91-9C0A-B8E4C9A17F2D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
; Instalação por usuário (sem UAC de administrador): AppData\Local\Programs
DefaultDirName={localappdata}\Programs\Olho Vivo
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64
OutputDir=..\dist-installer
OutputBaseFilename=OlhoVivoSetup
SetupIconFile=
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
VersionInfoVersion={#MyAppVersion}
UninstallDisplayName={#MyAppName}

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
Source: "..\dist\olhovivo-agent\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Code]
function GetRawToken: string;
var
  S: string;
  P, I: Integer;
begin
  { Parâmetro explícito: /TOKEN=valor (CI ou suporte) }
  Result := ExpandConstant('{param:TOKEN|}');
  if Result <> '' then
    Exit;

  S := ExtractFileName(ExpandConstant('{srcexe}'));
  P := Pos('TOKEN_', Uppercase(S));
  if P = 0 then
  begin
    Result := '';
    Exit;
  end;
  Delete(S, 1, P + Length('TOKEN_') - 1);
  I := Pos('.exe', Lowercase(S));
  if I > 0 then
    SetLength(S, I - 1);
  Result := S;
end;

function InitializeSetup(): Boolean;
var
  T: string;
begin
  T := GetRawToken;
  if T = '' then
  begin
    MsgBox('Este instalador deve ser baixado pelo painel Olho Vivo (link de instalação).' + #13#10 + #13#10 +
           'Se o arquivo foi renomeado, o nome deve conter TOKEN_ seguido do código do seu agente, antes de .exe' + #13#10 +
           '(exemplo: OlhoVivoSetup_TOKEN_seu_codigo.exe).',
           mbError, MB_OK);
    Result := False;
  end
  else
    Result := True;
end;

procedure RenameAgentExe(const Token: string);
var
  Src, Dst: string;
begin
  Src := ExpandConstant('{app}\{#MyAppExeName}');
  Dst := ExpandConstant('{app}\OlhoVivo_TOKEN_' + Token + '.exe');
  if not FileExists(Src) then
  begin
    MsgBox('Executável do agente não encontrado em:' + #13#10 + Src, mbError, MB_OK);
    Abort;
  end;
  if FileExists(Dst) then
    if not DeleteFile(Dst) then
    begin
      MsgBox('Não foi possível remover instalação antiga:' + #13#10 + Dst, mbError, MB_OK);
      Abort;
    end;
  if not RenameFile(Src, Dst) then
  begin
    MsgBox('Não foi possível renomear o executável do agente.', mbError, MB_OK);
    Abort;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  T: string;
  ResultCode: Integer;
  ExePath: string;
begin
  if CurStep <> ssPostInstall then
    Exit;

  T := GetRawToken;
  RenameAgentExe(T);

  ExePath := ExpandConstant('{app}\OlhoVivo_TOKEN_' + T + '.exe');
  Exec(ExePath, '', ExpandConstant('{app}'), SW_HIDE, ewNoWait, ResultCode);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    RegDeleteValue(HKEY_CURRENT_USER, 'Software\Microsoft\Windows\CurrentVersion\Run', 'OlhoVivoAgent');
end;
