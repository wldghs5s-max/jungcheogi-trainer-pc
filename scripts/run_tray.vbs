Set WshShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
projectDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(scriptDir)
psScript = projectDir & "\scripts\tray_launcher.ps1"
WshShell.Run "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & psScript & """", 0, False
Set WshShell = Nothing
