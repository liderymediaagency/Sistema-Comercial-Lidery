const { db, runTransaction, roundMoney } = require('../db');
const { getSettings } = require('./settingsService');
const { createNotification } = require('./notificationService');
const { recordLog } = require('./auditService');

function generateSaleCode() {
  const dateStr = new Date().toISOString().slice(0, 7).replace('-', '');
  const row = db.prepare(`
    SELECT sale_code FROM sales WHERE sale_code LIKE ? ORDER BY id DESC LIMIT 1
  `).get(`LID-${dateStr}-%`);
  let nextNum = 1;
  if (row && row.sale_code) {
    const parts = row.sale_code.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  let code = `LID-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  while (db.prepare('SELECT id FROM sales WHERE sale_code = ?').get(code)) {
    nextNum++;
    code = `LID-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  }
  return code;
}

function createSale({
  product_id,
  quantity,
  unit_price,
  client_name,
  client_contact_name,
  client_phone,
  client_email,
  client_city,
  client_state,
  client_notes,
  payment_method,
  payment_status = 'pending',
  installments_count = 1,
  price_justification = '',
  sale_date
}, currentUser) {
  if (!client_name || !client_name.trim()) throw new Error('Nome do cliente ou empresa é obrigatório.');
  if (!client_phone || !client_phone.trim()) throw new Error('Telefone ou WhatsApp do cliente é obrigatório.');
  if (!payment_method) throw new Error('Forma de pagamento é obrigatória.');

  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) throw new Error('A quantidade deve ser de no mínimo 1 unidade.');

  const price = roundMoney(Number(unit_price));
  if (isNaN(price) || price <= 0) throw new Error('Valor unitário inválido.');

  const settings = getSettings();
  const minPrice = Number(settings.default_min_price) || 70.00;
  const isBelowMin = price < minPrice;

  if (isBelowMin && (!price_justification || !price_justification.trim())) {
    throw new Error(`Venda com valor abaixo do mínimo (R$ ${minPrice.toFixed(2).replace('.', ',')}) exige autorização do administrador e justificativa registrada.`);
  }

  // Find product
  const product = db.prepare('SELECT id, name FROM products WHERE id = ?').get(product_id);
  if (!product) throw new Error('Produto selecionado não encontrado.');

  const totalAmount = roundMoney(qty * price);
  const now = new Date().toISOString();
  const finalSaleDate = sale_date || now.slice(0, 10);

  const sellerRate = Number(settings.seller_commission_pct) || 10.0;
  const repOwnRate = Number(settings.rep_own_commission_pct) || 20.0;
  const repIndirectRate = Number(settings.rep_indirect_commission_pct) || 5.0;

  return runTransaction((tx) => {
    let authorRole = currentUser.role;
    let representativeId = null;
    let sellerCommRate = 0;
    let sellerCommAmount = 0;
    let repIndirectRateApplied = 0;
    let repIndirectAmount = 0;
    let repOwnRateApplied = 0;
    let repOwnAmount = 0;

    if (currentUser.role === 'seller') {
      authorRole = 'seller';
      // Find current representative linked to seller
      const sellerRecord = tx.prepare('SELECT representative_id FROM users WHERE id = ?').get(currentUser.id);
      representativeId = sellerRecord ? sellerRecord.representative_id : null;

      sellerCommRate = sellerRate;
      sellerCommAmount = roundMoney(totalAmount * (sellerRate / 100));

      if (representativeId) {
        repIndirectRateApplied = repIndirectRate;
        repIndirectAmount = roundMoney(totalAmount * (repIndirectRate / 100));
      }
    } else if (currentUser.role === 'representative') {
      authorRole = 'representative';
      representativeId = null; // Own sale, no indirect commission for self
      repOwnRateApplied = repOwnRate;
      repOwnAmount = roundMoney(totalAmount * (repOwnRate / 100));
    } else if (currentUser.role === 'admin') {
      // Admin registering on behalf of themselves or system: treated as 0 commission or standard direct
      authorRole = 'seller';
      sellerCommRate = 0;
      sellerCommAmount = 0;
    }

    const saleCode = generateSaleCode();

    const insertSaleRes = tx.prepare(`
      INSERT INTO sales (
        sale_code, seller_id, author_role, representative_id,
        client_name, client_contact_name, client_phone, client_email, client_city, client_state, client_notes,
        product_id, product_name, quantity, unit_price, total_amount,
        payment_method, payment_status, installments_count, status,
        below_min_price, price_justification,
        seller_commission_rate, seller_commission_amount,
        rep_indirect_rate, rep_indirect_amount,
        rep_own_rate, rep_own_amount,
        sale_date, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, 'pending_approval',
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?
      )
    `).run(
      saleCode, currentUser.id, authorRole, representativeId,
      client_name.trim(), client_contact_name ? client_contact_name.trim() : null, client_phone.trim(), client_email ? client_email.trim() : null, client_city ? client_city.trim() : null, client_state ? client_state.trim() : null, client_notes ? client_notes.trim() : null,
      product.id, product.name, qty, price, totalAmount,
      payment_method, payment_status, parseInt(installments_count, 10) || 1,
      isBelowMin ? 1 : 0, price_justification ? price_justification.trim() : null,
      sellerCommRate, sellerCommAmount,
      repIndirectRateApplied, repIndirectAmount,
      repOwnRateApplied, repOwnAmount,
      finalSaleDate, now, now
    );

    const saleId = Number(insertSaleRes.lastInsertRowid);

    // Create commissions
    if (authorRole === 'seller' && sellerCommAmount > 0) {
      tx.prepare(`
        INSERT INTO commissions (sale_id, beneficiary_id, commission_type, origin_amount, percentage_applied, commission_amount, status, created_at)
        VALUES (?, ?, 'seller_direct', ?, ?, ?, 'pending_approval', ?)
      `).run(saleId, currentUser.id, totalAmount, sellerCommRate, sellerCommAmount, now);
    }

    if (authorRole === 'seller' && representativeId && repIndirectAmount > 0) {
      tx.prepare(`
        INSERT INTO commissions (sale_id, beneficiary_id, commission_type, origin_amount, percentage_applied, commission_amount, status, created_at)
        VALUES (?, ?, 'rep_indirect', ?, ?, ?, 'pending_approval', ?)
      `).run(saleId, representativeId, totalAmount, repIndirectRateApplied, repIndirectAmount, now);
    }

    if (authorRole === 'representative' && repOwnAmount > 0) {
      tx.prepare(`
        INSERT INTO commissions (sale_id, beneficiary_id, commission_type, origin_amount, percentage_applied, commission_amount, status, created_at)
        VALUES (?, ?, 'rep_own', ?, ?, ?, 'pending_approval', ?)
      `).run(saleId, currentUser.id, totalAmount, repOwnRateApplied, repOwnAmount, now);
    }

    // Notifications
    // Notify admins that a new sale was registered
    const admins = tx.prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active'").all();
    for (const admin of admins) {
      tx.prepare(`
        INSERT INTO notifications (user_id, title, message, type, link_url, is_read, created_at)
        VALUES (?, ?, ?, 'sale_registered', ?, 0, ?)
      `).run(
        admin.id,
        'Nova Venda Registrada',
        `Venda ${saleCode} de R$ ${totalAmount.toFixed(2).replace('.', ',')} registrada por ${currentUser.full_name}${isBelowMin ? ' (ATENÇÃO: Preço abaixo do mínimo, requer aprovação)' : ''}.`,
        `/admin/sales?code=${saleCode}`,
        now
      );
    }

    // If seller registered and has representative, notify representative
    if (representativeId) {
      tx.prepare(`
        INSERT INTO notifications (user_id, title, message, type, link_url, is_read, created_at)
        VALUES (?, ?, ?, 'sale_registered', ?, 0, ?)
      `).run(
        representativeId,
        'Nova Venda da Equipe',
        `O vendedor ${currentUser.full_name} registrou a venda ${saleCode} no valor de R$ ${totalAmount.toFixed(2).replace('.', ',')}. Comissão indireta prevista: R$ ${repIndirectAmount.toFixed(2).replace('.', ',')}.`,
        `/rep/sales?code=${saleCode}`,
        now
      );
    }

    tx.prepare(`
      INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, new_values, created_at, notes)
      VALUES (?, ?, 'SALE_CREATED', 'sales', ?, ?, ?, ?)
    `).run(
      currentUser.id, currentUser.username, String(saleId),
      JSON.stringify({ saleCode, totalAmount, qty, price, authorRole }),
      now, `Venda ${saleCode} registrada com status aguardando aprovação`
    );

    return getSaleById(saleId);
  });
}

function getSaleById(id) {
  return db.prepare(`
    SELECT s.*, 
           u.full_name as seller_name, u.username as seller_username,
           r.full_name as representative_name, r.username as representative_username,
           appr.full_name as approved_by_name
    FROM sales s
    JOIN users u ON u.id = s.seller_id
    LEFT JOIN users r ON r.id = s.representative_id
    LEFT JOIN users appr ON appr.id = s.approved_by_id
    WHERE s.id = ?
  `).get(id);
}

function listSales({
  user,
  search,
  status,
  payment_status,
  payment_method,
  startDate,
  endDate,
  period,
  seller_id,
  representative_id,
  limit = 200,
  offset = 0
} = {}) {
  let query = `
    SELECT s.*, 
           u.full_name as seller_name, u.username as seller_username,
           r.full_name as representative_name, r.username as representative_username,
           appr.full_name as approved_by_name
    FROM sales s
    JOIN users u ON u.id = s.seller_id
    LEFT JOIN users r ON r.id = s.representative_id
    LEFT JOIN users appr ON appr.id = s.approved_by_id
    WHERE 1=1
  `;
  const params = [];

  // Scoping according to user role
  if (user) {
    if (user.role === 'seller') {
      query += ' AND s.seller_id = ?';
      params.push(user.id);
    } else if (user.role === 'representative') {
      // Rep sees own sales AND sales of sellers linked to him
      query += ' AND (s.seller_id = ? OR s.representative_id = ?)';
      params.push(user.id, user.id);
    }
  }

  if (seller_id) {
    query += ' AND s.seller_id = ?';
    params.push(seller_id);
  }

  if (representative_id) {
    query += ' AND s.representative_id = ?';
    params.push(representative_id);
  }

  if (status) {
    query += ' AND s.status = ?';
    params.push(status);
  }

  if (payment_status) {
    query += ' AND s.payment_status = ?';
    params.push(payment_status);
  }

  if (payment_method) {
    query += ' AND s.payment_method = ?';
    params.push(payment_method);
  }

  // Period filter
  const today = new Date().toISOString().slice(0, 10);
  if (period === 'today') {
    query += ' AND s.sale_date = ?';
    params.push(today);
  } else if (period === 'last_7_days') {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    query += ' AND s.sale_date >= ?';
    params.push(d);
  } else if (period === 'current_month') {
    const prefix = today.slice(0, 7);
    query += ' AND s.sale_date LIKE ?';
    params.push(`${prefix}%`);
  } else if (period === 'previous_month') {
    const prevDate = new Date();
    prevDate.setMonth(prevDate.getMonth() - 1);
    const prefix = prevDate.toISOString().slice(0, 7);
    query += ' AND s.sale_date LIKE ?';
    params.push(`${prefix}%`);
  } else if (period === 'current_year') {
    const prefix = today.slice(0, 4);
    query += ' AND s.sale_date LIKE ?';
    params.push(`${prefix}%`);
  } else if (startDate && endDate) {
    query += ' AND s.sale_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  if (search) {
    query += ' AND (s.sale_code LIKE ? OR s.client_name LIKE ? OR u.full_name LIKE ? OR s.client_phone LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  query += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

function approveSale(saleId, adminUser) {
  const sale = getSaleById(saleId);
  if (!sale) throw new Error('Venda não encontrada.');
  if (sale.status === 'approved') throw new Error('Esta venda já está aprovada.');
  if (sale.status === 'cancelled') throw new Error('Vendas canceladas não podem ser aprovadas.');

  const now = new Date().toISOString();

  return runTransaction((tx) => {
    tx.prepare(`
      UPDATE sales 
      SET status = 'approved', approved_at = ?, approved_by_id = ?, updated_at = ?
      WHERE id = ?
    `).run(now, adminUser.id, now, saleId);

    // Update commissions linked to this sale to approved
    tx.prepare(`
      UPDATE commissions
      SET status = 'approved', approved_at = ?
      WHERE sale_id = ? AND status = 'pending_approval'
    `).run(now, saleId);

    // Notify seller
    tx.prepare(`
      INSERT INTO notifications (user_id, title, message, type, link_url, is_read, created_at)
      VALUES (?, 'Venda Aprovada!', ?, 'sale_approved', ?, 0, ?)
    `).run(
      sale.seller_id,
      `Sua venda ${sale.sale_code} no valor de R$ ${sale.total_amount.toFixed(2).replace('.', ',')} foi aprovada! Comissão liberada para pagamento.`,
      `/seller/sales`,
      now
    );

    // Notify representative if indirect commission exists
    if (sale.representative_id) {
      tx.prepare(`
        INSERT INTO notifications (user_id, title, message, type, link_url, is_read, created_at)
        VALUES (?, 'Comissão Indireta Aprovada!', ?, 'sale_approved', ?, 0, ?)
      `).run(
        sale.representative_id,
        `A venda ${sale.sale_code} da sua equipe foi aprovada. Sua comissão indireta de R$ ${sale.rep_indirect_amount.toFixed(2).replace('.', ',')} foi liberada!`,
        `/rep/sales`,
        now
      );
    }

    tx.prepare(`
      INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, old_values, new_values, created_at, notes)
      VALUES (?, ?, 'SALE_APPROVED', 'sales', ?, ?, ?, ?, 'Venda aprovada pelo administrador')
    `).run(adminUser.id, adminUser.username, String(saleId), JSON.stringify({ status: sale.status }), JSON.stringify({ status: 'approved' }), now);

    return getSaleById(saleId);
  });
}

function rejectSale(saleId, reason, adminUser) {
  if (!reason || !reason.trim()) throw new Error('Motivo da recusa é obrigatório.');
  const sale = getSaleById(saleId);
  if (!sale) throw new Error('Venda não encontrada.');
  if (sale.status === 'rejected') throw new Error('Esta venda já foi recusada.');

  const now = new Date().toISOString();

  return runTransaction((tx) => {
    tx.prepare(`
      UPDATE sales 
      SET status = 'rejected', rejection_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(reason.trim(), now, saleId);

    // Cancel unpaid commissions
    tx.prepare(`
      UPDATE commissions
      SET status = 'cancelled'
      WHERE sale_id = ? AND status != 'paid'
    `).run(saleId);

    // Notify seller
    tx.prepare(`
      INSERT INTO notifications (user_id, title, message, type, link_url, is_read, created_at)
      VALUES (?, 'Venda Recusada', ?, 'sale_rejected', ?, 0, ?)
    `).run(
      sale.seller_id,
      `A venda ${sale.sale_code} foi recusada pelo administrador. Motivo: ${reason}`,
      `/seller/sales`,
      now
    );

    tx.prepare(`
      INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, old_values, new_values, created_at, notes)
      VALUES (?, ?, 'SALE_REJECTED', 'sales', ?, ?, ?, ?, ?)
    `).run(
      adminUser.id, adminUser.username, String(saleId),
      JSON.stringify({ status: sale.status }), JSON.stringify({ status: 'rejected', reason }),
      now, `Venda recusada: ${reason}`
    );

    return getSaleById(saleId);
  });
}

function cancelSale(saleId, reason, adminUser) {
  if (!reason || !reason.trim()) throw new Error('Motivo do cancelamento é obrigatório.');
  const sale = getSaleById(saleId);
  if (!sale) throw new Error('Venda não encontrada.');
  if (sale.status === 'cancelled') throw new Error('Esta venda já foi cancelada.');

  const now = new Date().toISOString();

  return runTransaction((tx) => {
    tx.prepare(`
      UPDATE sales 
      SET status = 'cancelled', cancellation_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(reason.trim(), now, saleId);

    // Check commissions
    const comms = tx.prepare('SELECT * FROM commissions WHERE sale_id = ?').all(saleId);

    for (const c of comms) {
      if (c.status === 'paid') {
        // Commission was already paid! Do NOT delete history!
        // Requirement: "Se já houver comissão paga, não apagar o histórico. Criar ajuste financeiro rastreável, com crédito negativo quando necessário, para manter a conciliação."
        tx.prepare(`
          INSERT INTO financial_adjustments (sale_id, commission_id, beneficiary_id, adjustment_type, amount, reason, created_by_id, created_at)
          VALUES (?, ?, ?, 'debit_reversal', ?, ?, ?, ?)
        `).run(
          saleId,
          c.id,
          c.beneficiary_id,
          -Math.abs(c.commission_amount), // negative credit / debit
          `Estorno de comissão paga devido ao cancelamento da venda ${sale.sale_code}. Motivo: ${reason}`,
          adminUser.id,
          now
        );
      } else {
        // Commission not paid yet -> simply cancel it
        tx.prepare("UPDATE commissions SET status = 'cancelled' WHERE id = ?").run(c.id);
      }
    }

    // Notify seller
    tx.prepare(`
      INSERT INTO notifications (user_id, title, message, type, link_url, is_read, created_at)
      VALUES (?, 'Venda Cancelada', ?, 'sale_cancelled', ?, 0, ?)
    `).run(
      sale.seller_id,
      `A venda ${sale.sale_code} foi cancelada. Motivo: ${reason}`,
      `/seller/sales`,
      now
    );

    tx.prepare(`
      INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, old_values, new_values, created_at, notes)
      VALUES (?, ?, 'SALE_CANCELLED', 'sales', ?, ?, ?, ?, ?)
    `).run(
      adminUser.id, adminUser.username, String(saleId),
      JSON.stringify({ status: sale.status }), JSON.stringify({ status: 'cancelled', reason }),
      now, `Venda cancelada: ${reason}`
    );

    return getSaleById(saleId);
  });
}

function updatePaymentStatus(saleId, paymentStatus, adminUser) {
  if (!['pending', 'confirmed', 'installments', 'cancelled'].includes(paymentStatus)) {
    throw new Error('Status de pagamento inválido.');
  }

  const sale = getSaleById(saleId);
  if (!sale) throw new Error('Venda não encontrada.');

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE sales SET payment_status = ?, updated_at = ? WHERE id = ?
  `).run(paymentStatus, now, saleId);

  recordLog({
    userId: adminUser.id,
    username: adminUser.username,
    action: 'SALE_PAYMENT_STATUS_UPDATED',
    entityType: 'sales',
    entityId: saleId,
    oldValues: { payment_status: sale.payment_status },
    newValues: { payment_status: paymentStatus },
    notes: `Status de pagamento da venda ${sale.sale_code} atualizado para ${paymentStatus}`
  });

  return getSaleById(saleId);
}

function requestCorrection(saleId, type, reason, user) {
  if (!reason || !reason.trim()) throw new Error('Motivo da solicitação é obrigatório.');
  const sale = getSaleById(saleId);
  if (!sale) throw new Error('Venda não encontrada.');

  // Check authorization: must be seller or rep
  if (user.role === 'seller' && sale.seller_id !== user.id) {
    throw new Error('Você só pode solicitar alterações em suas próprias vendas.');
  }
  if (user.role === 'representative' && sale.seller_id !== user.id && sale.representative_id !== user.id) {
    throw new Error('Acesso não autorizado a esta venda.');
  }

  const now = new Date().toISOString();
  const res = db.prepare(`
    INSERT INTO correction_requests (sale_id, requested_by_id, type, reason, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(saleId, user.id, type, reason.trim(), now);

  // Notify admins
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active'").all();
  for (const a of admins) {
    createNotification(a.id, {
      title: 'Nova Solicitação de Alteração',
      message: `${user.full_name} solicitou ${type === 'cancellation' ? 'cancelamento' : 'correção'} na venda ${sale.sale_code}: ${reason}`,
      type: 'correction_request',
      link_url: `/admin/sales?code=${sale.sale_code}`
    });
  }

  return { success: true, message: 'Solicitação enviada com sucesso para o administrador.' };
}

module.exports = {
  createSale,
  getSaleById,
  listSales,
  approveSale,
  rejectSale,
  cancelSale,
  updatePaymentStatus,
  requestCorrection
};
