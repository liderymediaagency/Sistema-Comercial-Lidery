const http = require('node:http');
const url = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const { initDatabase } = require('./src/db');
const { handleApiRequest } = require('./src/router');

// Initialize database schema
initDatabase();

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

const server = http.createServer((req, res) => {
  setSecurityHeaders(res);

  const parsedUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = parsedUrl.pathname;

  // Handle API routes
  if (pathname.startsWith('/api/')) {
    let rawBody = '';
    req.on('data', chunk => {
      rawBody += chunk;
      if (rawBody.length > 5 * 1024 * 1024) { // 5MB limit
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload muito grande' }));
        req.destroy();
      }
    });

    req.on('end', () => {
      let body = {};
      if (rawBody) {
        try {
          body = JSON.parse(rawBody);
        } catch (e) {
          body = {};
        }
      }
      const query = Object.fromEntries(parsedUrl.searchParams.entries());
      handleApiRequest(req, res, pathname, query, body);
    });
    return;
  }

  // Handle Static Files (SPA)
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  let filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA Fallback: serve index.html for frontend client routing
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Erro interno ao ler arquivo estático');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

if (require.main === module) {
  let currentPort = PORT;

  function startServer(portToListen) {
    server.listen(portToListen, HOST, () => {
      console.log(`=======================================================`);
      console.log(`  LIDERY MEDIA AGENCY - SISTEMA WEB DE VENDAS E COMISSÕES`);
      console.log(`  Servidor iniciado com sucesso em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${portToListen}`);
      console.log(`  Administrador Inicial: publisher1490`);
      console.log(`  Banco de Dados: SQLite WAL Ativo`);
      console.log(`=======================================================`);
    });
  }

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[AVISO] A porta ${currentPort} já está ocupada por outra instância do sistema.`);
      currentPort++;
      console.log(`[TENTATIVA] Iniciando automaticamente na porta alternativa: ${currentPort}...`);
      setTimeout(() => {
        startServer(currentPort);
      }, 300);
    } else {
      console.error('[ERRO SERVIDOR]', err);
    }
  });

  startServer(currentPort);
}

module.exports = server;
