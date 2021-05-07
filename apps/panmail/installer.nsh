# add registry to define PanMail as browser and mail client on Windows 10+
# rewritten in NSH from https://github.com/minbrowser/min/blob/master/main/registryConfig.js
# fix https://github.com/webcatalog/webcatalog-app/issues/784
# useful doc https://github.com/electron-userland/electron-builder/issues/837#issuecomment-614127460
# useful doc https://www.electron.build/configuration/nsis#custom-nsis-script

!macro customInstall
  WriteRegStr HKCU 'Software\RegisteredApplications' 'PanMail' 'Software\Clients\StartMenuInternet\PanMail\Capabilities'
  WriteRegStr HKCU 'Software\Classes\PanMail' '' 'PanMail Browser Document'
  WriteRegStr HKCU 'Software\Classes\PanMail\Application' 'ApplicationIcon' '$appExe,0'
  WriteRegStr HKCU 'Software\Classes\PanMail\Application' 'ApplicationName' 'PanMail'
  WriteRegStr HKCU 'Software\Classes\PanMail\Application' 'AppUserModelId' 'PanMail'
  WriteRegStr HKCU 'Software\Classes\PanMail\DefaulIcon' 'ApplicationIcon' '$appExe,0'
  WriteRegStr HKCU 'Software\Classes\PanMail\shell\open\command' '' '"$appExe" "%1"'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\PanMail\Capabilities\StartMenu' 'StartMenuInternet' 'PanMail'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\PanMail\Capabilities\URLAssociations' 'mailto' 'PanMail'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\PanMail\DefaultIcon' '' '$appExe,0'
  WriteRegDWORD HKCU 'Software\Clients\StartMenuInternet\PanMail\InstallInfo' 'IconsVisible' 1
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\PanMail\shell\open\command' '' '$appExe'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU 'Software\RegisteredApplications' 'PanMail'
  DeleteRegKey HKCU 'Software\Classes\PanMail'
  DeleteRegKey HKCU 'Software\Clients\StartMenuInternet\PanMail'
!macroend