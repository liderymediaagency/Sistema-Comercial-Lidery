@echo off
setlocal

if exist "%APPDATA%\Antigravity\bin\agy-node.cmd" (
    "%APPDATA%\Antigravity\bin\agy-node.cmd" %*
    exit /b %ERRORLEVEL%
)

where.exe node.exe >nul 2>nul
if %ERRORLEVEL% equ 0 (
    node.exe %*
    exit /b %ERRORLEVEL%
)

echo.
echo ==============================================================
echo [ERRO] O Node.js nao foi encontrado neste computador!
echo Para rodar o sistema da Lidery Media Agency em outro PC:
echo 1. Baixe o Node.js gratuitamente em: https://nodejs.org/ (v22+)
echo 2. Instale e execute novamente o start.cmd
echo ==============================================================
echo.
pause
exit /b 1
