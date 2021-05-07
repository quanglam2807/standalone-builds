# add registry to define PanText as browser and mail client on Windows 10+
# rewritten in NSH from https://github.com/minbrowser/min/blob/master/main/registryConfig.js
# fix https://github.com/webcatalog/webcatalog-app/issues/784
# useful doc https://github.com/electron-userland/electron-builder/issues/837#issuecomment-614127460
# useful doc https://www.electron.build/configuration/nsis#custom-nsis-script

!macro customInstall
  WriteRegStr HKCU 'Software\RegisteredApplications' 'PanText' 'Software\Clients\StartMenuInternet\PanText\Capabilities'
  WriteRegStr HKCU 'Software\Classes\PanText' '' 'PanText Browser Document'
  WriteRegStr HKCU 'Software\Classes\PanText\Application' 'ApplicationIcon' '$appExe,0'
  WriteRegStr HKCU 'Software\Classes\PanText\Application' 'ApplicationName' 'PanText'
  WriteRegStr HKCU 'Software\Classes\PanText\Application' 'AppUserModelId' 'PanText'
  WriteRegStr HKCU 'Software\Classes\PanText\DefaulIcon' 'ApplicationIcon' '$appExe,0'
  WriteRegStr HKCU 'Software\Classes\PanText\shell\open\command' '' '"$appExe" "%1"'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\PanText\Capabilities\StartMenu' 'StartMenuInternet' 'PanText'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\PanText\Capabilities\URLAssociations' 'http' 'PanText'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\PanText\Capabilities\URLAssociations' 'https' 'PanText'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\PanText\Capabilities\URLAssociations' 'mailto' 'PanText'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\PanText\DefaultIcon' '' '$appExe,0'
  WriteRegDWORD HKCU 'Software\Clients\StartMenuInternet\PanText\InstallInfo' 'IconsVisible' 1
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\PanText\shell\open\command' '' '$appExe'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU 'Software\RegisteredApplications' 'PanText'
  DeleteRegKey HKCU 'Software\Classes\PanText'
  DeleteRegKey HKCU 'Software\Clients\StartMenuInternet\PanText'
!macroend