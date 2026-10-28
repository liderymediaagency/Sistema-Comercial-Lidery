const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DB_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DEFAULT_DB_PATH = path.join(DB_DIR, 'lidery.db');

function getDb(customPath) {
  const dbPath = customPath || process.env.DATABASE_PATH || DEFAULT_DB_PATH;
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

const db = getDb();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, key] = stored.split(':');
  const hashed = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(hashed, 'hex'));
}

function initDatabase(targetDb = db) {
  targetDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      role TEXT NOT NULL CHECK(role IN ('admin', 'representative', 'seller')),
      representative_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS representative_seller_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      representative_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL CHECK(action IN ('link', 'unlink')),
      created_by_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      min_price REAL NOT NULL DEFAULT 70.00,
      suggested_price REAL NOT NULL DEFAULT 85.00,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commercial_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT NOT NULL,
      updated_by_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_code TEXT UNIQUE NOT NULL,
      seller_id INTEGER NOT NULL REFERENCES users(id),
      author_role TEXT NOT NULL CHECK(author_role IN ('seller', 'representative')),
      representative_id INTEGER REFERENCES users(id),
      client_name TEXT NOT NULL,
      client_contact_name TEXT,
      client_phone TEXT NOT NULL,
      client_email TEXT,
      client_city TEXT,
      client_state TEXT,
      client_notes TEXT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price REAL NOT NULL CHECK(unit_price > 0),
      total_amount REAL NOT NULL CHECK(total_amount > 0),
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending', 'confirmed', 'installments', 'cancelled')),
      installments_count INTEGER DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending_approval' CHECK(status IN ('pending_approval', 'approved', 'rejected', 'cancelled')),
      rejection_reason TEXT,
      cancellation_reason TEXT,
      below_min_price INTEGER NOT NULL DEFAULT 0,
      price_justification TEXT,
      seller_commission_rate REAL NOT NULL,
      seller_commission_amount REAL NOT NULL,
      rep_indirect_rate REAL DEFAULT 0,
      rep_indirect_amount REAL DEFAULT 0,
      rep_own_rate REAL DEFAULT 0,
      rep_own_amount REAL DEFAULT 0,
      sale_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      approved_at TEXT,
      approved_by_id INTEGER REFERENCES users(id),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      beneficiary_id INTEGER NOT NULL REFERENCES users(id),
      commission_type TEXT NOT NULL CHECK(commission_type IN ('seller_direct', 'rep_own', 'rep_indirect')),
      origin_amount REAL NOT NULL,
      percentage_applied REAL NOT NULL,
      commission_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_approval' CHECK(status IN ('pending_approval', 'approved', 'paid', 'cancelled')),
      payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      approved_at TEXT,
      paid_at TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_code TEXT UNIQUE NOT NULL,
      beneficiary_id INTEGER NOT NULL REFERENCES users(id),
      total_amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_date TEXT NOT NULL,
      transaction_reference TEXT,
      status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('pending', 'scheduled', 'paid', 'cancelled')),
      notes TEXT,
      admin_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      commission_id INTEGER NOT NULL REFERENCES commissions(id),
      amount REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS financial_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER REFERENCES sales(id),
      commission_id INTEGER REFERENCES commissions(id),
      beneficiary_id INTEGER NOT NULL REFERENCES users(id),
      adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('debit_reversal', 'credit_adjustment', 'other')),
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      created_by_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS correction_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      requested_by_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK(type IN ('correction', 'cancellation')),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      admin_notes TEXT,
      resolved_by_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL,
      link_url TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      old_values TEXT,
      new_values TEXT,
      ip_address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sales_seller ON sales(seller_id);
    CREATE INDEX IF NOT EXISTS idx_sales_rep ON sales(representative_id);
    CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
    CREATE INDEX IF NOT EXISTS idx_commissions_sale ON commissions(sale_id);
    CREATE INDEX IF NOT EXISTS idx_commissions_beneficiary ON commissions(beneficiary_id);
    CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);

  // Default commercial settings
  const defaultSettings = [
    { key: 'seller_commission_pct', value: '10.0', desc: 'Comissão do Vendedor em %' },
    { key: 'rep_own_commission_pct', value: '20.0', desc: 'Comissão de Venda Própria do Representante em %' },
    { key: 'rep_indirect_commission_pct', value: '5.0', desc: 'Comissão Indireta do Representante sobre Vendedores em %' },
    { key: 'default_min_price', value: '70.00', desc: 'Preço Mínimo por Plaquinha (R$)' },
    { key: 'default_suggested_price', value: '85.00', desc: 'Preço Sugerido por Plaquinha (R$)' },
    { key: 'company_name', value: 'Lidery Media Agency', desc: 'Nome da Empresa' }
  ];

  const now = new Date().toISOString();
  for (const s of defaultSettings) {
    const existing = targetDb.prepare('SELECT key FROM commercial_settings WHERE key = ?').get(s.key);
    if (!existing) {
      targetDb.prepare(`
        INSERT INTO commercial_settings (key, value, description, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(s.key, s.value, s.desc, now);
    }
  }

  // Initial Product: "Plaquinha NFC de avaliação do Google"
  const defaultProduct = targetDb.prepare("SELECT id FROM products WHERE name = 'Plaquinha NFC de avaliação do Google'").get();
  if (!defaultProduct) {
    targetDb.prepare(`
      INSERT INTO products (name, description, min_price, suggested_price, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'Plaquinha NFC de avaliação do Google',
      'Plaquinha acrílica moderna com chip NFC de aproximação e QR Code impresso direcionado para avaliações no Perfil da Empresa no Google.',
      70.00,
      85.00,
      1,
      now
    );
  }

  // Initial Admin creation: publisher1490 / lid54321@!
  const adminExists = targetDb.prepare("SELECT id FROM users WHERE username = 'publisher1490'").get();
  if (!adminExists) {
    const adminHash = hashPassword('lid54321@!');
    const res = targetDb.prepare(`
      INSERT INTO users (username, password_hash, full_name, email, role, status, must_change_password, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'admin', 'active', 0, ?, ?)
    `).run('publisher1490', adminHash, 'Administrador do Sistema', 'admin@lidery.com.br', now, now);

    targetDb.prepare(`
      INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, new_values, created_at, notes)
      VALUES (?, 'publisher1490', 'INITIAL_ADMIN_CREATED', 'users', ?, ?, ?, 'Administrador inicial gerado com sucesso pelo instalador')
    `).run(Number(res.lastInsertRowid), String(res.lastInsertRowid), JSON.stringify({ username: 'publisher1490', role: 'admin' }), now);
  } else {
    // Disable forced password change for existing users
    targetDb.prepare("UPDATE users SET must_change_password = 0 WHERE username = 'publisher1490'").run();
  }
}

// Transaction wrapper
function runTransaction(fn, targetDb = db) {
  targetDb.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(targetDb);
    targetDb.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      targetDb.exec('ROLLBACK');
    } catch (_) {}
    throw err;
  }
}

// Round to 2 decimal places strictly
function roundMoney(amount) {
  return Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
}

module.exports = {
  db,
  getDb,
  initDatabase,
  hashPassword,
  verifyPassword,
  runTransaction,
  roundMoney
};
