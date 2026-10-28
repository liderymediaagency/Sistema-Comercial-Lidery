const crypto = require('node:crypto');
const { db, verifyPassword, hashPassword, roundMoney } = require('./db');

// In-memory rate limiting map: key -> { count, lockedUntil }
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(key) {
  const now = Date.now();
  const attempt = loginAttempts.get(key);
  if (!attempt) return { allowed: true };

  if (attempt.lockedUntil && now < attempt.lockedUntil) {
    const minutesLeft = Math.ceil((attempt.lockedUntil - now) / 60000);
    return {
      allowed: false,
      message: `Muitas tentativas incorretas. Tente novamente em ${minutesLeft} minutos.`
    };
  }

  if (attempt.lockedUntil && now >= attempt.lockedUntil) {
    loginAttempts.delete(key);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordFailedAttempt(key) {
  const now = Date.now();
  const attempt = loginAttempts.get(key) || { count: 0, firstAttempt: now };
  attempt.count += 1;
  if (attempt.count >= MAX_ATTEMPTS) {
    attempt.lockedUntil = now + LOCKOUT_MS;
  }
  loginAttempts.set(key, attempt);
}

function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

function createSession(userId, ipAddress = '', userAgent = '') {
  const token = crypto.randomBytes(32).toString('hex');
  const createdAt = new Date().toISOString();
  // 7 days expiration
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (id, user_id, created_at, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(token, userId, createdAt, expiresAt, ipAddress, userAgent);

  return token;
}

function getSessionUser(token) {
  if (!token) return null;
  const now = new Date().toISOString();

  const session = db.prepare(`
    SELECT s.id as session_id, s.expires_at, u.id, u.username, u.full_name, u.email, u.phone, 
           u.role, u.representative_id, u.status, u.must_change_password, u.last_login_at,
           r.full_name as representative_name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users r ON r.id = u.representative_id
    WHERE s.id = ? AND s.expires_at > ?
  `).get(token, now);

  if (!session) return null;
  if (session.status !== 'active') return null;

  return session;
}

function destroySession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(token);
}

function login(username, password, requestedRole, ipAddress = '', userAgent = '') {
  const rateLimitKey = `${ipAddress}_${username.toLowerCase()}`;
  const rateCheck = checkRateLimit(rateLimitKey);
  if (!rateCheck.allowed) {
    return { success: false, error: rateCheck.message, statusCode: 429 };
  }

  const user = db.prepare(`
    SELECT id, username, password_hash, full_name, role, status, must_change_password
    FROM users
    WHERE username = ? COLLATE NOCASE
  `).get(username);

  if (!user) {
    recordFailedAttempt(rateLimitKey);
    return { success: false, error: 'Credenciais inválidas. Verifique seu usuário e senha.', statusCode: 401 };
  }

  if (user.status !== 'active') {
    return { success: false, error: 'Conta desativada pelo administrador. Contate o suporte.', statusCode: 403 };
  }

  const passwordValid = verifyPassword(password, user.password_hash);
  if (!passwordValid) {
    recordFailedAttempt(rateLimitKey);
    return { success: false, error: 'Credenciais inválidas. Verifique seu usuário e senha.', statusCode: 401 };
  }

  // Strict role check: profile selected on login screen must match actual account role
  if (requestedRole && requestedRole !== user.role) {
    const roleLabels = {
      admin: 'Administrador',
      representative: 'Representante',
      seller: 'Vendedor'
    };
    return {
      success: false,
      error: `Acesso negado para o perfil selecionado. Esta conta é do tipo "${roleLabels[user.role] || user.role}", mas você tentou entrar como "${roleLabels[requestedRole] || requestedRole}".`,
      statusCode: 403
    };
  }

  clearLoginAttempts(rateLimitKey);

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, user.id);

  // Log successful login
  db.prepare(`
    INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, ip_address, created_at, notes)
    VALUES (?, ?, 'LOGIN_SUCCESS', 'users', ?, ?, ?, ?)
  `).run(user.id, user.username, String(user.id), ipAddress, now, `Login efetuado com sucesso como ${user.role}`);

  const token = createSession(user.id, ipAddress, userAgent);

  return {
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      must_change_password: Boolean(user.must_change_password)
    }
  };
}

function changePassword(userId, currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' };
  }

  const user = db.prepare('SELECT id, username, password_hash FROM users WHERE id = ?').get(userId);
  if (!user) return { success: false, error: 'Usuário não encontrado.' };

  const valid = verifyPassword(currentPassword, user.password_hash);
  if (!valid) return { success: false, error: 'Senha atual incorreta.' };

  const newHash = hashPassword(newPassword);
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE users 
    SET password_hash = ?, must_change_password = 0, updated_at = ?
    WHERE id = ?
  `).run(newHash, now, userId);

  db.prepare(`
    INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, created_at, notes)
    VALUES (?, ?, 'PASSWORD_CHANGED', 'users', ?, ?, 'Senha alterada pelo próprio usuário')
  `).run(user.id, user.username, String(user.id), now);

  return { success: true, message: 'Senha atualizada com sucesso.' };
}

module.exports = {
  login,
  createSession,
  getSessionUser,
  destroySession,
  changePassword
};
