const { db, roundMoney } = require('../db');

function listCommissions({
  user,
  beneficiary_id,
  commission_type,
  status,
  period,
  startDate,
  endDate,
  limit = 200,
  offset = 0
} = {}) {
  let query = `
    SELECT c.*,
           s.sale_code, s.sale_date, s.client_name, s.product_name, s.total_amount as sale_total_amount,
           s.payment_status as sale_payment_status, s.status as sale_status,
           b.full_name as beneficiary_name, b.username as beneficiary_username, b.role as beneficiary_role,
           seller.full_name as sale_seller_name,
           p.payment_code, p.payment_date as payout_date, p.payment_method as payout_method
    FROM commissions c
    JOIN sales s ON s.id = c.sale_id
    JOIN users b ON b.id = c.beneficiary_id
    JOIN users seller ON seller.id = s.seller_id
    LEFT JOIN payments p ON p.id = c.payment_id
    WHERE 1=1
  `;
  const params = [];

  // Scoping according to user
  if (user && user.role !== 'admin') {
    query += ' AND c.beneficiary_id = ?';
    params.push(user.id);
  } else if (beneficiary_id) {
    query += ' AND c.beneficiary_id = ?';
    params.push(beneficiary_id);
  }

  if (commission_type) {
    query += ' AND c.commission_type = ?';
    params.push(commission_type);
  }

  if (status) {
    query += ' AND c.status = ?';
    params.push(status);
  }

  // Period filter applied to sale_date
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

  query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

function getSellerDashboardMetrics(sellerId, period = 'all', startDate = null, endDate = null) {
  let dateClause = '';
  const dateParams = [];
  const today = new Date().toISOString().slice(0, 10);

  if (period === 'today') {
    dateClause = ' AND s.sale_date = ?';
    dateParams.push(today);
  } else if (period === 'last_7_days') {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dateClause = ' AND s.sale_date >= ?';
    dateParams.push(d);
  } else if (period === 'current_month') {
    dateClause = ' AND s.sale_date LIKE ?';
    dateParams.push(`${today.slice(0, 7)}%`);
  } else if (period === 'previous_month') {
    const prevDate = new Date();
    prevDate.setMonth(prevDate.getMonth() - 1);
    dateClause = ' AND s.sale_date LIKE ?';
    dateParams.push(`${prevDate.toISOString().slice(0, 7)}%`);
  } else if (period === 'current_year') {
    dateClause = ' AND s.sale_date LIKE ?';
    dateParams.push(`${today.slice(0, 4)}%`);
  } else if (startDate && endDate) {
    dateClause = ' AND s.sale_date BETWEEN ? AND ?';
    dateParams.push(startDate, endDate);
  }

  // Sales totals
  const salesSummary = db.prepare(`
    SELECT 
      COUNT(*) as total_sales_count,
      COALESCE(SUM(total_amount), 0) as total_sold_amount,
      COUNT(CASE WHEN status = 'pending_approval' THEN 1 END) as pending_sales_count,
      COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_sales_count
    FROM sales s
    WHERE s.seller_id = ? ${dateClause}
  `).get(sellerId, ...dateParams);

  const totalSold = roundMoney(salesSummary.total_sold_amount);
  const salesCount = salesSummary.total_sales_count;
  const avgTicket = salesCount > 0 ? roundMoney(totalSold / salesCount) : 0;

  // Commissions breakdown for this seller
  const commSummary = db.prepare(`
    SELECT
      COALESCE(SUM(c.commission_amount), 0) as total_generated,
      COALESCE(SUM(CASE WHEN c.status = 'pending_approval' THEN c.commission_amount END), 0) as pending_approval,
      COALESCE(SUM(CASE WHEN c.status = 'approved' THEN c.commission_amount END), 0) as approved_pending_payout,
      COALESCE(SUM(CASE WHEN c.status = 'paid' THEN c.commission_amount END), 0) as paid
    FROM commissions c
    JOIN sales s ON s.id = c.sale_id
    WHERE c.beneficiary_id = ? AND c.status != 'cancelled' ${dateClause}
  `).get(sellerId, ...dateParams);

  // Financial adjustments for this seller
  const adjSummary = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_adjustments
    FROM financial_adjustments
    WHERE beneficiary_id = ?
  `).get(sellerId);

  return {
    total_sold: totalSold,
    sales_count: salesCount,
    avg_ticket: avgTicket,
    pending_sales_count: salesSummary.pending_sales_count,
    approved_sales_count: salesSummary.approved_sales_count,
    commission_generated: roundMoney(commSummary.total_generated),
    commission_pending_approval: roundMoney(commSummary.pending_approval),
    commission_approved_pending_payout: roundMoney(commSummary.approved_pending_payout),
    commission_paid: roundMoney(commSummary.paid),
    financial_adjustments: roundMoney(adjSummary ? adjSummary.total_adjustments : 0)
  };
}

function getRepresentativeDashboardMetrics(representativeId, period = 'all', startDate = null, endDate = null) {
  let dateClause = '';
  const dateParams = [];
  const today = new Date().toISOString().slice(0, 10);

  if (period === 'today') {
    dateClause = ' AND s.sale_date = ?';
    dateParams.push(today);
  } else if (period === 'last_7_days') {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dateClause = ' AND s.sale_date >= ?';
    dateParams.push(d);
  } else if (period === 'current_month') {
    dateClause = ' AND s.sale_date LIKE ?';
    dateParams.push(`${today.slice(0, 7)}%`);
  } else if (period === 'previous_month') {
    const prevDate = new Date();
    prevDate.setMonth(prevDate.getMonth() - 1);
    dateClause = ' AND s.sale_date LIKE ?';
    dateParams.push(`${prevDate.toISOString().slice(0, 7)}%`);
  } else if (period === 'current_year') {
    dateClause = ' AND s.sale_date LIKE ?';
    dateParams.push(`${today.slice(0, 4)}%`);
  } else if (startDate && endDate) {
    dateClause = ' AND s.sale_date BETWEEN ? AND ?';
    dateParams.push(startDate, endDate);
  }

  // Own sales (where seller_id = repId and author_role = 'representative')
  const ownSales = db.prepare(`
    SELECT 
      COUNT(*) as count,
      COALESCE(SUM(total_amount), 0) as volume,
      COALESCE(SUM(rep_own_amount), 0) as comm_own
    FROM sales s
    WHERE s.seller_id = ? AND s.author_role = 'representative' AND s.status = 'approved' ${dateClause}
  `).get(representativeId, ...dateParams);

  // Team sales (where representative_id = repId and author_role = 'seller')
  const teamSales = db.prepare(`
    SELECT 
      COUNT(*) as count,
      COALESCE(SUM(total_amount), 0) as volume,
      COALESCE(SUM(rep_indirect_amount), 0) as comm_indirect
    FROM sales s
    WHERE s.representative_id = ? AND s.author_role = 'seller' AND s.status = 'approved' ${dateClause}
  `).get(representativeId, ...dateParams);

  // Active sellers in team
  const activeSellers = db.prepare(`
    SELECT COUNT(*) as count FROM users WHERE representative_id = ? AND status = 'active'
  `).get(representativeId);

  // Detailed commission status for representative (all types: rep_own + rep_indirect)
  const commStatus = db.prepare(`
    SELECT
      COALESCE(SUM(c.commission_amount), 0) as total,
      COALESCE(SUM(CASE WHEN c.status = 'pending_approval' THEN c.commission_amount END), 0) as pending_approval,
      COALESCE(SUM(CASE WHEN c.status = 'approved' THEN c.commission_amount END), 0) as approved_pending_payout,
      COALESCE(SUM(CASE WHEN c.status = 'paid' THEN c.commission_amount END), 0) as paid,
      COALESCE(SUM(CASE WHEN c.commission_type = 'rep_own' THEN c.commission_amount END), 0) as total_own,
      COALESCE(SUM(CASE WHEN c.commission_type = 'rep_indirect' THEN c.commission_amount END), 0) as total_indirect
    FROM commissions c
    JOIN sales s ON s.id = c.sale_id
    WHERE c.beneficiary_id = ? AND c.status != 'cancelled' ${dateClause}
  `).get(representativeId, ...dateParams);

  // Financial adjustments for this rep
  const adjSummary = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_adjustments
    FROM financial_adjustments
    WHERE beneficiary_id = ?
  `).get(representativeId);

  const ownVolume = roundMoney(ownSales.volume);
  const teamVolume = roundMoney(teamSales.volume);
  const ownComm = roundMoney(commStatus.total_own);
  const indirectComm = roundMoney(commStatus.total_indirect);
  const totalComm = roundMoney(ownComm + indirectComm);

  return {
    total_own_sales_volume: ownVolume,
    own_sales_count: ownSales.count,
    own_commission: ownComm,
    total_team_sales_volume: teamVolume,
    team_sales_count: teamSales.count,
    active_sellers_count: activeSellers ? activeSellers.count : 0,
    indirect_commission: indirectComm,
    total_commission: totalComm,
    pending_approval: roundMoney(commStatus.pending_approval),
    approved_pending_payout: roundMoney(commStatus.approved_pending_payout),
    paid: roundMoney(commStatus.paid),
    financial_adjustments: roundMoney(adjSummary ? adjSummary.total_adjustments : 0)
  };
}

function getAdminDashboardMetrics(period = 'all', startDate = null, endDate = null) {
  let dateClause = '';
  const dateParams = [];
  const today = new Date().toISOString().slice(0, 10);

  if (period === 'today') {
    dateClause = ' AND s.sale_date = ?';
    dateParams.push(today);
  } else if (period === 'last_7_days') {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dateClause = ' AND s.sale_date >= ?';
    dateParams.push(d);
  } else if (period === 'current_month') {
    dateClause = ' AND s.sale_date LIKE ?';
    dateParams.push(`${today.slice(0, 7)}%`);
  } else if (period === 'previous_month') {
    const prevDate = new Date();
    prevDate.setMonth(prevDate.getMonth() - 1);
    dateClause = ' AND s.sale_date LIKE ?';
    dateParams.push(`${prevDate.toISOString().slice(0, 7)}%`);
  } else if (period === 'current_year') {
    dateClause = ' AND s.sale_date LIKE ?';
    dateParams.push(`${today.slice(0, 4)}%`);
  } else if (startDate && endDate) {
    dateClause = ' AND s.sale_date BETWEEN ? AND ?';
    dateParams.push(startDate, endDate);
  }

  // Sales totals and status
  const salesStat = db.prepare(`
    SELECT
      COUNT(*) as total_sales,
      COALESCE(SUM(total_amount), 0) as total_registered_revenue,
      COALESCE(SUM(quantity), 0) as total_plates_sold,
      COALESCE(SUM(CASE WHEN payment_status = 'confirmed' THEN total_amount END), 0) as effectively_received,
      COALESCE(SUM(CASE WHEN payment_status IN ('pending', 'installments') THEN total_amount END), 0) as waiting_payment,
      COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
      COUNT(CASE WHEN status = 'pending_approval' THEN 1 END) as pending_count,
      COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count
    FROM sales s
    WHERE 1=1 ${dateClause}
  `).get(...dateParams);

  // Users counts
  const userStat = db.prepare(`
    SELECT
      COUNT(CASE WHEN role = 'seller' THEN 1 END) as total_sellers,
      COUNT(CASE WHEN role = 'representative' THEN 1 END) as total_representatives,
      COUNT(CASE WHEN status = 'active' THEN 1 END) as active_users
    FROM users
    WHERE role != 'admin'
  `).get();

  // Commissions
  const commStat = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN c.commission_type = 'seller_direct' THEN c.commission_amount END), 0) as seller_comm_total,
      COALESCE(SUM(CASE WHEN c.commission_type IN ('rep_own', 'rep_indirect') THEN c.commission_amount END), 0) as rep_comm_total,
      COALESCE(SUM(CASE WHEN c.status = 'pending_approval' THEN c.commission_amount END), 0) as comm_pending_approval,
      COALESCE(SUM(CASE WHEN c.status = 'approved' THEN c.commission_amount END), 0) as comm_approved_to_pay,
      COALESCE(SUM(CASE WHEN c.status = 'paid' THEN c.commission_amount END), 0) as comm_paid,
      COALESCE(SUM(CASE WHEN c.status IN ('approved', 'paid') THEN c.commission_amount END), 0) as comm_total_approved
    FROM commissions c
    JOIN sales s ON s.id = c.sale_id
    WHERE c.status != 'cancelled' ${dateClause}
  `).get(...dateParams);

  const totalRev = roundMoney(salesStat.total_registered_revenue);
  const effectivelyReceived = roundMoney(salesStat.effectively_received);
  const waitingPayment = roundMoney(salesStat.waiting_payment);
  const sellerCommTotal = roundMoney(commStat.seller_comm_total);
  const repCommTotal = roundMoney(commStat.rep_comm_total);
  const commToPay = roundMoney(commStat.comm_approved_to_pay);
  const commPaid = roundMoney(commStat.comm_paid);
  const totalCommApproved = roundMoney(commStat.comm_total_approved);

  // Estimated financial balance after approved commissions
  // Prominently noted in UI as estimate: excluding product manufacturing costs, logistics, taxes.
  const estimatedBalanceAfterCommissions = roundMoney(effectivelyReceived - totalCommApproved);

  const avgTicket = salesStat.total_sales > 0 ? roundMoney(totalRev / salesStat.total_sales) : 0;

  return {
    total_registered_revenue: totalRev,
    effectively_received: effectivelyReceived,
    waiting_client_payment: waitingPayment,
    total_sales_count: salesStat.total_sales,
    total_plates_sold: salesStat.total_plates_sold,
    avg_ticket: avgTicket,
    sales_approved_count: salesStat.approved_count,
    sales_pending_count: salesStat.pending_count,
    sales_rejected_count: salesStat.rejected_count,
    sales_cancelled_count: salesStat.cancelled_count,
    total_sellers: userStat.total_sellers,
    total_representatives: userStat.total_representatives,
    active_users: userStat.active_users,
    seller_commissions_generated: sellerCommTotal,
    rep_commissions_generated: repCommTotal,
    commissions_pending_approval: roundMoney(commStat.comm_pending_approval),
    commissions_to_pay: commToPay,
    commissions_paid: commPaid,
    estimated_balance_after_commissions: estimatedBalanceAfterCommissions
  };
}

module.exports = {
  listCommissions,
  getSellerDashboardMetrics,
  getRepresentativeDashboardMetrics,
  getAdminDashboardMetrics
};
