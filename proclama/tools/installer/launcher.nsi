; Proclama.exe: lanzador sin ventana. Arranca el Node incluido con launcher.mjs y termina.
Unicode true
SilentInstall silent
RequestExecutionLevel user
SetCompressor lzma
Name "Proclama"
Icon "icon.ico"
OutFile "${OUT}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Proclama"
VIAddVersionKey "FileDescription" "Proclama"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" ""

Section
  SetOutPath "$EXEDIR\app"
  ExecShell "open" "$EXEDIR\runtime\node.exe" '"$EXEDIR\app\launcher.mjs"' SW_HIDE
SectionEnd
