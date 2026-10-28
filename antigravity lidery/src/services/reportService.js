const { db, roundMoney } = require('../db');

function getSalesByPeriodReport({ period, startDate, endDate }) {
  let dateClause = '';
  const params = [];
  const today = new Date().toISOString().slice(0, 10);

  if (period === 'today') {
    dateClause = ' AND s.sale_date = ?';
    params.push(today);
  } else if (period === 'last_7_days') {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dateClause = ' AND s.sale_date >= ?';
    params.push(d);
  } else if (period === 'current_month') {
    dateClause = ' AND s.sale_date LIKE ?';
    params.push(`${today.slice(0, 7)}%`);
  } else if (period === 'previous_month') {
    const prevDate = new Date();
    prevDate.setMonth(prevDate.getMonth() - 1);
    dateClause = ' AND s.sale_date LIKE ?';
    params.push(`${prevDate.toISOString().slice(0, 7)}%`);
  } else if (period === 'current_year') {
    dateClause = ' AND s.sale_date LIKE ?';
    params.push(`${today.slice(0, 4)}%`);
  } else if (startDate && endDate) {
    dateClause = ' AND s.sale_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  const rows = db.prepare(`
    SELECT s.sale_date,
           COUNT(*) as sales_count,
           SUM(s.quantity) as plates_count,
           SUM(s.total_amount) as total_volume,
           AVG(s.total_amount) as avg_ticket,
           SUM(s.seller_commission_amount) as seller_commissions,
           SUM(s.rep_indirect_amount + s.rep_own_amount) as rep_commissions
    FROM sales s
    WHERE s.status = 'approved' ${dateClause}
    GROUP BY s.sale_date
    ORDER BY s.sale_date DESC
  `).all(...params);

  return rows.map(r => ({
    ...r,
    total_volume: roundMoney(r.total_volume),
    avg_ticket: roundMoney(r.avg_ticket),
    seller_commissions: roundMoney(r.seller_commissions),
    rep_commissions: roundMoney(r.rep_commissions)
  }));
}

function getRankingsReport({ period, startDate, endDate }) {
  let dateClause = '';
  const params = [];
  const today = new Date().toISOString().slice(0, 10);

  if (period === 'current_month') {
    dateClause = ' AND s.sale_date LIKE ?';
    params.push(`${today.slice(0, 7)}%`);
  } else if (period === 'last_7_days') {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dateClause = ' AND s.sale_date >= ?';
    params.push(d);
  } else if (startDate && endDate) {
    dateClause = ' AND s.sale_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  // Seller ranking (direct sales)
  const sellers = db.prepare(`
    SELECT u.id, u.full_name, u.username,
           COUNT(s.id) as approved_sales_count,
           COALESCE(SUM(s.quantity), 0) as total_plates,
           COALESCE(SUM(s.total_amount), 0) as total_sold,
           COALESCE(SUM(s.seller_commission_amount), 0) as total_commission,
           r.full_name as representative_name
    FROM users u
    LEFT JOIN sales s ON s.seller_id = u.id AND s.status = 'approved' ${dateClause}
    LEFT JOIN users r ON r.id = u.representative_id
    WHERE u.role = 'seller'
    GROUP BY u.id
    ORDER BY total_sold DESC
  `).all(...params);

  // Representative ranking (own + team sales)
  const reps = db.prepare(`
    SELECT u.id, u.full_name, u.username,
           COUNT(DISTINCT CASE WHEN s.author_role = 'representative' AND s.status = 'approved' THEN s.id END) as own_sales_count,
           COALESCE(SUM(CASE WHEN s.author_role = 'representative' AND s.status = 'approved' THEN s.total_amount END), 0) as own_sales_volume,
           COALESCE(SUM(CASE WHEN s.author_role = 'representative' AND s.status = 'approved' THEN s.rep_own_amount END), 0) as own_commission,
           COUNT(DISTINCT CASE WHEN s.author_role = 'seller' AND s.representative_id = u.id AND s.status = 'approved' THEN s.id END) as team_sales_count,
           COALESCE(SUM(CASE WHEN s.author_role = 'seller' AND s.representative_id = u.id AND s.status = 'approved' THEN s.total_amount END), 0) as team_sales_volume,
           COALESCE(SUM(CASE WHEN s.author_role = 'seller' AND s.representative_id = u.id AND s.status = 'approved' THEN s.rep_indirect_amount END), 0) as indirect_commission
    FROM users u
    LEFT JOIN sales s ON (s.seller_id = u.id OR s.representative_id = u.id) ${dateClause}
    WHERE u.role = 'representative'
    GROUP BY u.id
    ORDER BY (own_sales_volume + team_sales_volume) DESC
  `).all(...params);

  return {
    sellers: sellers.map(s => ({
      ...s,
      total_sold: roundMoney(s.total_sold),
      total_commission: roundMoney(s.total_commission)
    })),
    representatives: reps.map(r => ({
      ...r,
      own_sales_volume: roundMoney(r.own_sales_volume),
      own_commission: roundMoney(r.own_commission),
      team_sales_volume: roundMoney(r.team_sales_volume),
      indirect_commission: roundMoney(r.indirect_commission),
      total_volume: roundMoney(r.own_sales_volume + r.team_sales_volume),
      total_commission: roundMoney(r.own_commission + r.indirect_commission)
    }))
  };
}

function getTeamPerformanceReport() {
  const reps = db.prepare("SELECT id, full_name, username FROM users WHERE role = 'representative' AND status = 'active'").all();
  
  return reps.map(rep => {
    const sellers = db.prepare(`
      SELECT u.id, u.full_name, u.username,
             COALESCE(COUNT(s.id), 0) as approved_sales_count,
             COALESCE(SUM(s.total_amount), 0) as total_sold,
             COALESCE(SUM(s.seller_commission_amount), 0) as seller_commission,
             COALESCE(SUM(s.rep_indirect_amount), 0) as indirect_commission
      FROM users u
      LEFT JOIN sales s ON s.seller_id = u.id AND s.status = 'approved'
      WHERE u.representative_id = ? AND u.status = 'active'
      GROUP BY u.id
      ORDER BY total_sold DESC
    `).all(rep.id);

    const teamSold = sellers.reduce((acc, curr) => acc + curr.total_sold, 0);
    const teamIndirectComm = sellers.reduce((acc, curr) => acc + curr.indirect_commission, 0);

    return {
      representative: rep,
      sellers_count: sellers.length,
      team_total_sold: roundMoney(teamSold),
      team_indirect_commission: roundMoney(teamIndirectComm),
      sellers
    };
  });
}

function exportSalesToCsv(sales) {
  const headers = [
    'Codigo', 'Data', 'Cliente', 'Telefone', 'Cidade_UF',
    'Vendedor', 'Representante', 'Qtd_Plaquinhas', 'Valor_Unitario', 'Valor_Total',
    'Forma_Pagamento', 'Status_Pagamento', 'Status_Venda',
    'Comissao_Vendedor', 'Comissao_Representante'
  ];

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = sales.map(s => [
    escapeCsv(s.sale_code),
    escapeCsv(s.sale_date),
    escapeCsv(s.client_name),
    escapeCsv(s.client_phone),
    escapeCsv(`${s.client_city || ''}/${s.client_state || ''}`),
    escapeCsv(s.seller_name),
    escapeCsv(s.representative_name || 'Nenhum'),
    s.quantity,
    s.unit_price.toFixed(2),
    s.total_amount.toFixed(2),
    escapeCsv(s.payment_method),
    escapeCsv(s.payment_status),
    escapeCsv(s.status),
    s.seller_commission_amount.toFixed(2),
    (s.rep_indirect_amount + s.rep_own_amount).toFixed(2)
  ].join(';'));

  return [headers.join(';'), ...rows].join('\r\n');
}

module.exports = {
  getSalesByPeriodReport,
  getRankingsReport,
  getTeamPerformanceReport,
  exportSalesToCsv
};
