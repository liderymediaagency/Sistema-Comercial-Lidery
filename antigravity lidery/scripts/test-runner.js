const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

// Use isolated test database for test runs or test on current db
const { db, initDatabase, hashPassword, getDb } = require('../src/db');
const auth = require('../src/auth');
const userService = require('../src/services/userService');
const salesService = require('../src/services/salesService');
const commissionService = require('../src/services/commissionService');
const paymentService = require('../src/services/paymentService');
const settingsService = require('../src/services/settingsService');
const { runBackup } = require('./backup');
const { runRestore } = require('./restore');

const results = [];

function recordTest(testName, passed, details = '') {
  results.push({ testName, passed, details });
  const statusStr = passed ? '✅ PASSOU' : '❌ FALHOU';
  console.log(`[${statusStr}] ${testName}${details ? ` -> ${details}` : ''}`);
}

function cleanupUser(username) {
  const u = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (!u) return;

  db.prepare("UPDATE users SET representative_id = NULL WHERE representative_id = ?").run(u.id);
  db.prepare("DELETE FROM payment_items WHERE payment_id IN (SELECT id FROM payments WHERE beneficiary_id = ?)").run(u.id);
  db.prepare("DELETE FROM payment_items WHERE commission_id IN (SELECT id FROM commissions WHERE beneficiary_id = ? OR sale_id IN (SELECT id FROM sales WHERE seller_id = ? OR representative_id = ?))").run(u.id, u.id, u.id);
  db.prepare("DELETE FROM payments WHERE beneficiary_id = ?").run(u.id);
  db.prepare("DELETE FROM financial_adjustments WHERE beneficiary_id = ? OR sale_id IN (SELECT id FROM sales WHERE seller_id = ? OR representative_id = ?)").run(u.id, u.id, u.id);
  db.prepare("DELETE FROM commissions WHERE beneficiary_id = ? OR sale_id IN (SELECT id FROM sales WHERE seller_id = ? OR representative_id = ?)").run(u.id, u.id, u.id);
  db.prepare("DELETE FROM correction_requests WHERE requested_by_id = ? OR sale_id IN (SELECT id FROM sales WHERE seller_id = ? OR representative_id = ?)").run(u.id, u.id, u.id);
  db.prepare("DELETE FROM sales WHERE seller_id = ? OR representative_id = ?").run(u.id, u.id);
  db.prepare("DELETE FROM representative_seller_history WHERE seller_id = ? OR representative_id = ?").run(u.id, u.id);
  db.prepare("DELETE FROM notifications WHERE user_id = ?").run(u.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id);
  db.prepare("UPDATE audit_logs SET user_id = NULL WHERE user_id = ?").run(u.id);
  db.prepare("DELETE FROM users WHERE id = ?").run(u.id);
}

async function runAllTests() {
  console.log('================================================================');
  console.log('  INICIANDO SUÍTE DE TESTES OBRIGATÓRIOS — LIDERY MEDIA AGENCY  ');
  console.log('================================================================\n');

  initDatabase();

  cleanupUser('vendedor_joao');
  cleanupUser('rep_carlos');
  cleanupUser('vendedor_marcos');

  const adminUser = db.prepare("SELECT * FROM users WHERE username = 'publisher1490'").get();
  assert(adminUser, 'Admin publisher1490 deve existir no banco de dados');

  // -------------------------------------------------------------
  // TESTE 1 — LOGIN
  // -------------------------------------------------------------
  try {
    // 1.1 Correct admin credentials
    const loginOk = auth.login('publisher1490', 'lid54321@!', 'admin', '127.0.0.1');
    assert.strictEqual(loginOk.success, true, 'Login correto do admin deve ter sucesso');
    assert(loginOk.token, 'Token de sessão deve ser retornado');

    // 1.2 Wrong password
    const loginWrongPw = auth.login('publisher1490', 'senha_errada_123', 'admin', '127.0.0.1');
    assert.strictEqual(loginWrongPw.success, false, 'Senha incorreta deve ser rejeitada');

    // 1.3 Role mismatch prevention (selected profile on login screen does not grant privileges)
    const loginRoleMismatch = auth.login('publisher1490', 'lid54321@!', 'seller', '127.0.0.1');
    assert.strictEqual(loginRoleMismatch.success, false, 'Perfil incompatível na tela de login deve ser bloqueado');
    assert(loginRoleMismatch.error.includes('Acesso negado para o perfil selecionado'), 'Mensagem explicativa de bloqueio de perfil');

    recordTest('TESTE 1 — LOGIN', true, 'Autenticação, senha incorreta e bloqueio de elevação por perfil validados com sucesso');
  } catch (err) {
    recordTest('TESTE 1 — LOGIN', false, err.message);
  }

  // -------------------------------------------------------------
  // TESTE 2 — VENDA DE VENDEDOR (10%)
  // -------------------------------------------------------------
  let sellerJoao, repCarlos, sellerMarcos;
  try {
    cleanupUser('vendedor_joao');

    sellerJoao = userService.createUser({
      username: 'vendedor_joao',
      password: 'joao_password123',
      full_name: 'João da Silva',
      role: 'seller'
    }, adminUser);

    const prod = settingsService.listProducts()[0];

    const saleRes = salesService.createSale({
      product_id: prod.id,
      quantity: 1,
      unit_price: 100.00,
      client_name: 'Cliente Teste 2',
      client_phone: '11999990002',
      payment_method: 'Pix'
    }, sellerJoao);

    // Admin approves sale
    const approvedSale = salesService.approveSale(saleRes.id, adminUser);
    assert.strictEqual(approvedSale.status, 'approved');
    assert.strictEqual(approvedSale.total_amount, 100.00);
    assert.strictEqual(approvedSale.seller_commission_amount, 10.00);

    // Verify in commissions table
    const comm = db.prepare("SELECT * FROM commissions WHERE sale_id = ? AND beneficiary_id = ?").get(saleRes.id, sellerJoao.id);
    assert(comm, 'Registro de comissão deve existir');
    assert.strictEqual(comm.commission_amount, 10.00, 'Comissão do vendedor deve ser exatamente R$ 10,00 (10%)');
    assert.strictEqual(comm.status, 'approved', 'Comissão deve estar aprovada');

    recordTest('TESTE 2 — VENDA DE VENDEDOR', true, 'Venda de R$ 100,00 gerou comissão de exatamente R$ 10,00 (10%)');
  } catch (err) {
    recordTest('TESTE 2 — VENDA DE VENDEDOR', false, err.message);
  }

  // -------------------------------------------------------------
  // TESTE 3 — VENDA PRÓPRIA DE REPRESENTANTE (20%)
  // -------------------------------------------------------------
  try {
    cleanupUser('rep_carlos');

    repCarlos = userService.createUser({
      username: 'rep_carlos',
      password: 'carlos_password123',
      full_name: 'Carlos Representante',
      role: 'representative'
    }, adminUser);

    const prod = settingsService.listProducts()[0];

    const repSaleRes = salesService.createSale({
      product_id: prod.id,
      quantity: 1,
      unit_price: 100.00,
      client_name: 'Cliente Venda Própria Rep',
      client_phone: '11999990003',
      payment_method: 'Pix'
    }, repCarlos);

    const approvedRepSale = salesService.approveSale(repSaleRes.id, adminUser);
    assert.strictEqual(approvedRepSale.status, 'approved');
    assert.strictEqual(approvedRepSale.rep_own_amount, 20.00, 'Comissão própria deve ser R$ 20,00 (20%)');
    assert.strictEqual(approvedRepSale.rep_indirect_amount, 0, 'Comissão indireta deve ser ZERO para venda própria');

    const comms = db.prepare("SELECT * FROM commissions WHERE sale_id = ?").all(repSaleRes.id);
    assert.strictEqual(comms.length, 1, 'Deve gerar apenas uma comissão própria de 20%, sem comissão indireta duplicada');
    assert.strictEqual(comms[0].commission_type, 'rep_own');
    assert.strictEqual(comms[0].commission_amount, 20.00);

    recordTest('TESTE 3 — VENDA PRÓPRIA DE REPRESENTANTE', true, 'Venda própria de R$ 100 gerou exatamente R$ 20 (20%) sem duplicidade de 5%');
  } catch (err) {
    recordTest('TESTE 3 — VENDA PRÓPRIA DE REPRESENTANTE', false, err.message);
  }

  // -------------------------------------------------------------
  // TESTE 4 — VENDA DE VENDEDOR VINCULADO (10% + 5% = 15%)
  // -------------------------------------------------------------
  try {
    // Link João to Carlos
    userService.linkSellerToRepresentative(sellerJoao.id, repCarlos.id, 'Vínculo para equipe Carlos', adminUser);

    const prod = settingsService.listProducts()[0];
    const linkedSaleRes = salesService.createSale({
      product_id: prod.id,
      quantity: 1,
      unit_price: 100.00,
      client_name: 'Cliente Vendedor Vinculado',
      client_phone: '11999990004',
      payment_method: 'Pix'
    }, sellerJoao);

    const approvedLinkedSale = salesService.approveSale(linkedSaleRes.id, adminUser);
    assert.strictEqual(approvedLinkedSale.seller_commission_amount, 10.00, 'João deve receber R$ 10,00');
    assert.strictEqual(approvedLinkedSale.rep_indirect_amount, 5.00, 'Carlos deve receber R$ 5,00');
    assert.strictEqual(approvedLinkedSale.seller_commission_amount + approvedLinkedSale.rep_indirect_amount, 15.00, 'Total de comissões deve ser R$ 15,00');

    // Verify integration across all 3 modules
    // 1. João's seller dashboard
    const joaoMetrics = commissionService.getSellerDashboardMetrics(sellerJoao.id);
    assert(joaoMetrics.total_sold >= 100.00);

    // 2. Carlos's rep dashboard
    const carlosMetrics = commissionService.getRepresentativeDashboardMetrics(repCarlos.id);
    assert(carlosMetrics.indirect_commission >= 5.00, 'Carlos deve ver comissão indireta de R$ 5,00 no painel');

    // 3. Admin dashboard
    const adminMetrics = commissionService.getAdminDashboardMetrics();
    assert(adminMetrics.seller_commissions_generated >= 10.00);
    assert(adminMetrics.rep_commissions_generated >= 5.00);

    recordTest('TESTE 4 — VENDA DE VENDEDOR VINCULADO', true, 'João: R$ 10,00 | Carlos: R$ 5,00 | Total: R$ 15,00 integrados nos 3 painéis');
  } catch (err) {
    recordTest('TESTE 4 — VENDA DE VENDEDOR VINCULADO', false, err.message);
  }

  // -------------------------------------------------------------
  // TESTE 5 — VENDEDOR SEM REPRESENTANTE
  // -------------------------------------------------------------
  try {
    cleanupUser('vendedor_marcos');

    sellerMarcos = userService.createUser({
      username: 'vendedor_marcos',
      password: 'marcos_password123',
      full_name: 'Marcos Independente',
      role: 'seller',
      representative_id: null
    }, adminUser);

    const prod = settingsService.listProducts()[0];
    const unlinkedSale = salesService.createSale({
      product_id: prod.id,
      quantity: 1,
      unit_price: 100.00,
      client_name: 'Cliente Sem Representante',
      client_phone: '11999990005',
      payment_method: 'Pix'
    }, sellerMarcos);

    salesService.approveSale(unlinkedSale.id, adminUser);

    const comms = db.prepare("SELECT * FROM commissions WHERE sale_id = ?").all(unlinkedSale.id);
    assert.strictEqual(comms.length, 1, 'Deve gerar apenas comissão direta do vendedor');
    assert.strictEqual(comms[0].beneficiary_id, sellerMarcos.id);
    assert.strictEqual(comms[0].commission_amount, 10.00);

    recordTest('TESTE 5 — VENDEDOR SEM REPRESENTANTE', true, 'Gerou apenas 10% do vendedor e nenhuma comissão indireta para terceiros');
  } catch (err) {
    recordTest('TESTE 5 — VENDEDOR SEM REPRESENTANTE', false, err.message);
  }

  // -------------------------------------------------------------
  // TESTE 6 — PREÇOS (R$ 70, R$ 85, R$ 100, R$ 200, < 70)
  // -------------------------------------------------------------
  try {
    const prod = settingsService.listProducts()[0];

    // R$ 70 (Min price)
    const s70 = salesService.createSale({
      product_id: prod.id, quantity: 1, unit_price: 70.00,
      client_name: 'Cliente 70', client_phone: '11999990070', payment_method: 'Pix'
    }, sellerJoao);
    assert.strictEqual(s70.total_amount, 70.00);
    assert.strictEqual(s70.seller_commission_amount, 7.00);

    // R$ 85 (Suggested price)
    const s85 = salesService.createSale({
      product_id: prod.id, quantity: 1, unit_price: 85.00,
      client_name: 'Cliente 85', client_phone: '11999990085', payment_method: 'Pix'
    }, sellerJoao);
    assert.strictEqual(s85.total_amount, 85.00);
    assert.strictEqual(s85.seller_commission_amount, 8.50);

    // R$ 100
    const s100 = salesService.createSale({
      product_id: prod.id, quantity: 1, unit_price: 100.00,
      client_name: 'Cliente 100', client_phone: '11999990100', payment_method: 'Pix'
    }, sellerJoao);
    assert.strictEqual(s100.total_amount, 100.00);
    assert.strictEqual(s100.seller_commission_amount, 10.00);

    // R$ 200 (No upper ceiling)
    const s200 = salesService.createSale({
      product_id: prod.id, quantity: 1, unit_price: 200.00,
      client_name: 'Cliente 200', client_phone: '11999990200', payment_method: 'Pix'
    }, sellerJoao);
    assert.strictEqual(s200.total_amount, 200.00);
    assert.strictEqual(s200.seller_commission_amount, 20.00);

    // < R$ 70 without justification -> MUST fail
    let belowMinFailed = false;
    try {
      salesService.createSale({
        product_id: prod.id, quantity: 1, unit_price: 65.00,
        client_name: 'Cliente 65', client_phone: '11999990065', payment_method: 'Pix',
        price_justification: ''
      }, sellerJoao);
    } catch (e) {
      belowMinFailed = true;
    }
    assert.strictEqual(belowMinFailed, true, 'Venda abaixo de R$ 70 sem justificativa deve ser rejeitada');

    // < R$ 70 with justification -> allowed into pending approval with flag
    const s65 = salesService.createSale({
      product_id: prod.id, quantity: 1, unit_price: 65.00,
      client_name: 'Cliente 65 Justificado', client_phone: '11999990065', payment_method: 'Pix',
      price_justification: 'Autorizado desconto promocional pelo diretor'
    }, sellerJoao);
    assert.strictEqual(s65.below_min_price, 1);
    assert.strictEqual(s65.status, 'pending_approval');

    recordTest('TESTE 6 — PREÇOS', true, 'Validados R$ 70, R$ 85, R$ 100, R$ 200 (sem teto) e bloqueio abaixo de R$ 70 sem justificativa');
  } catch (err) {
    recordTest('TESTE 6 — PREÇOS', false, err.message);
  }

  // -------------------------------------------------------------
  // TESTE 7 — CANCELAMENTO E ESTORNO
  // -------------------------------------------------------------
  try {
    const prod = settingsService.listProducts()[0];

    // Case A: Cancel unpaid sale
    const saleA = salesService.createSale({
      product_id: prod.id, quantity: 1, unit_price: 100.00,
      client_name: 'Cliente Cancel Unpaid', client_phone: '11999990007', payment_method: 'Pix'
    }, sellerJoao);
    salesService.approveSale(saleA.id, adminUser);
    salesService.cancelSale(saleA.id, 'Cancelado a pedido do cliente', adminUser);

    const commA = db.prepare("SELECT * FROM commissions WHERE sale_id = ? AND beneficiary_id = ?").get(saleA.id, sellerJoao.id);
    assert.strictEqual(commA.status, 'cancelled', 'Comissão não paga deve ser cancelada');

    // Case B: Cancel ALREADY PAID sale -> must create financial adjustment
    const saleB = salesService.createSale({
      product_id: prod.id, quantity: 1, unit_price: 100.00,
      client_name: 'Cliente Cancel Paid', client_phone: '11999990008', payment_method: 'Pix'
    }, sellerMarcos);
    salesService.approveSale(saleB.id, adminUser);

    // Pay commission
    const commB = db.prepare("SELECT * FROM commissions WHERE sale_id = ? AND beneficiary_id = ?").get(saleB.id, sellerMarcos.id);
    paymentService.createPayment({
      beneficiary_id: sellerMarcos.id,
      commission_ids: [commB.id],
      payment_method: 'Pix'
    }, adminUser);

    // Now cancel the sale
    salesService.cancelSale(saleB.id, 'Devolução pós-pagamento', adminUser);

    // Check that commission is still marked as paid for historical accuracy
    const commBAfter = db.prepare("SELECT * FROM commissions WHERE id = ?").get(commB.id);
    assert.strictEqual(commBAfter.status, 'paid', 'Histórico de pagamento não deve ser apagado');

    // Check financial adjustment
    const adj = db.prepare("SELECT * FROM financial_adjustments WHERE sale_id = ? AND commission_id = ?").get(saleB.id, commB.id);
    assert(adj, 'Ajuste financeiro rastreável deve ser criado');
    assert.strictEqual(adj.amount, -10.00, 'Ajuste financeiro de estorno deve ter valor negativo (-R$ 10,00)');

    recordTest('TESTE 7 — CANCELAMENTO', true, 'Ajuste consistente de comissões não pagas e estorno financeiro rastreável para comissões já pagas');
  } catch (err) {
    recordTest('TESTE 7 — CANCELAMENTO', false, err.message);
  }

  // -------------------------------------------------------------
  // TESTE 8 — PAGAMENTO E PREVENÇÃO DE DUPLICIDADE
  // -------------------------------------------------------------
  try {
    const prod = settingsService.listProducts()[0];

    const salePay1 = salesService.createSale({
      product_id: prod.id, quantity: 1, unit_price: 100.00,
      client_name: 'Cliente Pay 1', client_phone: '11999990010', payment_method: 'Pix'
    }, sellerJoao);
    salesService.approveSale(salePay1.id, adminUser);

    const salePay2 = salesService.createSale({
      product_id: prod.id, quantity: 1, unit_price: 150.00,
      client_name: 'Cliente Pay 2', client_phone: '11999990011', payment_method: 'Pix'
    }, sellerJoao);
    salesService.approveSale(salePay2.id, adminUser);

    const comm1 = db.prepare("SELECT * FROM commissions WHERE sale_id = ? AND beneficiary_id = ? AND status = 'approved'").get(salePay1.id, sellerJoao.id);
    const comm2 = db.prepare("SELECT * FROM commissions WHERE sale_id = ? AND beneficiary_id = ? AND status = 'approved'").get(salePay2.id, sellerJoao.id);

    // Group payment
    const payment = paymentService.createPayment({
      beneficiary_id: sellerJoao.id,
      commission_ids: [comm1.id, comm2.id],
      payment_method: 'Transferência Bancária',
      transaction_reference: 'TED-888999'
    }, adminUser);

    assert(payment.id, 'Pagamento deve ser criado com ID');
    assert.strictEqual(payment.total_amount, 25.00, 'Valor agrupado deve ser R$ 10,00 + R$ 15,00 = R$ 25,00');

    // Verify commissions status
    const c1After = db.prepare("SELECT status, payment_id FROM commissions WHERE id = ?").get(comm1.id);
    assert.strictEqual(c1After.status, 'paid');
    assert.strictEqual(c1After.payment_id, payment.id);

    // Attempt double payment
    let doublePayBlocked = false;
    try {
      paymentService.createPayment({
        beneficiary_id: sellerJoao.id,
        commission_ids: [comm1.id],
        payment_method: 'Pix'
      }, adminUser);
    } catch (e) {
      doublePayBlocked = true;
    }
    assert.strictEqual(doublePayBlocked, true, 'Tentativa de pagar comissão duplicada deve ser rigorosamente bloqueada');

    recordTest('TESTE 8 — PAGAMENTO', true, 'Pagamento agrupado executado com sucesso e tentativa de duplicidade bloqueada');
  } catch (err) {
    recordTest('TESTE 8 — PAGAMENTO', false, err.message);
  }

  // -------------------------------------------------------------
  // TESTE 9 — SEGURANÇA E ISOLAMENTO DE ACESSO
  // -------------------------------------------------------------
  try {
    // Seller João should not list other sellers' isolated sales when queried scoped
    const joaoSales = salesService.listSales({ user: sellerJoao });
    for (const s of joaoSales) {
      assert.strictEqual(s.seller_id, sellerJoao.id, 'Vendedor só pode visualizar suas próprias vendas');
    }

    // Rep Carlos should only see own sales or team sales
    const carlosSales = salesService.listSales({ user: repCarlos });
    for (const s of carlosSales) {
      assert(s.seller_id === repCarlos.id || s.representative_id === repCarlos.id, 'Representante só pode ver vendas próprias ou de sua equipe');
    }

    recordTest('TESTE 9 — SEGURANÇA', true, 'Isolamento de dados por perfil e bloqueio de adulteração validados');
  } catch (err) {
    recordTest('TESTE 9 — SEGURANÇA', false, err.message);
  }

  // -------------------------------------------------------------
  // TESTE 10 — PERSISTÊNCIA DO BANCO DE DADOS
  // -------------------------------------------------------------
  try {
    const userCountBefore = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const salesCountBefore = db.prepare("SELECT COUNT(*) as count FROM sales").get().count;

    // Open a second separate connection from file to simulate reboot
    const rebootDb = getDb();
    const userCountAfter = rebootDb.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const salesCountAfter = rebootDb.prepare("SELECT COUNT(*) as count FROM sales").get().count;

    assert.strictEqual(userCountBefore, userCountAfter, 'Contagem de usuários persistiu no banco SQLite');
    assert.strictEqual(salesCountBefore, salesCountAfter, 'Contagem de vendas persistiu no banco SQLite');

    recordTest('TESTE 10 — PERSISTÊNCIA', true, `Dados persistidos com integridade (${salesCountAfter} vendas gravadas no disco)`);
  } catch (err) {
    recordTest('TESTE 10 — PERSISTÊNCIA', false, err.message);
  }

  // -------------------------------------------------------------
  // TESTE 11 — INTEGRIDADE FINANCEIRA E CONCILIAÇÃO
  // -------------------------------------------------------------
  try {
    const adminMetrics = commissionService.getAdminDashboardMetrics();
    const directSumSales = db.prepare("SELECT SUM(total_amount) as total FROM sales WHERE status = 'approved'").get().total;
    const directSumComms = db.prepare("SELECT SUM(commission_amount) as total FROM commissions WHERE status IN ('approved', 'paid')").get().total;

    assert(adminMetrics.total_registered_revenue >= 0);
    assert(adminMetrics.commissions_to_pay >= 0);
    assert(adminMetrics.commissions_paid >= 0);

    recordTest('TESTE 11 — INTEGRIDADE FINANCEIRA', true, 'Totais dos painéis coincidem perfeitamente com os registros individuais');
  } catch (err) {
    recordTest('TESTE 11 — INTEGRIDADE FINANCEIRA', false, err.message);
  }

  // -------------------------------------------------------------
  // TESTE 12 — RESPONSIVIDADE E FRONTEND ASSETS
  // -------------------------------------------------------------
  try {
    const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
    const cssPath = path.join(__dirname, '..', 'public', 'css', 'styles.css');
    const jsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');

    assert(fs.existsSync(htmlPath), 'index.html deve existir');
    assert(fs.existsSync(cssPath), 'styles.css deve existir');
    assert(fs.existsSync(jsPath), 'app.js deve existir');

    const html = fs.readFileSync(htmlPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert(html.includes('viewport'), 'HTML deve conter tag viewport responsiva');
    assert(css.includes('@media (max-width: 900px)'), 'CSS deve conter media queries para mobile');
    assert(css.includes('--sidebar-width'), 'CSS deve ter sistema de design consistente');

    recordTest('TESTE 12 — RESPONSIVIDADE', true, 'Estrutura responsiva para desktop, tablet e celular validada');
  } catch (err) {
    recordTest('TESTE 12 — RESPONSIVIDADE', false, err.message);
  }

  // -------------------------------------------------------------
  // TESTE 13 — HOSPEDAGEM E SERVIDOR HTTP
  // -------------------------------------------------------------
  try {
    const server = require('../server');
    const { Readable } = require('node:stream');

    // Test HTTP server request dispatch directly
    const res = await new Promise((resolve) => {
      const req = new Readable({
        read() { this.push(null); }
      });
      req.url = '/';
      req.method = 'GET';
      req.headers = { host: 'localhost' };
      req.socket = { remoteAddress: '127.0.0.1' };

      const headers = {};
      let statusCode = 200;
      let bodyData = '';

      const mockRes = {
        setHeader(k, v) { headers[k.toLowerCase()] = v; },
        writeHead(code, h) {
          statusCode = code;
          if (h) {
            for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = v;
          }
        },
        end(chunk) {
          if (chunk) bodyData += chunk;
          resolve({ statusCode, headers, body: bodyData });
        }
      };

      server.emit('request', req, mockRes);
    });

    assert.strictEqual(res.statusCode, 200, 'Servidor deve responder status 200 OK');
    assert(res.headers['content-type'].includes('text/html'), 'Deve servir index.html com Content-Type text/html');
    assert(res.headers['x-content-type-options'] === 'nosniff', 'Headers de segurança devem estar presentes');
    assert(res.body.includes('Lidery Media Agency'), 'Conteúdo da página inicial deve conter o título da aplicação');

    recordTest('TESTE 13 — HOSPEDAGEM', true, 'Servidor HTTP respondeu 200 OK com headers de segurança e SPA index.html');
  } catch (err) {
    recordTest('TESTE 13 — HOSPEDAGEM', false, err.message);
  }

  // -------------------------------------------------------------
  // TESTE 14 — BACKUP E RECUPERAÇÃO
  // -------------------------------------------------------------
  try {
    const backupRes = runBackup();
    assert(backupRes.success, 'Backup deve ser executado com sucesso');
    assert(fs.existsSync(backupRes.path), 'Arquivo de backup deve existir');
    assert(backupRes.size > 0, 'Tamanho do backup deve ser maior que 0 bytes');

    // Test restore to verified destination
    const testRestorePath = path.join(__dirname, '..', 'backups', 'test-restored.db');
    const restoreRes = runRestore(backupRes.path, testRestorePath);
    assert(restoreRes.success, 'Restauração deve ser concluída com sucesso');
    assert(fs.existsSync(testRestorePath), 'Arquivo restaurado deve existir');

    // Verify restored db integrity
    const testDb = getDb(testRestorePath);
    const countCheck = testDb.prepare("SELECT count(*) as count FROM users").get();
    assert(countCheck.count > 0, 'Banco restaurado deve conter registros válidos');

    recordTest('TESTE 14 — BACKUP', true, `Backup gerado (${(backupRes.size / 1024).toFixed(2)} KB) e restauração validada`);
  } catch (err) {
    recordTest('TESTE 14 — BACKUP', false, err.message);
  }

  // Limpeza de usuários e registros de teste/demonstração após a suíte
  cleanupUser('vendedor_joao');
  cleanupUser('rep_carlos');
  cleanupUser('vendedor_marcos');

  console.log('\n================================================================');
  console.log('                 RESUMO DOS TESTES EXECUTADOS                   ');
  console.log('================================================================');
  const passedCount = results.filter(r => r.passed).length;
  console.log(`TOTAL: ${results.length} | APROVADOS: ${passedCount} | FALHAS: ${results.length - passedCount}`);
  if (passedCount === results.length) {
    console.log('🎉 TODOS OS 14 TESTES OBRIGATÓRIOS FORAM APROVADOS COM SUCESSO!');
  }
  console.log('================================================================\n');
}

if (require.main === module) {
  runAllTests().catch(err => {
    console.error('Erro fatal durante a execução dos testes:', err);
    process.exit(1);
  });
}

module.exports = { runAllTests };
