const { db, runTransaction, roundMoney } = require('../db');
const { createNotification } = require('./notificationService');
const { recordLog } = require('./auditService');

function generatePaymentCode() {
  const dateStr = new Date().toISOString().slice(0, 7).replace('-', '');
  const row = db.prepare('SELECT payment_code FROM payments WHERE payment_code LIKE ? ORDER BY id DESC LIMIT 1').get(`PAY-${dateStr}-%`);
  let nextNum = 1;
  if (row && row.payment_code) {
    const parts = row.payment_code.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  let code = `PAY-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  while (db.prepare('SELECT id FROM payments WHERE payment_code = ?').get(code)) {
    nextNum++;
    code = `PAY-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  }
  return code;
}

function getEligibleCommissions(beneficiaryId = null) {
  let query = `
    SELECT c.*,
           s.sale_code, s.sale_date, s.client_name, s.product_name, s.total_amount as sale_total_amount,
           b.full_name as beneficiary_name, b.username as beneficiary_username, b.role as beneficiary_role
    FROM commissions c
    JOIN sales s ON s.id = c.sale_id
    JOIN users b ON b.id = c.beneficiary_id
    WHERE c.status = 'approved' AND c.payment_id IS NULL
  `;
  const params = [];

  if (beneficiaryId) {
    query += ' AND c.beneficiary_id = ?';
    params.push(beneficiaryId);
  }

  query += ' ORDER BY c.created_at ASC';
  return db.prepare(query).all(...params);
}

function createPayment({
  beneficiary_id,
  commission_ids,
  payment_method,
  payment_date,
  transaction_reference,
  notes
}, adminUser) {
  if (!beneficiary_id) throw new Error('Beneficiário é obrigatório.');
  if (!commission_ids || !Array.isArray(commission_ids) || commission_ids.length === 0) {
    throw new Error('Ao menos uma comissão deve ser selecionada para pagamento.');
  }
  if (!payment_method) throw new Error('Forma de pagamento é obrigatória.');

  const beneficiary = db.prepare('SELECT id, full_name, username, role FROM users WHERE id = ?').get(beneficiary_id);
  if (!beneficiary) throw new Error('Beneficiário não encontrado.');

  const now = new Date().toISOString();
  const payDate = payment_date || now.slice(0, 10);
  const paymentCode = generatePaymentCode();

  return runTransaction((tx) => {
    // Validate each commission: MUST be approved, belong to this beneficiary, and NOT paid
    let calculatedTotal = 0;
    const validatedCommissions = [];

    for (const commId of commission_ids) {
      const comm = tx.prepare(`
        SELECT * FROM commissions WHERE id = ?
      `).get(commId);

      if (!comm) {
        throw new Error(`Comissão ID ${commId} não foi encontrada.`);
      }
      if (comm.beneficiary_id !== beneficiary.id) {
        throw new Error(`Comissão ID ${commId} não pertence ao beneficiário selecionado.`);
      }
      if (comm.status !== 'approved') {
        throw new Error(`Comissão ID ${commId} não está com status 'aprovada' (status atual: ${comm.status}).`);
      }
      if (comm.payment_id !== null) {
        throw new Error(`Comissão ID ${commId} já foi incluída em outro pagamento anteriormente (Prevenção de duplicidade).`);
      }

      calculatedTotal = roundMoney(calculatedTotal + comm.commission_amount);
      validatedCommissions.push(comm);
    }

    if (calculatedTotal <= 0) {
      throw new Error('O valor total do pagamento deve ser maior que zero.');
    }

    // Insert payment record
    const insertPay = tx.prepare(`
      INSERT INTO payments (
        payment_code, beneficiary_id, total_amount, payment_method, payment_date,
        transaction_reference, status, notes, admin_id, created_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, 'paid', ?, ?, ?
      )
    `).run(
      paymentCode,
      beneficiary.id,
      calculatedTotal,
      payment_method,
      payDate,
      transaction_reference ? transaction_reference.trim() : null,
      notes ? notes.trim() : null,
      adminUser.id,
      now
    );

    const paymentId = Number(insertPay.lastInsertRowid);

    // Insert payment items and update commissions
    for (const comm of validatedCommissions) {
      tx.prepare(`
        INSERT INTO payment_items (payment_id, commission_id, amount)
        VALUES (?, ?, ?)
      `).run(paymentId, comm.id, comm.commission_amount);

      tx.prepare(`
        UPDATE commissions
        SET status = 'paid', payment_id = ?, paid_at = ?
        WHERE id = ?
      `).run(paymentId, now, comm.id);
    }

    // Notify beneficiary
    tx.prepare(`
      INSERT INTO notifications (user_id, title, message, type, link_url, is_read, created_at)
      VALUES (?, 'Pagamento de Comissões Realizado!', ?, 'payment_paid', ?, 0, ?)
    `).run(
      beneficiary.id,
      `Você recebeu um pagamento no valor de R$ ${calculatedTotal.toFixed(2).replace('.', ',')} (Comprovante/Ref: ${paymentCode}) via ${payment_method}.`,
      beneficiary.role === 'seller' ? '/seller/commissions' : '/rep/financial',
      now
    );

    // Audit log
    tx.prepare(`
      INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, new_values, created_at, notes)
      VALUES (?, ?, 'PAYMENT_CONFIRMED', 'payments', ?, ?, ?, ?)
    `).run(
      adminUser.id, adminUser.username, String(paymentId),
      JSON.stringify({ paymentCode, beneficiaryId: beneficiary.id, totalAmount: calculatedTotal, commissionsCount: validatedCommissions.length }),
      now, `Pagamento ${paymentCode} no valor de R$ ${calculatedTotal.toFixed(2)} confirmado para ${beneficiary.full_name}`
    );

    return getPaymentById(paymentId, tx);
  });
}

function getPaymentById(id, tx = db) {
  const payment = tx.prepare(`
    SELECT p.*,
           b.full_name as beneficiary_name, b.username as beneficiary_username, b.role as beneficiary_role,
           a.full_name as admin_name
    FROM payments p
    JOIN users b ON b.id = p.beneficiary_id
    JOIN users a ON a.id = p.admin_id
    WHERE p.id = ?
  `).get(id);

  if (!payment) return null;

  const items = tx.prepare(`
    SELECT pi.*, c.origin_amount, c.percentage_applied, c.commission_type,
           s.sale_code, s.sale_date, s.client_name
    FROM payment_items pi
    JOIN commissions c ON c.id = pi.commission_id
    JOIN sales s ON s.id = c.sale_id
    WHERE pi.payment_id = ?
  `).all(id);

  payment.items = items;
  return payment;
}

function listPayments({ user, beneficiary_id, limit = 100, offset = 0 } = {}) {
  let query = `
    SELECT p.*,
           b.full_name as beneficiary_name, b.username as beneficiary_username, b.role as beneficiary_role,
           a.full_name as admin_name,
           (SELECT COUNT(*) FROM payment_items pi WHERE pi.payment_id = p.id) as items_count
    FROM payments p
    JOIN users b ON b.id = p.beneficiary_id
    JOIN users a ON a.id = p.admin_id
    WHERE 1=1
  `;
  const params = [];

  if (user && user.role !== 'admin') {
    query += ' AND p.beneficiary_id = ?';
    params.push(user.id);
  } else if (beneficiary_id) {
    query += ' AND p.beneficiary_id = ?';
    params.push(beneficiary_id);
  }

  query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

module.exports = {
  getEligibleCommissions,
  createPayment,
  getPaymentById,
  listPayments
};
