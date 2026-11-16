@echo off
echo Desligando o Robo de Atendimento...
taskkill /F /IM robo-atendimento.exe >nul 2>&1
echo Pronto. Para ligar de novo, use o atalho "Robo de Atendimento" na area de trabalho.
timeout /t 4 >nul
