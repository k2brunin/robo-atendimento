' Inicia o Robo de Atendimento sem abrir janela preta.
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = pasta
sh.Run """" & pasta & "\node\robo-atendimento.exe"" """ & pasta & "\robo\iniciar.js""", 0, False
