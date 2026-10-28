const fs = require('node:fs');
const path = require('node:path');
const { getDb } = require('../src/db');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backup-lidery-${timestamp}.db`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);

  const db = getDb();
  // Safe online SQLite VACUUM INTO backup
  try {
    db.exec(`VACUUM INTO '${backupFilePath.replace(/\\/g, '/')}'`);
    const stats = fs.statSync(backupFilePath);
    console.log(`[BACKUP SUCESSO] Backup criado com sucesso em: ${backupFilePath} (${(stats.size / 1024).toFixed(2)} KB)`);
    return { success: true, path: backupFilePath, size: stats.size };
  } catch (err) {
    console.error('[BACKUP ERRO] Falha ao executar backup:', err);
    throw err;
  }
}

if (require.main === module) {
  runBackup();
}

module.exports = { runBackup };
