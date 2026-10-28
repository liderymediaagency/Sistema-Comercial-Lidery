const fs = require('node:fs');
const path = require('node:path');
const { getDb, hashPassword } = require('../src/db');

const DB_PATH = path.join(__dirname, '..', 'data', 'lidery.db');

function resetDatabase() {
  console.log('[RESET] Limpando todos os dados de testes e zerando o sistema...');

  const db = getDb();

  db.exec('PRAGMA foreign_keys = OFF;');

  db.exec(`
    DELETE FROM payment_items;
    DELETE FROM payments;
    DELETE FROM financial_adjustments;
    DELETE FROM correction_requests;
    DELETE FROM commissions;
    DELETE FROM sales;
    DELETE FROM representative_seller_history;
    DELETE FROM notifications;
    DELETE FROM sessions;
    DELETE FROM audit_logs;
    DELETE FROM users WHERE role != 'admin';
  `);

  // Reset sqlite autoincrement sequences for cleared tables
  db.exec(`
    DELETE FROM sqlite_sequence WHERE name IN (
      'payment_items', 'payments', 'financial_adjustments', 
      'correction_requests', 'commissions', 'sales', 
      'representative_seller_history', 'notifications', 'audit_logs'
    );
  `);

  // Ensure initial admin publisher1490 is ready with password lid54321@! and must_change_password = 0
  const now = new Date().toISOString();
  const adminExists = db.prepare("SELECT id FROM users WHERE username = 'publisher1490'").get();
  const adminHash = hashPassword('lid54321@!');

  if (!adminExists) {
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, email, role, status, must_change_password, created_at, updated_at)
      VALUES ('publisher1490', ?, 'Administrador do Sistema', 'admin@lidery.com.br', 'admin', 'active', 0, ?, ?)
    `).run(adminHash, now, now);
  } else {
    db.prepare(`
      UPDATE users 
      SET password_hash = ?, full_name = 'Administrador do Sistema', status = 'active', must_change_password = 0, representative_id = NULL
      WHERE username = 'publisher1490'
    `).run(adminHash);
  }

  // Ensure initial product
  const defaultProduct = db.prepare("SELECT id FROM products WHERE name = 'Plaquinha NFC de avaliação do Google'").get();
  if (!defaultProduct) {
    db.prepare(`
      INSERT INTO products (name, description, min_price, suggested_price, is_active, created_at)
      VALUES (
        'Plaquinha NFC de avaliação do Google',
        'Plaquinha acrílica moderna com chip NFC de aproximação e QR Code impresso direcionado para avaliações no Perfil da Empresa no Google.',
        70.00,
        85.00,
        1,
        ?
      )
    `).run(now);
  }

  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('VACUUM;');

  console.log('===============================================================');
  console.log('  BANCO DE DADOS ZERADO COM SUCESSO!                          ');
  console.log('===============================================================');
  console.log('  - Vendas: 0');
  console.log('  - Comissões: 0');
  console.log('  - Pagamentos: 0');
  console.log('  - Vendedores/Representantes de teste: Removidos');
  console.log('  - Administrador único: publisher1490');
  console.log('  - Senha: lid54321@!');
  console.log('  - Produto padrão: Plaquinha NFC de avaliação do Google');
  console.log('===============================================================');
}

if (require.main === module) {
  resetDatabase();
}

module.exports = { resetDatabase };
