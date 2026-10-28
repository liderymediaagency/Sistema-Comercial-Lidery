#!/usr/bin/env bash
echo "======================================================="
echo "  LIDERY MEDIA AGENCY - SISTEMA WEB DE VENDAS E NFC"
echo "======================================================="

if ! command -v node &> /dev/null; then
    echo "[ERRO] Node.js não foi encontrado!"
    echo "Instale o Node.js v22+ em: https://nodejs.org/"
    exit 1
fi

echo "[OK] Iniciando servidor em http://localhost:3000..."
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
node "$DIR/server.js"
