!macro customInstall
  ; Custom installation steps can be added here
  DetailPrint "Installing AudioSlicer AI..."
!macroend

!macro customUnInstall
  ; Custom uninstallation steps can be added here
  DetailPrint "Uninstalling AudioSlicer AI..."
!macroend

!macro customInit
  ; Check for running instance
  FindWindow $0 "AudioSlicer AI" ""
  StrCmp $0 0 done
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "AudioSlicer AI is running. Please close it before continuing." IDOK done IDCANCEL cancel
  cancel:
    Abort
  done:
!macroend
