Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
RootDir = FSO.GetParentFolderName(FSO.GetParentFolderName(ScriptDir))

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = RootDir
WshShell.Run "iniciar_jarvis.bat", 0, False
Set WshShell = Nothing
Set FSO = Nothing
