; Instalador de REA Studio (Inno Setup). El AppId fijo hace que cada versión nueva actualice la instalada.
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
[Setup]
AppId={{6F1D2C3A-5B7E-4E21-9C48-A1B2C3D40001}
AppName=REA Studio
AppVersion={#AppVersion}
AppPublisher=sanmiguelyt955
DefaultDirName={autopf}\REA Studio
DefaultGroupName=REA Studio
OutputDir=out
OutputBaseFilename=REA-Studio-Setup
Compression=lzma2/fast
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
UninstallDisplayName=REA Studio
CloseApplications=yes
[Files]
Source: "stage\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
[Icons]
Name: "{group}\REA Studio"; Filename: "{app}\bin\64bit\obs64.exe"; WorkingDir: "{app}\bin\64bit"
Name: "{autodesktop}\REA Studio"; Filename: "{app}\bin\64bit\obs64.exe"; WorkingDir: "{app}\bin\64bit"
[Run]
Filename: "{app}\bin\64bit\obs64.exe"; WorkingDir: "{app}\bin\64bit"; Description: "Abrir REA Studio"; Flags: nowait postinstall skipifsilent
