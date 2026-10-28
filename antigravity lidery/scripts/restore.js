const fs = require('node:fs');
const path = require('node:path');

const DB_DIR = path.join(__dirname, '..', 'data');
const DEFAULT_TARGET_DB = path.join(DB_DIR, 'lidery.db');

function runRestore(backupFilePath, targetDbPath = DEFAULT_TARGET_DB) {
  if (!backupFilePath || !fs.existsSync(backupFilePath)) {
    throw new Error(`Arquivo de backup não encontrado: ${backupFilePath}`);
  }

  // Ensure WAL and SHM files are cleaned if restoring to target that exists
  const walFile = targetDbPath + '-wal';
  const shmFile = targetDbPath + '-shm';

  try {
    if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
    if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
  } catch (e) {
    // ignore busy handles on default target if process has it open
  }

  fs.copyFileSync(backupFilePath, targetDbPath);
  console.log(`[RESTORE SUCESSO] Banco de dados restaurado com sucesso em: ${targetDbPath}`);
  return { success: true, target: targetDbPath };
}

if (require.main === module) {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Uso: node restore.js <caminho-do-arquivo-de-backup.db>');
    process.exit(1);
  }
  runRestore(fileArg);
}

module.exports = { runRestore };
