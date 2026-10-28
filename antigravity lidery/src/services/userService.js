const { db, hashPassword, runTransaction } = require('../db');

function listUsers({ role, status, search } = {}) {
  let query = `
    SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role, u.status,
           u.representative_id, u.must_change_password, u.created_at, u.last_login_at,
           r.full_name as representative_name,
           (SELECT COUNT(*) FROM sales s WHERE s.seller_id = u.id AND s.status = 'approved') as approved_sales_count,
           (SELECT COALESCE(SUM(s.total_amount), 0) FROM sales s WHERE s.seller_id = u.id AND s.status = 'approved') as approved_sales_total,
           (SELECT COUNT(*) FROM users sub WHERE sub.representative_id = u.id AND sub.status = 'active') as active_sellers_count
    FROM users u
    LEFT JOIN users r ON r.id = u.representative_id
    WHERE 1=1
  `;
  const params = [];

  if (role) {
    query += ' AND u.role = ?';
    params.push(role);
  }
  if (status) {
    query += ' AND u.status = ?';
    params.push(status);
  }
  if (search) {
    query += ' AND (u.full_name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  query += ' ORDER BY u.created_at DESC';
  return db.prepare(query).all(...params);
}

function getUserById(id) {
  return db.prepare(`
    SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role, u.status,
           u.representative_id, u.must_change_password, u.created_at, u.last_login_at,
           r.full_name as representative_name
    FROM users u
    LEFT JOIN users r ON r.id = u.representative_id
    WHERE u.id = ?
  `).get(id);
}

function createUser({ username, password, full_name, email, phone, role, representative_id, must_change_password = 0 }, adminUser) {
  if (!username || !password || !full_name || !role) {
    throw new Error('Nome completo, usuário, senha e perfil são obrigatórios.');
  }

  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername.length < 3) {
    throw new Error('O nome de usuário deve ter no mínimo 3 caracteres.');
  }
  if (password.length < 6) {
    throw new Error('A senha deve ter no mínimo 6 caracteres.');
  }

  if (!['seller', 'representative'].includes(role)) {
    throw new Error('Apenas contas de Vendedor ou Representante podem ser criadas.');
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(cleanUsername);
  if (existing) {
    throw new Error('Este nome de usuário já está em uso.');
  }

  let finalRepId = null;
  if (role === 'seller' && representative_id) {
    const rep = db.prepare("SELECT id, role, status FROM users WHERE id = ?").get(representative_id);
    if (!rep || rep.role !== 'representative' || rep.status !== 'active') {
      throw new Error('Representante informado é inválido ou inativo.');
    }
    finalRepId = rep.id;
  }

  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);

  return runTransaction((tx) => {
    const res = tx.prepare(`
      INSERT INTO users (username, password_hash, full_name, email, phone, role, representative_id, status, must_change_password, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(cleanUsername, passwordHash, full_name.trim(), email ? email.trim() : null, phone ? phone.trim() : null, role, finalRepId, must_change_password ? 1 : 0, now, now);

    const newUserId = Number(res.lastInsertRowid);

    if (finalRepId) {
      tx.prepare(`
        INSERT INTO representative_seller_history (seller_id, representative_id, action, created_by_id, created_at, notes)
        VALUES (?, ?, 'link', ?, ?, 'Vínculo inicial definido na criação do usuário')
      `).run(newUserId, finalRepId, adminUser.id, now);
    }

    tx.prepare(`
      INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, new_values, created_at, notes)
      VALUES (?, ?, 'USER_CREATED', 'users', ?, ?, ?, ?)
    `).run(adminUser.id, adminUser.username, String(newUserId), JSON.stringify({ username: cleanUsername, role, full_name }), now, `Usuário ${cleanUsername} (${role}) criado pelo administrador`);

    return getUserById(newUserId);
  });
}

function updateUser(id, { full_name, email, phone, status, username }, adminUser) {
  const existing = getUserById(id);
  if (!existing) throw new Error('Usuário não encontrado.');

  const now = new Date().toISOString();
  const updates = [];
  const params = [];

  if (full_name !== undefined) {
    updates.push('full_name = ?');
    params.push(full_name.trim());
  }
  if (email !== undefined) {
    updates.push('email = ?');
    params.push(email ? email.trim() : null);
  }
  if (phone !== undefined) {
    updates.push('phone = ?');
    params.push(phone ? phone.trim() : null);
  }
  if (status !== undefined) {
    if (!['active', 'inactive'].includes(status)) throw new Error('Status inválido.');
    // Prevent admin from deactivating self
    if (existing.role === 'admin' && status === 'inactive') {
      throw new Error('Não é permitido desativar a conta do administrador principal.');
    }
    updates.push('status = ?');
    params.push(status);
  }
  if (username !== undefined && username.trim().toLowerCase() !== existing.username.toLowerCase()) {
    const cleanUsername = username.trim().toLowerCase();
    const clash = db.prepare('SELECT id FROM users WHERE username = ? AND id != ? COLLATE NOCASE').get(cleanUsername, id);
    if (clash) throw new Error('Nome de usuário já está em uso.');
    updates.push('username = ?');
    params.push(cleanUsername);
  }

  if (updates.length === 0) return existing;

  updates.push('updated_at = ?');
  params.push(now);
  params.push(id);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  db.prepare(`
    INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, old_values, new_values, created_at, notes)
    VALUES (?, ?, 'USER_UPDATED', 'users', ?, ?, ?, ?, 'Dados cadastrais atualizados pelo administrador')
  `).run(adminUser.id, adminUser.username, String(id), JSON.stringify(existing), JSON.stringify({ full_name, email, phone, status, username }), now);

  return getUserById(id);
}

function adminResetPassword(id, newPassword, adminUser) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('A nova senha deve ter no mínimo 6 caracteres.');
  }

  const existing = getUserById(id);
  if (!existing) throw new Error('Usuário não encontrado.');

  const newHash = hashPassword(newPassword);
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE users
    SET password_hash = ?, must_change_password = 0, updated_at = ?
    WHERE id = ?
  `).run(newHash, now, id);

  // Terminate any active sessions for security
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);

  db.prepare(`
    INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, created_at, notes)
    VALUES (?, ?, 'PASSWORD_RESET_BY_ADMIN', 'users', ?, ?, 'Senha redefinida pelo administrador. Exige troca no próximo login.')
  `).run(adminUser.id, adminUser.username, String(id), now);

  return { success: true, message: 'Senha redefinida com sucesso. O usuário precisará alterá-la no próximo acesso.' };
}

function linkSellerToRepresentative(sellerId, representativeId, notes = '', adminUser) {
  const seller = getUserById(sellerId);
  if (!seller) throw new Error('Vendedor não encontrado.');
  if (seller.role !== 'seller') throw new Error('O usuário selecionado não é um vendedor.');

  let newRep = null;
  if (representativeId) {
    newRep = getUserById(representativeId);
    if (!newRep || newRep.role !== 'representative') {
      throw new Error('Representante informado é inválido.');
    }
  }

  const oldRepId = seller.representative_id;
  const now = new Date().toISOString();

  return runTransaction((tx) => {
    tx.prepare('UPDATE users SET representative_id = ?, updated_at = ? WHERE id = ?')
      .run(representativeId || null, now, sellerId);

    const action = representativeId ? 'link' : 'unlink';
    tx.prepare(`
      INSERT INTO representative_seller_history (seller_id, representative_id, action, created_by_id, created_at, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sellerId, representativeId || null, action, adminUser.id, now, notes || (representativeId ? `Vinculado ao representante ${newRep.full_name}` : 'Desvinculado de representante'));

    tx.prepare(`
      INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, old_values, new_values, created_at, notes)
      VALUES (?, ?, 'SELLER_REP_LINK_CHANGED', 'users', ?, ?, ?, ?, ?)
    `).run(
      adminUser.id,
      adminUser.username,
      String(sellerId),
      JSON.stringify({ previous_rep_id: oldRepId }),
      JSON.stringify({ new_rep_id: representativeId || null }),
      now,
      `Vínculo do vendedor alterado pelo administrador. Vendas anteriores mantêm suas comissões históricas.`
    );

    return getUserById(sellerId);
  });
}

function getRepresentativeTeam(representativeId) {
  const rep = getUserById(representativeId);
  if (!rep || rep.role !== 'representative') {
    throw new Error('Representante não encontrado.');
  }

  // Get all currently linked sellers with aggregate stats
  const sellers = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.email, u.phone, u.status, u.created_at,
           (SELECT created_at FROM representative_seller_history 
            WHERE seller_id = u.id AND representative_id = ? AND action = 'link' 
            ORDER BY created_at DESC LIMIT 1) as linked_at,
           COALESCE((SELECT COUNT(*) FROM sales s WHERE s.seller_id = u.id AND s.status = 'approved'), 0) as total_approved_sales_count,
           COALESCE((SELECT SUM(s.total_amount) FROM sales s WHERE s.seller_id = u.id AND s.status = 'approved'), 0) as total_approved_sales_volume,
           COALESCE((SELECT SUM(c.commission_amount) FROM commissions c 
                     JOIN sales s ON s.id = c.sale_id 
                     WHERE c.beneficiary_id = u.id AND c.commission_type = 'seller_direct' AND c.status IN ('approved', 'paid')), 0) as seller_total_commission,
           COALESCE((SELECT SUM(c.commission_amount) FROM commissions c 
                     JOIN sales s ON s.id = c.sale_id 
                     WHERE c.beneficiary_id = ? AND s.seller_id = u.id AND c.commission_type = 'rep_indirect' AND c.status IN ('approved', 'paid')), 0) as rep_indirect_commission_generated
    FROM users u
    WHERE u.representative_id = ?
    ORDER BY u.full_name ASC
  `).all(representativeId, representativeId, representativeId);

  return sellers;
}

function getRepresentativeHistory(sellerId) {
  return db.prepare(`
    SELECT h.id, h.action, h.created_at, h.notes,
           r.full_name as representative_name,
           u.full_name as admin_name
    FROM representative_seller_history h
    LEFT JOIN users r ON r.id = h.representative_id
    LEFT JOIN users u ON u.id = h.created_by_id
    WHERE h.seller_id = ?
    ORDER BY h.created_at DESC
  `).all(sellerId);
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  adminResetPassword,
  linkSellerToRepresentative,
  getRepresentativeTeam,
  getRepresentativeHistory
};
