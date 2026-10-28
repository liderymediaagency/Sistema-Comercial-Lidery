const { db } = require('../db');

function createNotification(userId, { title, message, type = 'system', link_url = null }) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO notifications (user_id, title, message, type, link_url, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(userId, title, message, type, link_url, now);
}

function listUserNotifications(userId, limit = 50) {
  return db.prepare(`
    SELECT id, title, message, type, link_url, is_read, created_at
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, limit);
}

function getUnreadCount(userId) {
  const row = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(userId);
  return row ? row.count : 0;
}

function markAsRead(id, userId) {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, userId);
}

function markAllAsRead(userId) {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
}

module.exports = {
  createNotification,
  listUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
};
