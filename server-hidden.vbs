' AI Agent Lab server: runs in the background with no console window (registered in Startup)
Set shell = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run """C:\Python314\python.exe"" -m http.server 8000 --bind 127.0.0.1 --directory """ & dir & """", 0, False
