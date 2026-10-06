Set WshShell = CreateObject("WScript.Shell")
strDesktop = WshShell.SpecialFolders("Desktop")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectDir = fso.GetParentFolderName(scriptDir)

' 1. Tray mode shortcut
Set oLink = WshShell.CreateShortcut(strDesktop & "\Jungcheogi_Trainer_Tray.lnk")
oLink.TargetPath = projectDir & "\start_tray.bat"
oLink.WorkingDirectory = projectDir
oLink.IconLocation = "shell32.dll,14"
oLink.Description = "Jungcheogi PC Trainer (Tray Mode)"
oLink.Save

' 2. Single Window shortcut
Set oLink2 = WshShell.CreateShortcut(strDesktop & "\Jungcheogi_Trainer_Window.lnk")
oLink2.TargetPath = projectDir & "\start.bat"
oLink2.WorkingDirectory = projectDir
oLink2.IconLocation = "cmd.exe,0"
oLink2.Description = "Jungcheogi PC Trainer (Single Window Mode)"
oLink2.Save

WScript.Echo "Desktop shortcuts created successfully on Desktop!"
