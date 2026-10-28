@echo off
setlocal EnableDelayedExpansion
title Lidery Media Agency - Sistema Web

cd /d "%~dp0"

echo ================================================================
echo      LIDERY MEDIA AGENCY - SISTEMA WEB DE VENDAS E NFC
echo ================================================================
echo.

REM 1. Localizar executavel do Node.js
set "NODE_CMD="

if exist "%APPDATA%\Antigravity\bin\agy-node.cmd" (
    set "NODE_CMD=%APPDATA%\Antigravity\bin\agy-node.cmd"
)

if "!NODE_CMD!"=="" (
    where.exe node.exe >nul 2>nul
    if !ERRORLEVEL! equ 0 (
        set "NODE_CMD=node.exe"
    )
)

if "!NODE_CMD!"=="" (
    where.exe node >nul 2>nul
    if !ERRORLEVEL! equ 0 (
        set "NODE_CMD=node"
    )
)

if "!NODE_CMD!"=="" (
    echo ================================================================
    echo [ATENCAO] O Node.js AINDA NAO ESTA INSTALADO NESTE COMPUTADOR!
    echo ================================================================
    echo.
    echo O sistema web precisa do Node.js para funcionar.
    echo Baixe e instale gratuitamente em: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js detectado!
echo [OK] Iniciando servidor web da Lidery...
echo.
echo ================================================================
echo   SISTEMA NO AR COM SUCESSO!
echo   Acesse no seu navegador: http://localhost:3000
echo.
echo   Login Inicial do Administrador:
echo     Usuario: publisher1490
echo     Senha:   lid54321@!
echo.
echo   (Mantenha esta janela aberta enquanto utilizar o sistema)
echo ================================================================
echo.

call "!NODE_CMD!" server.js

if !ERRORLEVEL! neq 0 (
    echo.
    echo [ERRO] O servidor foi encerrado com codigo !ERRORLEVEL!.
    pause
)
