const { db } = require('../db');

function getSettings() {
  const rows = db.prepare('SELECT key, value, description FROM commercial_settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

function updateSettings(newSettings, adminUser) {
  const now = new Date().toISOString();
  const current = getSettings();

  for (const [key, value] of Object.entries(newSettings)) {
    if (value !== undefined && value !== null) {
      const strVal = String(value).trim();
      db.prepare(`
        INSERT INTO commercial_settings (key, value, updated_at, updated_by_id)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by_id = excluded.updated_by_id
      `).run(key, strVal, now, adminUser.id);
    }
  }

  db.prepare(`
    INSERT INTO audit_logs (user_id, username, action, entity_type, old_values, new_values, created_at, notes)
    VALUES (?, ?, 'SETTINGS_UPDATED', 'commercial_settings', ?, ?, ?, 'Configurações comerciais atualizadas pelo administrador. Valores valem para vendas futuras.')
  `).run(adminUser.id, adminUser.username, JSON.stringify(current), JSON.stringify(newSettings), now);

  return getSettings();
}

function listProducts(activeOnly = true) {
  let query = 'SELECT * FROM products';
  if (activeOnly) {
    query += ' WHERE is_active = 1';
  }
  query += ' ORDER BY id ASC';
  return db.prepare(query).all();
}

function getProductById(id) {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
}

function createProduct({ name, description, min_price, suggested_price }, adminUser) {
  if (!name) throw new Error('Nome do produto é obrigatório.');
  const now = new Date().toISOString();
  const minP = Number(min_price) || 70.00;
  const sugP = Number(suggested_price) || 85.00;

  const res = db.prepare(`
    INSERT INTO products (name, description, min_price, suggested_price, is_active, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(name.trim(), description ? description.trim() : '', minP, sugP, now);

  db.prepare(`
    INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, new_values, created_at, notes)
    VALUES (?, ?, 'PRODUCT_CREATED', 'products', ?, ?, ?, 'Novo produto cadastrado')
  `).run(adminUser.id, adminUser.username, String(res.lastInsertRowid), JSON.stringify({ name, minP, sugP }), now);

  return getProductById(Number(res.lastInsertRowid));
}

function updateProduct(id, { name, description, min_price, suggested_price, is_active }, adminUser) {
  const current = getProductById(id);
  if (!current) throw new Error('Produto não encontrado.');

  const updates = [];
  const params = [];

  if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description.trim()); }
  if (min_price !== undefined) { updates.push('min_price = ?'); params.push(Number(min_price)); }
  if (suggested_price !== undefined) { updates.push('suggested_price = ?'); params.push(Number(suggested_price)); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

  if (updates.length > 0) {
    params.push(id);
    db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  return getProductById(id);
}

module.exports = {
  getSettings,
  updateSettings,
  listProducts,
  getProductById,
  createProduct,
  updateProduct
};
