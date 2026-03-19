@echo off
powershell.exe -Command "$env:PATH = 'C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Microsoft\VisualStudio\NodeJs;' + $env:PATH; Set-Location '%~1'; npm install"
