const url = require('node:url');
const { getSessionUser } = require('./auth');
const userService = require('./services/userService');
const salesService = require('./services/salesService');
const commissionService = require('./services/commissionService');
const paymentService = require('./services/paymentService');
const reportService = require('./services/reportService');
const settingsService = require('./services/settingsService');
const notificationService = require('./services/notificationService');
const auditService = require('./services/auditService');
const auth = require('./auth');

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

async function handleApiRequest(req, res, pathname, query, body) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';

  // Extract auth token from Authorization header or Cookie
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/lidery_token=([a-f0-9]+)/);
    if (match) token = match[1];
  }

  const currentUser = getSessionUser(token);

  // Helper auth checkers
  const requireUser = () => {
    if (!currentUser) {
      sendError(res, 401, 'Sessão expirada ou não autenticada. Faça login novamente.');
      return false;
    }
    return true;
  };

  const requireRole = (allowedRoles) => {
    if (!requireUser()) return false;
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    if (!roles.includes(currentUser.role)) {
      sendError(res, 403, 'Acesso não autorizado para o seu perfil de usuário.');
      return false;
    }
    return true;
  };

  try {
    // -------------------------------------------------------------
    // AUTH ROUTES
    // -------------------------------------------------------------
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const { username, password, requestedRole } = body || {};
      if (!username || !password) {
        return sendError(res, 400, 'Informe o nome de usuário e a senha.');
      }
      const result = auth.login(username, password, requestedRole, ip, userAgent);
      if (!result.success) {
        return sendError(res, result.statusCode || 401, result.error);
      }
      // Set secure cookie
      res.setHeader('Set-Cookie', `lidery_token=${result.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      if (token) auth.destroySession(token);
      res.setHeader('Set-Cookie', 'lidery_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
      return sendJson(res, 200, { success: true });
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      if (!currentUser) return sendError(res, 401, 'Não autenticado');
      const unreadCount = notificationService.getUnreadCount(currentUser.id);
      return sendJson(res, 200, { user: currentUser, unread_notifications: unreadCount });
    }

    if (pathname === '/api/auth/change-password' && req.method === 'POST') {
      if (!requireUser()) return;
      const { currentPassword, newPassword } = body || {};
      const result = auth.changePassword(currentUser.id, currentPassword, newPassword);
      if (!result.success) return sendError(res, 400, result.error);
      return sendJson(res, 200, result);
    }

    // -------------------------------------------------------------
    // DASHBOARD METRICS
    // -------------------------------------------------------------
    if (pathname === '/api/dashboard' && req.method === 'GET') {
      if (!requireUser()) return;
      const { period, startDate, endDate } = query;

      if (currentUser.role === 'seller') {
        const metrics = commissionService.getSellerDashboardMetrics(currentUser.id, period, startDate, endDate);
        return sendJson(res, 200, { role: 'seller', metrics });
      }

      if (currentUser.role === 'representative') {
        const metrics = commissionService.getRepresentativeDashboardMetrics(currentUser.id, period, startDate, endDate);
        return sendJson(res, 200, { role: 'representative', metrics });
      }

      if (currentUser.role === 'admin') {
        const metrics = commissionService.getAdminDashboardMetrics(period, startDate, endDate);
        return sendJson(res, 200, { role: 'admin', metrics });
      }
    }

    // -------------------------------------------------------------
    // SALES ROUTES
    // -------------------------------------------------------------
    if (pathname === '/api/sales' && req.method === 'GET') {
      if (!requireUser()) return;
      const sales = salesService.listSales({
        user: currentUser,
        search: query.search,
        status: query.status,
        payment_status: query.payment_status,
        payment_method: query.payment_method,
        period: query.period,
        startDate: query.startDate,
        endDate: query.endDate,
        seller_id: query.seller_id,
        representative_id: query.representative_id
      });
      return sendJson(res, 200, { sales });
    }

    if (pathname === '/api/sales' && req.method === 'POST') {
      if (!requireUser()) return;
      const newSale = salesService.createSale(body || {}, currentUser);
      return sendJson(res, 201, { sale: newSale });
    }

    const saleIdMatch = pathname.match(/^\/api\/sales\/(\d+)$/);
    if (saleIdMatch && req.method === 'GET') {
      if (!requireUser()) return;
      const saleId = parseInt(saleIdMatch[1], 10);
      const sale = salesService.getSaleById(saleId);
      if (!sale) return sendError(res, 404, 'Venda não encontrada');

      // Check access permission
      if (currentUser.role === 'seller' && sale.seller_id !== currentUser.id) {
        return sendError(res, 403, 'Acesso não autorizado');
      }
      if (currentUser.role === 'representative' && sale.seller_id !== currentUser.id && sale.representative_id !== currentUser.id) {
        return sendError(res, 403, 'Acesso não autorizado');
      }

      return sendJson(res, 200, { sale });
    }

    const approveMatch = pathname.match(/^\/api\/sales\/(\d+)\/approve$/);
    if (approveMatch && req.method === 'POST') {
      if (!requireRole('admin')) return;
      const saleId = parseInt(approveMatch[1], 10);
      const updated = salesService.approveSale(saleId, currentUser);
      return sendJson(res, 200, { sale: updated });
    }

    const rejectMatch = pathname.match(/^\/api\/sales\/(\d+)\/reject$/);
    if (rejectMatch && req.method === 'POST') {
      if (!requireRole('admin')) return;
      const saleId = parseInt(rejectMatch[1], 10);
      const { reason } = body || {};
      const updated = salesService.rejectSale(saleId, reason, currentUser);
      return sendJson(res, 200, { sale: updated });
    }

    const cancelMatch = pathname.match(/^\/api\/sales\/(\d+)\/cancel$/);
    if (cancelMatch && req.method === 'POST') {
      if (!requireRole('admin')) return;
      const saleId = parseInt(cancelMatch[1], 10);
      const { reason } = body || {};
      const updated = salesService.cancelSale(saleId, reason, currentUser);
      return sendJson(res, 200, { sale: updated });
    }

    const paymentStatusMatch = pathname.match(/^\/api\/sales\/(\d+)\/payment-status$/);
    if (paymentStatusMatch && req.method === 'POST') {
      if (!requireRole('admin')) return;
      const saleId = parseInt(paymentStatusMatch[1], 10);
      const { payment_status } = body || {};
      const updated = salesService.updatePaymentStatus(saleId, payment_status, currentUser);
      return sendJson(res, 200, { sale: updated });
    }

    const requestCorrectionMatch = pathname.match(/^\/api\/sales\/(\d+)\/request-correction$/);
    if (requestCorrectionMatch && req.method === 'POST') {
      if (!requireUser()) return;
      const saleId = parseInt(requestCorrectionMatch[1], 10);
      const { type, reason } = body || {};
      const result = salesService.requestCorrection(saleId, type, reason, currentUser);
      return sendJson(res, 200, result);
    }

    // -------------------------------------------------------------
    // COMMISSIONS & PAYMENTS
    // -------------------------------------------------------------
    if (pathname === '/api/commissions' && req.method === 'GET') {
      if (!requireUser()) return;
      const comms = commissionService.listCommissions({
        user: currentUser,
        beneficiary_id: query.beneficiary_id,
        commission_type: query.commission_type,
        status: query.status,
        period: query.period,
        startDate: query.startDate,
        endDate: query.endDate
      });
      return sendJson(res, 200, { commissions: comms });
    }

    if (pathname === '/api/payments/eligible' && req.method === 'GET') {
      if (!requireRole('admin')) return;
      const eligible = paymentService.getEligibleCommissions(query.beneficiary_id);
      return sendJson(res, 200, { commissions: eligible });
    }

    if (pathname === '/api/payments' && req.method === 'GET') {
      if (!requireUser()) return;
      const payments = paymentService.listPayments({
        user: currentUser,
        beneficiary_id: query.beneficiary_id
      });
      return sendJson(res, 200, { payments });
    }

    if (pathname === '/api/payments' && req.method === 'POST') {
      if (!requireRole('admin')) return;
      const payment = paymentService.createPayment(body || {}, currentUser);
      return sendJson(res, 201, { payment });
    }

    const paymentIdMatch = pathname.match(/^\/api\/payments\/(\d+)$/);
    if (paymentIdMatch && req.method === 'GET') {
      if (!requireUser()) return;
      const payId = parseInt(paymentIdMatch[1], 10);
      const payment = paymentService.getPaymentById(payId);
      if (!payment) return sendError(res, 404, 'Pagamento não encontrado');
      if (currentUser.role !== 'admin' && payment.beneficiary_id !== currentUser.id) {
        return sendError(res, 403, 'Acesso não autorizado');
      }
      return sendJson(res, 200, { payment });
    }

    // -------------------------------------------------------------
    // USERS & TEAMS
    // -------------------------------------------------------------
    if (pathname === '/api/users' && req.method === 'GET') {
      if (!requireRole('admin')) return;
      const users = userService.listUsers({
        role: query.role,
        status: query.status,
        search: query.search
      });
      return sendJson(res, 200, { users });
    }

    if (pathname === '/api/users' && req.method === 'POST') {
      if (!requireRole('admin')) return;
      const user = userService.createUser(body || {}, currentUser);
      return sendJson(res, 201, { user });
    }

    const userIdMatch = pathname.match(/^\/api\/users\/(\d+)$/);
    if (userIdMatch && req.method === 'GET') {
      if (!requireRole('admin')) return;
      const u = userService.getUserById(parseInt(userIdMatch[1], 10));
      if (!u) return sendError(res, 404, 'Usuário não encontrado');
      return sendJson(res, 200, { user: u });
    }

    if (userIdMatch && req.method === 'PUT') {
      if (!requireRole('admin')) return;
      const u = userService.updateUser(parseInt(userIdMatch[1], 10), body || {}, currentUser);
      return sendJson(res, 200, { user: u });
    }

    const resetPassMatch = pathname.match(/^\/api\/users\/(\d+)\/reset-password$/);
    if (resetPassMatch && req.method === 'POST') {
      if (!requireRole('admin')) return;
      const { newPassword } = body || {};
      const resPass = userService.adminResetPassword(parseInt(resetPassMatch[1], 10), newPassword, currentUser);
      return sendJson(res, 200, resPass);
    }

    const linkRepMatch = pathname.match(/^\/api\/users\/(\d+)\/link-rep$/);
    if (linkRepMatch && req.method === 'POST') {
      if (!requireRole('admin')) return;
      const sellerId = parseInt(linkRepMatch[1], 10);
      const { representative_id, notes } = body || {};
      const updated = userService.linkSellerToRepresentative(sellerId, representative_id, notes, currentUser);
      return sendJson(res, 200, { user: updated });
    }

    const userHistoryMatch = pathname.match(/^\/api\/users\/(\d+)\/history$/);
    if (userHistoryMatch && req.method === 'GET') {
      if (!requireRole('admin')) return;
      const history = userService.getRepresentativeHistory(parseInt(userHistoryMatch[1], 10));
      return sendJson(res, 200, { history });
    }

    // Representative Team View
    if (pathname === '/api/team' && req.method === 'GET') {
      if (!requireRole(['admin', 'representative'])) return;
      const repId = currentUser.role === 'admin' ? (query.representative_id || currentUser.id) : currentUser.id;
      const team = userService.getRepresentativeTeam(repId);
      return sendJson(res, 200, { team });
    }

    // -------------------------------------------------------------
    // SETTINGS & PRODUCTS
    // -------------------------------------------------------------
    if (pathname === '/api/settings' && req.method === 'GET') {
      if (!requireUser()) return;
      const settings = settingsService.getSettings();
      const products = settingsService.listProducts();
      return sendJson(res, 200, { settings, products });
    }

    if (pathname === '/api/settings' && req.method === 'PUT') {
      if (!requireRole('admin')) return;
      const updated = settingsService.updateSettings(body || {}, currentUser);
      return sendJson(res, 200, { settings: updated });
    }

    if (pathname === '/api/products' && req.method === 'POST') {
      if (!requireRole('admin')) return;
      const prod = settingsService.createProduct(body || {}, currentUser);
      return sendJson(res, 201, { product: prod });
    }

    const prodIdMatch = pathname.match(/^\/api\/products\/(\d+)$/);
    if (prodIdMatch && req.method === 'PUT') {
      if (!requireRole('admin')) return;
      const prod = settingsService.updateProduct(parseInt(prodIdMatch[1], 10), body || {}, currentUser);
      return sendJson(res, 200, { product: prod });
    }

    // -------------------------------------------------------------
    // NOTIFICATIONS
    // -------------------------------------------------------------
    if (pathname === '/api/notifications' && req.method === 'GET') {
      if (!requireUser()) return;
      const list = notificationService.listUserNotifications(currentUser.id);
      return sendJson(res, 200, { notifications: list });
    }

    const notifReadMatch = pathname.match(/^\/api\/notifications\/(\d+)\/read$/);
    if (notifReadMatch && req.method === 'POST') {
      if (!requireUser()) return;
      notificationService.markAsRead(parseInt(notifReadMatch[1], 10), currentUser.id);
      return sendJson(res, 200, { success: true });
    }

    if (pathname === '/api/notifications/read-all' && req.method === 'POST') {
      if (!requireUser()) return;
      notificationService.markAllAsRead(currentUser.id);
      return sendJson(res, 200, { success: true });
    }

    // -------------------------------------------------------------
    // REPORTS & AUDIT
    // -------------------------------------------------------------
    if (pathname === '/api/reports/period' && req.method === 'GET') {
      if (!requireRole('admin')) return;
      const report = reportService.getSalesByPeriodReport({
        period: query.period,
        startDate: query.startDate,
        endDate: query.endDate
      });
      return sendJson(res, 200, { report });
    }

    if (pathname === '/api/reports/rankings' && req.method === 'GET') {
      if (!requireRole('admin')) return;
      const rankings = reportService.getRankingsReport({
        period: query.period,
        startDate: query.startDate,
        endDate: query.endDate
      });
      return sendJson(res, 200, rankings);
    }

    if (pathname === '/api/reports/teams' && req.method === 'GET') {
      if (!requireRole('admin')) return;
      const teams = reportService.getTeamPerformanceReport();
      return sendJson(res, 200, { teams });
    }

    if (pathname === '/api/reports/export-sales' && req.method === 'GET') {
      if (!requireRole('admin')) return;
      const sales = salesService.listSales({
        status: query.status,
        payment_status: query.payment_status,
        period: query.period,
        startDate: query.startDate,
        endDate: query.endDate,
        seller_id: query.seller_id,
        representative_id: query.representative_id,
        limit: 5000
      });
      const csv = reportService.exportSalesToCsv(sales);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="vendas-lidery-${new Date().toISOString().slice(0, 10)}.csv"`
      });
      return res.end('\uFEFF' + csv); // Byte order mark for UTF-8 Excel support
    }

    if (pathname === '/api/audit' && req.method === 'GET') {
      if (!requireRole('admin')) return;
      const logs = auditService.listLogs({
        userId: query.user_id,
        action: query.action,
        entityType: query.entity_type,
        limit: parseInt(query.limit, 10) || 100,
        offset: parseInt(query.offset, 10) || 0
      });
      return sendJson(res, 200, { logs });
    }

    // 404 for unknown api routes
    return sendError(res, 404, `Endpoint da API não encontrado: ${pathname}`);
  } catch (err) {
    console.error(`[API Error] ${req.method} ${pathname}:`, err);
    return sendError(res, 400, err.message || 'Ocorreu um erro no servidor');
  }
}

module.exports = {
  handleApiRequest
};
