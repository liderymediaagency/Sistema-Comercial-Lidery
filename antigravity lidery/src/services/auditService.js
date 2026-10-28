const { db } = require('../db');

function listLogs({ userId, action, entityType, limit = 100, offset = 0 } = {}) {
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (userId) {
    query += ' AND user_id = ?';
    params.push(userId);
  }
  if (action) {
    query += ' AND action = ?';
    params.push(action);
  }
  if (entityType) {
    query += ' AND entity_type = ?';
    params.push(entityType);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

function recordLog({ userId, username, action, entityType, entityId, oldValues, newValues, ipAddress, notes }) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, old_values, new_values, ip_address, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId || null,
    username || null,
    action,
    entityType,
    entityId ? String(entityId) : null,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
    ipAddress || null,
    notes || null,
    now
  );
}

module.exports = {
  listLogs,
  recordLog
};
