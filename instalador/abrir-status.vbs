' Garante que o robo esta rodando e abre a pagina de status.
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = pasta
sh.Run """" & pasta & "\node\robo-atendimento.exe"" """ & pasta & "\robo\iniciar.js""", 0, False
WScript.Sleep 2500
sh.Run "http://localhost:3333"
