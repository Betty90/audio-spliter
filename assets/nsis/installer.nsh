!macro customInstall
  ; Custom installation steps can be added here
  DetailPrint "Installing UAudioLab..."
!macroend

!macro customUnInstall
  ; Custom uninstallation steps can be added here
  DetailPrint "Uninstalling UAudioLab..."
!macroend

!macro customInit
  ; Check for running instance
  FindWindow $0 "UAudioLab" ""
  StrCmp $0 0 done
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "UAudioLab is running. Please close it before continuing." IDOK done IDCANCEL cancel
  cancel:
    Abort
  done:
!macroend
