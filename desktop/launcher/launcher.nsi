; Guionista portable launcher.
; electron-builder's own "portable" stub deletes and re-extracts the entire app (~440 MB, thousands of files) into %TEMP% on EVERY launch.
; This launcher extracts once into %LOCALAPPDATA%\Guionista\<build>, then starts the app from there: later launches take well under a second.
; Defines passed on the command line: APP_7Z (the packed app), BUILD_ID, OUT_FILE, PLUGIN_DIR.
Unicode true
!include "LogicLib.nsh"
!addplugindir /x86-unicode "${PLUGIN_DIR}"

Name "Guionista"
OutFile "${OUT_FILE}"
RequestExecutionLevel user
SetCompress off
SilentInstall normal
AutoCloseWindow true
ShowInstDetails nevershow
BrandingText " "
Caption "Guionista"
SubCaption 3 " - first start"
InstallDir "$LOCALAPPDATA\Guionista\${BUILD_ID}"
VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName" "Guionista"
VIAddVersionKey "FileDescription" "Guionista screenplay editor"
VIAddVersionKey "FileVersion" "1.0.0"
VIAddVersionKey "LegalCopyright" "Guionista"

Page instfiles

Function .onInit
  ; one launcher at a time (a second double-click while the first is preparing just exits)
  System::Call 'kernel32::CreateMutex(i 0, i 0, t "GuionistaLauncher-${BUILD_ID}") i .r1 ?e'
  Pop $0
  ${If} $0 = 183
    Abort
  ${EndIf}
  StrCpy $INSTDIR "$LOCALAPPDATA\Guionista\${BUILD_ID}"
  ${If} ${FileExists} "$INSTDIR\.ready"
    SetSilent silent
  ${EndIf}
FunctionEnd

Section
  ${IfNot} ${FileExists} "$INSTDIR\.ready"
    DetailPrint "Preparing Guionista (this happens once)..."
    RMDir /r "$INSTDIR"
    CreateDirectory "$INSTDIR"
    SetOutPath "$INSTDIR"
    InitPluginsDir
    File "/oname=$PLUGINSDIR\app.7z" "${APP_7Z}"
    Nsis7z::Extract "$PLUGINSDIR\app.7z"
    Pop $0
    ${IfNot} ${FileExists} "$INSTDIR\Guionista.exe"
    ${OrIfNot} ${FileExists} "$INSTDIR\resources\server\server.js"
      MessageBox MB_OK|MB_ICONSTOP "Guionista could not be prepared.$\r$\n$\r$\nTry again, or move Guionista-Portable.exe to a short folder such as C:\Guionista. If your antivirus quarantined files, allow Guionista and retry."
      RMDir /r "$INSTDIR"
      Quit
    ${EndIf}
    FileOpen $0 "$INSTDIR\.ready" w
    FileWrite $0 "ok"
    FileClose $0
  ${EndIf}

  ; the app keeps scripts next to this .exe, exactly like the standard portable build
  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_DIR", "$EXEDIR").r0'
  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_FILE", "$EXEPATH").r0'
  SetOutPath "$INSTDIR"
  Exec '"$INSTDIR\Guionista.exe"'

  ; tidy up older builds (best effort: a folder in use by a running older copy is simply left alone)
  FindFirst $2 $3 "$LOCALAPPDATA\Guionista\*"
  loop:
    StrCmp $3 "" done
    StrCmp $3 "." next
    StrCmp $3 ".." next
    StrCmp $3 "${BUILD_ID}" next
    RMDir /r "$LOCALAPPDATA\Guionista\$3"
  next:
    FindNext $2 $3
    Goto loop
  done:
  FindClose $2
SectionEnd
