; Instalador de Proclama para Windows 10/11 (64 bits).
; Se instala por usuario (sin permisos de administrador) en una carpeta donde la app puede actualizarse sola.
; Los datos (canciones, Biblias, medios, ajustes) viven en %APPDATA%\Proclama y no se tocan al reinstalar ni al desinstalar.
Unicode true
!include "MUI2.nsh"

Name "Proclama"
OutFile "${OUT}"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\Proclama"
InstallDirRegKey HKCU "Software\Proclama" "InstallDir"
SetCompressor /SOLID lzma
BrandingText "Proclama ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Proclama"
VIAddVersionKey "FileDescription" "Instalador de Proclama"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" ""

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "Se instalará Proclama ${VERSION}, la app de presentación para iglesias: canciones, Biblia, imágenes y videos, pantalla de escenario y control desde el celular.$\r$\n$\r$\nNo necesita permisos de administrador. Si ya la tenías, tus canciones y ajustes se conservan."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Proclama.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir Proclama ahora"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"

!define UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\Proclama"

; Pide a una copia en marcha que se cierre (guarda antes) para poder reemplazar sus archivos.
!macro CloseRunning
  nsExec::Exec 'powershell -NoProfile -WindowStyle Hidden -Command "7700..7709 | ForEach-Object { try { Invoke-WebRequest -UseBasicParsing -Method POST -TimeoutSec 2 -Uri (\"http://127.0.0.1:\" + $$_ + \"/api/quit\") | Out-Null } catch {} }"'
  Pop $0
  Sleep 1500
!macroend

Section "Proclama"
  !insertmacro CloseRunning
  SetOutPath "$INSTDIR\runtime"
  File "${STAGE}\runtime\node.exe"
  File "${STAGE}\runtime\LICENSE-node.txt"
  RMDir /r "$INSTDIR\app"
  SetOutPath "$INSTDIR\app"
  File /r "${STAGE}\app\*.*"
  SetOutPath "$INSTDIR"
  File "${STAGE}\Proclama.exe"
  File "icon.ico"
  WriteUninstaller "$INSTDIR\Desinstalar.exe"

  CreateShortcut "$DESKTOP\Proclama.lnk" "$INSTDIR\Proclama.exe" "" "$INSTDIR\icon.ico"
  CreateDirectory "$SMPROGRAMS\Proclama"
  CreateShortcut "$SMPROGRAMS\Proclama\Proclama.lnk" "$INSTDIR\Proclama.exe" "" "$INSTDIR\icon.ico"
  CreateShortcut "$SMPROGRAMS\Proclama\Desinstalar Proclama.lnk" "$INSTDIR\Desinstalar.exe"

  WriteRegStr HKCU "Software\Proclama" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST}" "DisplayName" "Proclama"
  WriteRegStr HKCU "${UNINST}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNINST}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegDWORD HKCU "${UNINST}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINST}" "EstimatedSize" ${SIZE_KB}
SectionEnd

Section "Uninstall"
  !insertmacro CloseRunning
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\runtime"
  Delete "$INSTDIR\Proclama.exe"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\Desinstalar.exe"
  RMDir "$INSTDIR"
  Delete "$DESKTOP\Proclama.lnk"
  RMDir /r "$SMPROGRAMS\Proclama"
  DeleteRegKey HKCU "${UNINST}"
  DeleteRegKey HKCU "Software\Proclama"
  ; %APPDATA%\Proclama (canciones, Biblias, medios) se deja a propósito.
SectionEnd
