$ErrorActionPreference = "Stop"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  LIDERY MEDIA AGENCY - SISTEMA WEB DE VENDAS E NFC" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

$nodeCmd = $null
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeCmd = "node"
} elseif (Test-Path "$env:APPDATA\Antigravity\bin\agy-node.cmd") {
    $nodeCmd = "$env:APPDATA\Antigravity\bin\agy-node.cmd"
} else {
    Write-Host "[ERRO] Node.js não foi encontrado neste computador!" -ForegroundColor Red
    Write-Host "Por favor, instale o Node.js v22 ou superior baixando em: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Pressione Enter para sair..."
    exit 1
}

Write-Host "[OK] Iniciando servidor web na porta 3000..." -ForegroundColor Green
Write-Host "[OK] Abra seu navegador em: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Credenciais Iniciais do Administrador:" -ForegroundColor Gray
Write-Host "  Usuário: publisher1490" -ForegroundColor Yellow
Write-Host "  Senha:   lid54321@!" -ForegroundColor Yellow
Write-Host ""
Write-Host "Pressione Ctrl+C para encerrar o servidor quando desejar." -ForegroundColor Gray
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

& $nodeCmd "$PSScriptRoot\server.js"
