; Script de Instalação Inno Setup para JARVIS AI HUB
; Gera o executável final: dist_installer\JarvisHub-Setup-v3.0.0.exe

#define MyAppName "JARVIS AI Hub"
#define MyAppVersion "3.0.0"
#define MyAppPublisher "JARVIS Team"
#define MyAppURL "https://github.com/jarvis-hub"
#define MyAppExeName "JarvisHub.exe"

[Setup]
AppId={{8B13F108-8C37-4D99-A0E5-9D457E5CF202}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\JarvisAIHub
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\..\dist_installer
OutputBaseFilename=JarvisHub-Setup-v3.0.0
SetupIconFile=..\jarvis.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\..\dist\JarvisHub\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\jarvis.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\jarvis.ico"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
