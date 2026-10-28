// Lidery Media Agency - Main Application Frontend
let state = {
  currentUser: null,
  currentRoute: 'dashboard',
  selectedPeriod: 'all',
  customStartDate: '',
  customEndDate: '',
  unreadNotifications: 0,
  refreshInterval: null,
  cachedSettings: null,
  cachedProducts: []
};

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'danger') icon = '⚠️';
  if (type === 'warning') icon = '⚡';

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

// Modal helper
function openModal(title, bodyHtml, footerHtml = '', onMount = null) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-overlay open" id="app-modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          ${bodyHtml}
        </div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    </div>
  `;
  if (onMount) onMount();
}

function closeModal() {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
}

// Application Initialization
async function initApp() {
  const token = API.getToken();
  if (token) {
    try {
      const data = await API.get('/api/auth/me');
      state.currentUser = data.user;
      state.unreadNotifications = data.unread_notifications || 0;
      startAutoRefresh();
      renderApp();
      return;
    } catch (e) {
      API.setToken(null);
    }
  }
  renderLoginView();
}

// Auto refresh polling every 8 seconds
function startAutoRefresh() {
  if (state.refreshInterval) clearInterval(state.refreshInterval);
  state.refreshInterval = setInterval(async () => {
    if (!state.currentUser) return;
    try {
      const meData = await API.get('/api/auth/me');
      state.unreadNotifications = meData.unread_notifications || 0;
      updateHeaderBadges();
      // Silently refresh current view data if on dashboard or tables
      if (['dashboard', 'sales', 'commissions', 'team'].includes(state.currentRoute)) {
        refreshCurrentViewData();
      }
    } catch (e) {}
  }, 8000);
}

window.addEventListener('auth:expired', () => {
  state.currentUser = null;
  if (state.refreshInterval) clearInterval(state.refreshInterval);
  renderLoginView();
  showToast('Sessão expirada. Por favor faça login novamente.', 'warning');
});

// =========================================================================
// LOGIN VIEW
// =========================================================================
function renderLoginView() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at top, #161a24, #090a0f); padding: 20px;">
      <div style="width: 100%; max-width: 440px; background: #11131a; border: 1px solid #212631; border-radius: 16px; padding: 36px 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7);">
        
        <div style="text-align: center; margin-bottom: 26px;">
          <img src="/images/logo-dark.png" alt="Lidery Media Agency" style="max-width: 260px; width: 100%; height: auto; margin-bottom: 6px; filter: drop-shadow(0 4px 14px rgba(255,255,255,0.08));">
          <p style="font-size: 12.5px; color: #9ca3af; letter-spacing: 0.5px;">Plaquinhas NFC Google & Gestão Comercial</p>
        </div>

        <div id="login-alert" style="display: none; padding: 12px 14px; border-radius: 8px; margin-bottom: 20px; font-size: 13px;"></div>

        <form id="login-form">
          <div class="form-group">
            <label class="form-label">Perfil de Acesso</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 16px;">
              <button type="button" class="role-selector-btn active" data-role="seller" style="padding: 10px 6px; font-size: 12px; border-radius: 8px; border: 1px solid #374151; background: #ffffff; color: #000000; font-weight: 600; cursor: pointer;">
                Vendedor
              </button>
              <button type="button" class="role-selector-btn" data-role="representative" style="padding: 10px 6px; font-size: 12px; border-radius: 8px; border: 1px solid #374151; background: #1f242f; color: #d1d5db; font-weight: 500; cursor: pointer;">
                Representante
              </button>
              <button type="button" class="role-selector-btn" data-role="admin" style="padding: 10px 6px; font-size: 12px; border-radius: 8px; border: 1px solid #374151; background: #1f242f; color: #d1d5db; font-weight: 500; cursor: pointer;">
                Administrador
              </button>
            </div>
            <p style="font-size: 11px; color: #6b7280; margin-top: -6px;">* A seleção de perfil na tela inicial é validada rigorosamente pelo backend junto com suas credenciais.</p>
          </div>

          <div class="form-group">
            <label class="form-label" for="login-username">Nome de Usuário</label>
            <input type="text" id="login-username" class="form-control" placeholder="Informe seu usuário" required autocomplete="username">
          </div>

          <div class="form-group" style="margin-bottom: 24px;">
            <label class="form-label" for="login-password">Senha</label>
            <input type="password" id="login-password" class="form-control" placeholder="••••••••" required autocomplete="current-password">
          </div>

          <button type="submit" id="login-submit-btn" class="btn btn-primary" style="width: 100%; padding: 12px; font-weight: 600; font-size: 14px;">
            Entrar no Sistema
          </button>
        </form>

        <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid #212631; text-align: center;">
          <p style="font-size: 12px; color: #6b7280;">Acesso restrito e criptografado com auditoria permanente.</p>
        </div>
      </div>
    </div>
  `;

  let selectedRole = 'seller';
  const roleButtons = document.querySelectorAll('.role-selector-btn');
  roleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      roleButtons.forEach(b => {
        b.classList.remove('active');
        b.style.background = '#1f242f';
        b.style.color = '#d1d5db';
        b.style.fontWeight = '500';
      });
      btn.classList.add('active');
      btn.style.background = '#ffffff';
      btn.style.color = '#000000';
      btn.style.fontWeight = '600';
      selectedRole = btn.dataset.role;
    });
  });

  const form = document.getElementById('login-form');
  const alertBox = document.getElementById('login-alert');
  const submitBtn = document.getElementById('login-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.innerText = 'Autenticando...';

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      const res = await API.post('/api/auth/login', {
        username,
        password,
        requestedRole: selectedRole
      });

      API.setToken(res.token);
      state.currentUser = res.user;
      startAutoRefresh();
      renderApp();
      showToast(`Bem-vindo(a), ${res.user.full_name}!`, 'success');
    } catch (err) {
      alertBox.style.display = 'block';
      alertBox.className = 'badge-danger';
      alertBox.style.color = '#f87171';
      alertBox.style.border = '1px solid #ef4444';
      alertBox.style.background = 'rgba(239, 68, 68, 0.1)';
      alertBox.innerText = err.message || 'Falha na autenticação';
      submitBtn.disabled = false;
      submitBtn.innerText = 'Entrar no Sistema';
    }
  });
}

// First login mandatory password change
function showFirstLoginPasswordModal() {
  openModal(
    'Primeiro Acesso — Troca Obrigatória de Senha',
    `
      <p style="font-size: 13.5px; color: #d1d5db; margin-bottom: 16px;">
        Por motivos de segurança, você deve definir uma nova senha para sua conta antes de continuar.
      </p>
      <div id="first-pw-alert" style="display: none; padding: 10px; margin-bottom: 14px; border-radius: 6px; font-size: 12.5px;"></div>
      <div class="form-group">
        <label class="form-label">Senha Atual</label>
        <input type="password" id="first-curr-pw" class="form-control" placeholder="Informe a senha fornecida">
      </div>
      <div class="form-group">
        <label class="form-label">Nova Senha (mínimo 6 caracteres)</label>
        <input type="password" id="first-new-pw" class="form-control" placeholder="Defina sua nova senha">
      </div>
      <div class="form-group">
        <label class="form-label">Confirmar Nova Senha</label>
        <input type="password" id="first-conf-pw" class="form-control" placeholder="Repita a nova senha">
      </div>
    `,
    `<button class="btn btn-primary" onclick="submitFirstPasswordChange()">Salvar Nova Senha</button>`
  );
}

async function submitFirstPasswordChange() {
  const curr = document.getElementById('first-curr-pw').value;
  const newPw = document.getElementById('first-new-pw').value;
  const confPw = document.getElementById('first-conf-pw').value;
  const alertBox = document.getElementById('first-pw-alert');

  if (newPw !== confPw) {
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
    alertBox.style.color = '#f87171';
    alertBox.innerText = 'A confirmação de senha não confere.';
    return;
  }

  try {
    await API.post('/api/auth/change-password', {
      currentPassword: curr,
      newPassword: newPw
    });
    closeModal();
    state.currentUser.must_change_password = false;
    showToast('Senha alterada com sucesso! Bem-vindo ao sistema.', 'success');
  } catch (err) {
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
    alertBox.style.color = '#f87171';
    alertBox.innerText = err.message;
  }
}

// =========================================================================
// MAIN APP SHELL
// =========================================================================
function renderApp() {
  const app = document.getElementById('app');
  const user = state.currentUser;

  const roleLabels = {
    admin: 'Administrador Geral',
    representative: 'Representante Comercial',
    seller: 'Vendedor'
  };

  let menuItems = '';

  if (user.role === 'admin') {
    menuItems = `
      <a class="nav-item ${state.currentRoute === 'dashboard' ? 'active' : ''}" onclick="navigate('dashboard')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
        Painel Geral
      </a>
      <a class="nav-item ${state.currentRoute === 'sales' ? 'active' : ''}" onclick="navigate('sales')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        Vendas & Aprovações
      </a>
      <a class="nav-item ${state.currentRoute === 'users' ? 'active' : ''}" onclick="navigate('users')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
        Usuários & Equipes
      </a>
      <a class="nav-item ${state.currentRoute === 'commissions' ? 'active' : ''}" onclick="navigate('commissions')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        Comissões
      </a>
      <a class="nav-item ${state.currentRoute === 'payments' ? 'active' : ''}" onclick="navigate('payments')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
        Pagamentos
      </a>
      <a class="nav-item ${state.currentRoute === 'reports' ? 'active' : ''}" onclick="navigate('reports')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
        Relatórios & Ranking
      </a>
      <a class="nav-item ${state.currentRoute === 'settings' ? 'active' : ''}" onclick="navigate('settings')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        Regras Comerciais
      </a>
      <a class="nav-item ${state.currentRoute === 'audit' ? 'active' : ''}" onclick="navigate('audit')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        Auditoria & Logs
      </a>
    `;
  } else if (user.role === 'representative') {
    menuItems = `
      <a class="nav-item ${state.currentRoute === 'dashboard' ? 'active' : ''}" onclick="navigate('dashboard')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
        Painel do Representante
      </a>
      <a class="nav-item ${state.currentRoute === 'sales' ? 'active' : ''}" onclick="navigate('sales')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        Vendas da Equipe & Próprias
      </a>
      <a class="nav-item ${state.currentRoute === 'team' ? 'active' : ''}" onclick="navigate('team')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
        Minha Equipe de Vendedores
      </a>
      <a class="nav-item ${state.currentRoute === 'commissions' ? 'active' : ''}" onclick="navigate('commissions')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        Financeiro & Comissões
      </a>
      <a class="nav-item ${state.currentRoute === 'profile' ? 'active' : ''}" onclick="navigate('profile')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
        Meu Perfil & Senha
      </a>
    `;
  } else if (user.role === 'seller') {
    menuItems = `
      <a class="nav-item ${state.currentRoute === 'dashboard' ? 'active' : ''}" onclick="navigate('dashboard')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
        Painel do Vendedor
      </a>
      <a class="nav-item ${state.currentRoute === 'sales' ? 'active' : ''}" onclick="navigate('sales')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        Minhas Vendas
      </a>
      <a class="nav-item ${state.currentRoute === 'commissions' ? 'active' : ''}" onclick="navigate('commissions')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        Minhas Comissões
      </a>
      <a class="nav-item ${state.currentRoute === 'profile' ? 'active' : ''}" onclick="navigate('profile')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
        Meu Perfil & Senha
      </a>
    `;
  }

  app.innerHTML = `
    <div class="app-container">
      <aside class="sidebar" id="app-sidebar">
        <div class="brand">
          <img src="/images/logo-dark.png" alt="Lidery Media Agency" class="brand-logo-img">
        </div>

        <nav class="nav-menu">
          ${menuItems}
        </nav>

        <div class="user-badge">
          <div class="user-info">
            <span class="user-name">${user.full_name}</span>
            <span class="user-role-badge">${roleLabels[user.role]}</span>
          </div>
        </div>
      </aside>

      <main class="main-content">
        <header class="top-header">
          <div class="header-left">
            <button class="mobile-menu-btn" onclick="toggleMobileSidebar()">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
            <h2 class="page-title" id="page-title-text">Painel</h2>
          </div>

          <div class="header-right">
            <div class="live-indicator">
              <span class="dot"></span>
              <span>Online / Sincronizado</span>
            </div>

            <button class="btn btn-secondary btn-sm" onclick="openNotificationsModal()" style="position: relative;">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
              <span id="notif-badge" style="${state.unreadNotifications > 0 ? '' : 'display:none;'} position: absolute; top: -5px; right: -5px; background: #ef4444; color: #fff; font-size: 10px; font-weight: 700; border-radius: 10px; padding: 1px 5px;">
                ${state.unreadNotifications}
              </span>
            </button>

            ${(user.role === 'seller' || user.role === 'representative') ? `
              <button class="btn btn-primary btn-sm" onclick="openNewSaleModal()">
                + Registrar Nova Venda
              </button>
            ` : ''}

            <button class="btn btn-secondary btn-sm" onclick="logout()">
              Sair
            </button>
          </div>
        </header>

        <section class="content-body" id="view-container">
          <div style="padding: 40px; text-align: center; color: #6b7280;">Carregando dados...</div>
        </section>
      </main>
    </div>
  `;

  navigate(state.currentRoute);
}

function toggleMobileSidebar() {
  const sb = document.getElementById('app-sidebar');
  if (sb) sb.classList.toggle('open');
}

function updateHeaderBadges() {
  const badge = document.getElementById('notif-badge');
  if (badge) {
    if (state.unreadNotifications > 0) {
      badge.innerText = state.unreadNotifications;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

async function logout() {
  try {
    await API.post('/api/auth/logout');
  } catch (e) {}
  API.setToken(null);
  state.currentUser = null;
  if (state.refreshInterval) clearInterval(state.refreshInterval);
  renderLoginView();
  showToast('Desconectado com sucesso.', 'info');
}

function navigate(route) {
  state.currentRoute = route;
  const sb = document.getElementById('app-sidebar');
  if (sb) sb.classList.remove('open');

  // Update active links
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeLink = document.querySelector(`.nav-item[onclick="navigate('${route}')"]`);
  if (activeLink) activeLink.classList.add('active');

  const titleEl = document.getElementById('page-title-text');

  switch (route) {
    case 'dashboard':
      if (titleEl) titleEl.innerText = state.currentUser.role === 'admin' ? 'Painel Administrativo Geral' : (state.currentUser.role === 'representative' ? 'Painel do Representante' : 'Painel do Vendedor');
      renderDashboardView();
      break;
    case 'sales':
      if (titleEl) titleEl.innerText = state.currentUser.role === 'admin' ? 'Gerenciamento Geral de Vendas' : 'Histórico de Vendas';
      renderSalesView();
      break;
    case 'users':
      if (titleEl) titleEl.innerText = 'Gerenciamento de Usuários e Equipes';
      renderUsersView();
      break;
    case 'commissions':
      if (titleEl) titleEl.innerText = 'Gestão de Comissões';
      renderCommissionsView();
      break;
    case 'payments':
      if (titleEl) titleEl.innerText = 'Pagamentos de Comissões';
      renderPaymentsView();
      break;
    case 'team':
      if (titleEl) titleEl.innerText = 'Minha Equipe de Vendedores';
      renderTeamView();
      break;
    case 'reports':
      if (titleEl) titleEl.innerText = 'Relatórios & Desempenho';
      renderReportsView();
      break;
    case 'settings':
      if (titleEl) titleEl.innerText = 'Regras Comerciais & Produtos';
      renderSettingsView();
      break;
    case 'audit':
      if (titleEl) titleEl.innerText = 'Histórico de Auditoria';
      renderAuditView();
      break;
    case 'profile':
      if (titleEl) titleEl.innerText = 'Meu Perfil & Segurança';
      renderProfileView();
      break;
    default:
      renderDashboardView();
  }
}

// Background auto-refresh for current view without tearing down active forms
async function refreshCurrentViewData() {
  if (state.currentRoute === 'dashboard') {
    const data = await API.get('/api/dashboard', { period: state.selectedPeriod, startDate: state.customStartDate, endDate: state.customEndDate });
    updateDashboardMetricsCards(data.metrics);
  }
}

// =========================================================================
// DASHBOARD VIEW
// =========================================================================
async function renderDashboardView() {
  const container = document.getElementById('view-container');
  container.innerHTML = `<div style="padding: 30px; text-align: center; color: #9ca3af;">Carregando indicadores...</div>`;

  try {
    const data = await API.get('/api/dashboard', {
      period: state.selectedPeriod,
      startDate: state.customStartDate,
      endDate: state.customEndDate
    });

    const m = data.metrics;
    const role = state.currentUser.role;

    // Commercial Rule Banner for Seller and Representative
    const commercialBannerHtml = (role === 'seller' || role === 'representative') ? `
      <div class="commercial-banner">
        <div class="commercial-banner-content">
          <h4>Aviso Comercial — Plaquinhas NFC Google Review</h4>
          <p>
            "Nosso preço mínimo é de <strong>R$ 70,00</strong> por plaquinha e o preço sugerido é de <strong>R$ 85,00</strong>. 
            Você pode vender por um valor superior, sem limite máximo. Quanto maior o valor da venda, maior será sua comissão!"
          </p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="openNewSaleModal()">+ Registrar Venda</button>
      </div>
    ` : '';

    // Period Filter Bar
    const periodBarHtml = `
      <div class="filters-bar">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 13px; color: #9ca3af;">Filtrar período:</span>
          <select class="select-input" id="dashboard-period-select" onchange="changeDashboardPeriod(this.value)">
            <option value="all" ${state.selectedPeriod === 'all' ? 'selected' : ''}>Todos os registros</option>
            <option value="today" ${state.selectedPeriod === 'today' ? 'selected' : ''}>Hoje</option>
            <option value="last_7_days" ${state.selectedPeriod === 'last_7_days' ? 'selected' : ''}>Últimos 7 dias</option>
            <option value="current_month" ${state.selectedPeriod === 'current_month' ? 'selected' : ''}>Mês Atual</option>
            <option value="previous_month" ${state.selectedPeriod === 'previous_month' ? 'selected' : ''}>Mês Anterior</option>
            <option value="current_year" ${state.selectedPeriod === 'current_year' ? 'selected' : ''}>Ano Atual</option>
          </select>
        </div>
      </div>
    `;

    let cardsHtml = '';

    if (role === 'seller') {
      cardsHtml = `
        <div class="metrics-grid">
          <div class="card">
            <div class="card-title">Total Vendido no Período</div>
            <div class="card-value" id="card-total-sold">${API.formatMoney(m.total_sold)}</div>
            <div class="card-subtext">${m.sales_count} venda(s) registrada(s)</div>
          </div>
          <div class="card">
            <div class="card-title">Ticket Médio</div>
            <div class="card-value">${API.formatMoney(m.avg_ticket)}</div>
            <div class="card-subtext">Por venda no período</div>
          </div>
          <div class="card">
            <div class="card-title">Comissão Gerada</div>
            <div class="card-value">${API.formatMoney(m.commission_generated)}</div>
            <div class="card-subtext">Total acumulado (10%)</div>
          </div>
          <div class="card" style="border-left: 3px solid #f59e0b;">
            <div class="card-title">Aguardando Aprovação</div>
            <div class="card-value" style="color: #f59e0b;">${API.formatMoney(m.commission_pending_approval)}</div>
            <div class="card-subtext">${m.pending_sales_count} venda(s) em análise</div>
          </div>
          <div class="card" style="border-left: 3px solid #3b82f6;">
            <div class="card-title">Aprovada (Pendente Pagamento)</div>
            <div class="card-value" style="color: #60a5fa;">${API.formatMoney(m.commission_approved_pending_payout)}</div>
            <div class="card-subtext">Pronta para repasse administrativo</div>
          </div>
          <div class="card" style="border-left: 3px solid #10b981;">
            <div class="card-title">Comissão Efetivamente Paga</div>
            <div class="card-value" style="color: #34d399;">${API.formatMoney(m.commission_paid)}</div>
            <div class="card-subtext">Quitada pelo administrador</div>
          </div>
        </div>
      `;
    } else if (role === 'representative') {
      cardsHtml = `
        <div class="metrics-grid">
          <div class="card">
            <div class="card-title">Vendas Próprias (20%)</div>
            <div class="card-value">${API.formatMoney(m.total_own_sales_volume)}</div>
            <div class="card-subtext">${m.own_sales_count} venda(s) própria(s) aprovada(s)</div>
          </div>
          <div class="card">
            <div class="card-title">Comissão Própria (20%)</div>
            <div class="card-value" style="color: #ffffff;">${API.formatMoney(m.own_commission)}</div>
            <div class="card-subtext">Sobre suas vendas diretas</div>
          </div>
          <div class="card">
            <div class="card-title">Vendas da Equipe (5%)</div>
            <div class="card-value">${API.formatMoney(m.total_team_sales_volume)}</div>
            <div class="card-subtext">${m.team_sales_count} venda(s) de ${m.active_sellers_count} vendedores</div>
          </div>
          <div class="card">
            <div class="card-title">Comissão Indireta Equipe (5%)</div>
            <div class="card-value" style="color: #60a5fa;">${API.formatMoney(m.indirect_commission)}</div>
            <div class="card-subtext">5% adicional s/ vendas da sua equipe</div>
          </div>
          <div class="card" style="border-left: 3px solid #ffffff;">
            <div class="card-title">Comissão Total (Própria + Indireta)</div>
            <div class="card-value" style="color: #ffffff;">${API.formatMoney(m.total_commission)}</div>
            <div class="card-subtext">Soma das comissões geradas</div>
          </div>
          <div class="card" style="border-left: 3px solid #f59e0b;">
            <div class="card-title">Aguardando Aprovação</div>
            <div class="card-value" style="color: #f59e0b;">${API.formatMoney(m.pending_approval)}</div>
            <div class="card-subtext">Em análise pelo administrador</div>
          </div>
          <div class="card" style="border-left: 3px solid #3b82f6;">
            <div class="card-title">Aprovada (Pendente Pagamento)</div>
            <div class="card-value" style="color: #60a5fa;">${API.formatMoney(m.approved_pending_payout)}</div>
            <div class="card-subtext">Liberada para recebimento</div>
          </div>
          <div class="card" style="border-left: 3px solid #10b981;">
            <div class="card-title">Comissões Pagas</div>
            <div class="card-value" style="color: #34d399;">${API.formatMoney(m.paid)}</div>
            <div class="card-subtext">Já transferidas pelo admin</div>
          </div>
        </div>
      `;
    } else if (role === 'admin') {
      cardsHtml = `
        <div class="metrics-grid">
          <div class="card">
            <div class="card-title">Faturamento Total Registrado</div>
            <div class="card-value">${API.formatMoney(m.total_registered_revenue)}</div>
            <div class="card-subtext">${m.total_sales_count} venda(s) • ${m.total_plates_sold} plaquinhas</div>
          </div>
          <div class="card" style="border-left: 3px solid #10b981;">
            <div class="card-title">Valores Efetivamente Recebidos</div>
            <div class="card-value" style="color: #34d399;">${API.formatMoney(m.effectively_received)}</div>
            <div class="card-subtext">Pagamento confirmado pelo cliente</div>
          </div>
          <div class="card" style="border-left: 3px solid #f59e0b;">
            <div class="card-title">Aguardando Pagamento do Cliente</div>
            <div class="card-value" style="color: #f59e0b;">${API.formatMoney(m.waiting_client_payment)}</div>
            <div class="card-subtext">Pendentes ou parcelas a vencer</div>
          </div>
          <div class="card">
            <div class="card-title">Vendas por Status</div>
            <div style="font-size: 13px; margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
              <div>Aprovadas: <strong style="color: #10b981;">${m.sales_approved_count}</strong></div>
              <div>Aguardando Aprovação: <strong style="color: #f59e0b;">${m.sales_pending_count}</strong></div>
              <div>Recusadas: <strong style="color: #ef4444;">${m.sales_rejected_count}</strong></div>
              <div>Canceladas: <strong style="color: #9ca3af;">${m.sales_cancelled_count}</strong></div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">Equipe Comercial Ativa</div>
            <div class="card-value">${m.active_users}</div>
            <div class="card-subtext">${m.total_sellers} Vendedores • ${m.total_representatives} Representantes</div>
          </div>
          <div class="card">
            <div class="card-title">Comissões Vendedores (10%)</div>
            <div class="card-value">${API.formatMoney(m.seller_commissions_generated)}</div>
            <div class="card-subtext">Geradas para vendedores</div>
          </div>
          <div class="card">
            <div class="card-title">Comissões Representantes</div>
            <div class="card-value">${API.formatMoney(m.rep_commissions_generated)}</div>
            <div class="card-subtext">Próprias (20%) + Indiretas (5%)</div>
          </div>
          <div class="card" style="border-left: 3px solid #3b82f6;">
            <div class="card-title">Total de Comissões a Pagar</div>
            <div class="card-value" style="color: #60a5fa;">${API.formatMoney(m.commissions_to_pay)}</div>
            <div class="card-subtext">Aprovadas e pendentes de quitação</div>
          </div>
          <div class="card" style="border-left: 3px solid #10b981;">
            <div class="card-title">Comissões Já Pagas</div>
            <div class="card-value" style="color: #34d399;">${API.formatMoney(m.commissions_paid)}</div>
            <div class="card-subtext">Quitadas aos profissionais</div>
          </div>
          <div class="card" style="background: #141721; border-color: #3b4252;">
            <div class="card-title">Saldo Financeiro Estimado</div>
            <div class="card-value">${API.formatMoney(m.estimated_balance_after_commissions)}</div>
            <div class="card-subtext" style="font-size: 11px; color: #9ca3af;">
              * Recebido menos comissões aprovadas. Não representa lucro líquido final, pois não desconta custos fabris das plaquinhas, impostos ou despesas operacionais.
            </div>
          </div>
        </div>
      `;
    }

    // Quick Recent Sales preview
    const recentSales = await API.get('/api/sales', { limit: 5 });

    const salesTableHtml = `
      <div class="table-card">
        <div class="table-header-box">
          <h3>Últimas Vendas Registradas</h3>
          <button class="btn btn-secondary btn-sm" onclick="navigate('sales')">Ver Todas as Vendas</button>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Data</th>
                <th>Cliente</th>
                ${role === 'admin' ? '<th>Responsável</th><th>Representante</th>' : ''}
                <th>Qtd</th>
                <th>Total</th>
                <th>Status Venda</th>
                <th>Status Pagamento</th>
                <th>Comissão</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${recentSales.sales.length === 0 ? `
                <tr><td colspan="10" style="text-align: center; padding: 24px; color: #9ca3af;">Nenhuma venda registrada neste período.</td></tr>
              ` : recentSales.sales.map(s => `
                <tr>
                  <td><strong>${s.sale_code}</strong></td>
                  <td>${API.formatDate(s.sale_date)}</td>
                  <td>${s.client_name}</td>
                  ${role === 'admin' ? `<td>${s.seller_name}</td><td>${s.representative_name || '-'}</td>` : ''}
                  <td>${s.quantity} un</td>
                  <td><strong>${API.formatMoney(s.total_amount)}</strong></td>
                  <td>${API.getSaleStatusBadge(s.status)}</td>
                  <td>${API.getPaymentStatusBadge(s.payment_status)}</td>
                  <td>
                    ${role === 'seller' ? API.formatMoney(s.seller_commission_amount) : (role === 'representative' ? (s.author_role === 'representative' ? API.formatMoney(s.rep_own_amount) : API.formatMoney(s.rep_indirect_amount)) : `V: ${API.formatMoney(s.seller_commission_amount)} | R: ${API.formatMoney(s.rep_indirect_amount + s.rep_own_amount)}`)}
                  </td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="viewSaleDetails(${s.id})">Detalhes</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = `
      ${commercialBannerHtml}
      ${periodBarHtml}
      ${cardsHtml}
      ${salesTableHtml}
    `;

  } catch (err) {
    container.innerHTML = `<div style="padding: 30px; text-align: center; color: #ef4444;">Erro ao carregar painel: ${err.message}</div>`;
  }
}

function changeDashboardPeriod(period) {
  state.selectedPeriod = period;
  renderDashboardView();
}

function updateDashboardMetricsCards(m) {
  const el = document.getElementById('card-total-sold');
  if (el && m.total_sold !== undefined) {
    el.innerText = API.formatMoney(m.total_sold);
  }
}

// =========================================================================
// NEW SALE MODAL & REALTIME CALCULATION
// =========================================================================
async function openNewSaleModal() {
  try {
    const settingsData = await API.get('/api/settings');
    state.cachedSettings = settingsData.settings;
    state.cachedProducts = settingsData.products;

    const minPrice = Number(state.cachedSettings.default_min_price) || 70.00;
    const sugPrice = Number(state.cachedSettings.default_suggested_price) || 85.00;
    const role = state.currentUser.role;
    const commPct = role === 'representative' ? Number(state.cachedSettings.rep_own_commission_pct) : Number(state.cachedSettings.seller_commission_pct);

    const productOptions = state.cachedProducts.map(p => `
      <option value="${p.id}" data-min="${p.min_price}" data-sug="${p.suggested_price}">
        ${p.name}
      </option>
    `).join('');

    const modalBody = `
      <div id="new-sale-alert" style="display: none; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 13px;"></div>

      <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid #212631; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; font-size: 12.5px;">
        <span style="color: #9ca3af;">Regra de Preço:</span> Mínimo <strong>${API.formatMoney(minPrice)}</strong> • Sugerido <strong>${API.formatMoney(sugPrice)}</strong>.
        <span style="display: block; margin-top: 4px; color: #d1d5db;">Sua comissão estimada: <strong>${commPct}%</strong> s/ valor total aprovado.</span>
      </div>

      <form id="new-sale-form">
        <h4 style="font-size: 13px; text-transform: uppercase; color: #9ca3af; margin-bottom: 12px;">Dados do Cliente</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label class="form-label">Nome do Cliente ou Empresa *</label>
            <input type="text" id="sale-client-name" class="form-control" placeholder="ex: Restaurante Sabor & Arte" required>
          </div>
          <div class="form-group">
            <label class="form-label">Nome do Responsável</label>
            <input type="text" id="sale-client-contact" class="form-control" placeholder="ex: Marcelo Silva">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label class="form-label">Telefone / WhatsApp *</label>
            <input type="text" id="sale-client-phone" class="form-control" placeholder="(11) 98765-4321" required>
          </div>
          <div class="form-group">
            <label class="form-label">E-mail (opcional)</label>
            <input type="email" id="sale-client-email" class="form-control" placeholder="contato@cliente.com">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px;">
          <div class="form-group">
            <label class="form-label">Cidade</label>
            <input type="text" id="sale-client-city" class="form-control" placeholder="São Paulo">
          </div>
          <div class="form-group">
            <label class="form-label">Estado (UF)</label>
            <input type="text" id="sale-client-state" class="form-control" placeholder="SP" maxlength="2">
          </div>
        </div>

        <h4 style="font-size: 13px; text-transform: uppercase; color: #9ca3af; margin: 16px 0 12px 0;">Dados da Venda</h4>
        <div class="form-group">
          <label class="form-label">Produto *</label>
          <select id="sale-product-id" class="form-control" required>
            ${productOptions}
          </select>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label class="form-label">Quantidade de Plaquinhas *</label>
            <input type="number" id="sale-quantity" class="form-control" value="1" min="1" required oninput="recalculateSale()">
          </div>
          <div class="form-group">
            <label class="form-label">Valor Unitário (R$) *</label>
            <input type="number" id="sale-unit-price" class="form-control" value="${sugPrice.toFixed(2)}" step="0.50" min="1" required oninput="recalculateSale()">
          </div>
        </div>

        <!-- Price Warning Notice -->
        <div id="price-notice-box" style="margin-bottom: 14px; font-size: 12.5px; padding: 10px 14px; border-radius: 6px; display: none;"></div>

        <!-- Justification Field if below min price -->
        <div class="form-group" id="price-justification-group" style="display: none;">
          <label class="form-label" style="color: #f87171;">Justificativa para Valor Abaixo do Mínimo (Exige autorização explícita do Admin) *</label>
          <textarea id="sale-price-justification" class="form-control" rows="2" placeholder="Explique o motivo do desconto especial (ex: pedido com alta quantidade, parceiro estratégico)"></textarea>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label class="form-label">Forma de Pagamento *</label>
            <select id="sale-payment-method" class="form-control" required onchange="handlePaymentMethodChange(this.value)">
              <option value="Pix">Pix</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Cartão de débito">Cartão de débito</option>
              <option value="Cartão de crédito">Cartão de crédito</option>
              <option value="Transferência bancária">Transferência bancária</option>
              <option value="Boleto">Boleto</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status do Pagamento *</label>
            <select id="sale-payment-status" class="form-control" required>
              <option value="pending">Pendente (Aguardando cliente)</option>
              <option value="confirmed">Confirmado / Pago</option>
              <option value="installments">Parcelado</option>
            </select>
          </div>
        </div>

        <div class="form-group" id="installments-group" style="display: none;">
          <label class="form-label">Número de Parcelas</label>
          <input type="number" id="sale-installments" class="form-control" value="1" min="1" max="12">
        </div>

        <div class="form-group">
          <label class="form-label">Data da Venda</label>
          <input type="date" id="sale-date" class="form-control" value="${new Date().toISOString().slice(0, 10)}">
        </div>

        <div class="form-group">
          <label class="form-label">Observações Internas</label>
          <textarea id="sale-notes" class="form-control" rows="2" placeholder="Informações adicionais de entrega ou personalização"></textarea>
        </div>

        <!-- Calculated Totals Box -->
        <div style="background: #0d0f15; border: 1px solid #212631; border-radius: 8px; padding: 14px 18px; margin-top: 14px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 13px; color: #9ca3af;">Valor Total Calculado:</span>
            <strong style="font-size: 16px; color: #ffffff;" id="sale-calc-total">R$ 85,00</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-size: 13px; color: #9ca3af;">Sua Comissão Estimada (${commPct}%):</span>
            <strong style="font-size: 15px; color: #10b981;" id="sale-calc-comm">R$ 8,50</strong>
          </div>
          <div style="font-size: 11px; color: #6b7280; margin-top: 6px;">
            * A comissão é gerada e confirmada após a aprovação da venda e validação das regras.
          </div>
        </div>
      </form>
    `;

    openModal(
      'Registrar Nova Venda de Plaquinhas NFC',
      modalBody,
      `
        <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="btn-submit-sale" onclick="submitNewSale()">Confirmar Registro de Venda</button>
      `,
      () => {
        recalculateSale();
      }
    );

  } catch (err) {
    showToast(`Erro ao abrir formulário: ${err.message}`, 'danger');
  }
}

function handlePaymentMethodChange(method) {
  const instGroup = document.getElementById('installments-group');
  if (method === 'Cartão de crédito') {
    instGroup.style.display = 'block';
  } else {
    instGroup.style.display = 'none';
  }
}

function recalculateSale() {
  const qtyEl = document.getElementById('sale-quantity');
  const priceEl = document.getElementById('sale-unit-price');
  const totalEl = document.getElementById('sale-calc-total');
  const commEl = document.getElementById('sale-calc-comm');
  const noticeBox = document.getElementById('price-notice-box');
  const justGroup = document.getElementById('price-justification-group');

  if (!qtyEl || !priceEl) return;

  const qty = parseInt(qtyEl.value, 10) || 1;
  const unitPrice = parseFloat(priceEl.value) || 0;
  const total = Math.round((qty * unitPrice + Number.EPSILON) * 100) / 100;

  const role = state.currentUser.role;
  const commPct = role === 'representative' ? Number(state.cachedSettings.rep_own_commission_pct) : Number(state.cachedSettings.seller_commission_pct);
  const commVal = Math.round((total * (commPct / 100) + Number.EPSILON) * 100) / 100;

  totalEl.innerText = API.formatMoney(total);
  commEl.innerText = API.formatMoney(commVal);

  const minPrice = Number(state.cachedSettings.default_min_price) || 70.00;
  const sugPrice = Number(state.cachedSettings.default_suggested_price) || 85.00;

  if (unitPrice < minPrice) {
    noticeBox.style.display = 'block';
    noticeBox.style.background = 'rgba(239, 68, 68, 0.15)';
    noticeBox.style.border = '1px solid #ef4444';
    noticeBox.style.color = '#f87171';
    noticeBox.innerHTML = `⚠️ <strong>Valor abaixo do mínimo (${API.formatMoney(minPrice)}).</strong> É obrigatório justificar abaixo para que o administrador aprove a venda.`;
    justGroup.style.display = 'block';
  } else if (unitPrice < sugPrice) {
    noticeBox.style.display = 'block';
    noticeBox.style.background = 'rgba(245, 158, 11, 0.15)';
    noticeBox.style.border = '1px solid #f59e0b';
    noticeBox.style.color = '#fbbf24';
    noticeBox.innerHTML = `⚡ <strong>Aviso:</strong> Valor informado está abaixo do sugerido (${API.formatMoney(sugPrice)}), porém permitido acima do mínimo (${API.formatMoney(minPrice)}).`;
    justGroup.style.display = 'none';
  } else {
    noticeBox.style.display = 'none';
    justGroup.style.display = 'none';
  }
}

async function submitNewSale() {
  const alertBox = document.getElementById('new-sale-alert');
  const btn = document.getElementById('btn-submit-sale');

  const productId = parseInt(document.getElementById('sale-product-id').value, 10);
  const quantity = parseInt(document.getElementById('sale-quantity').value, 10);
  const unitPrice = parseFloat(document.getElementById('sale-unit-price').value);
  const clientName = document.getElementById('sale-client-name').value.trim();
  const clientContact = document.getElementById('sale-client-contact').value.trim();
  const clientPhone = document.getElementById('sale-client-phone').value.trim();
  const clientEmail = document.getElementById('sale-client-email').value.trim();
  const clientCity = document.getElementById('sale-client-city').value.trim();
  const clientState = document.getElementById('sale-client-state').value.trim();
  const paymentMethod = document.getElementById('sale-payment-method').value;
  const paymentStatus = document.getElementById('sale-payment-status').value;
  const installments = parseInt(document.getElementById('sale-installments')?.value || '1', 10);
  const saleDate = document.getElementById('sale-date').value;
  const notes = document.getElementById('sale-notes').value.trim();
  const justification = document.getElementById('sale-price-justification')?.value.trim();

  const minPrice = Number(state.cachedSettings.default_min_price) || 70.00;
  if (unitPrice < minPrice && (!justification || justification.length < 5)) {
    alertBox.style.display = 'block';
    alertBox.className = 'badge-danger';
    alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
    alertBox.style.color = '#f87171';
    alertBox.innerText = 'Por favor, informe a justificativa detalhada para venda abaixo do preço mínimo.';
    return;
  }

  btn.disabled = true;
  btn.innerText = 'Registrando...';

  try {
    const res = await API.post('/api/sales', {
      product_id: productId,
      quantity,
      unit_price: unitPrice,
      client_name: clientName,
      client_contact_name: clientContact,
      client_phone: clientPhone,
      client_email: clientEmail,
      client_city: clientCity,
      client_state: clientState,
      client_notes: notes,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      installments_count: installments,
      sale_date: saleDate,
      price_justification: justification
    });

    closeModal();
    showToast(`Venda ${res.sale.sale_code} registrada com sucesso!`, 'success');

    if (state.currentRoute === 'dashboard') {
      renderDashboardView();
    } else if (state.currentRoute === 'sales') {
      renderSalesView();
    }
  } catch (err) {
    alertBox.style.display = 'block';
    alertBox.className = 'badge-danger';
    alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
    alertBox.style.color = '#f87171';
    alertBox.innerText = err.message || 'Erro ao registrar venda';
    btn.disabled = false;
    btn.innerText = 'Confirmar Registro de Venda';
  }
}

// =========================================================================
// SALES VIEW
// =========================================================================
async function renderSalesView() {
  const container = document.getElementById('view-container');
  container.innerHTML = `<div style="padding: 30px; text-align: center; color: #9ca3af;">Carregando histórico de vendas...</div>`;

  try {
    const role = state.currentUser.role;
    const res = await API.get('/api/sales', {
      status: state.salesFilterStatus || '',
      payment_status: state.salesFilterPayment || '',
      search: state.salesSearchQuery || ''
    });

    const sales = res.sales;

    const filtersHtml = `
      <div class="filters-bar">
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px;">
          <input type="text" class="search-input" id="sales-search-box" placeholder="Buscar por cliente, código, telefone..." value="${state.salesSearchQuery || ''}" onkeyup="if(event.key==='Enter') applySalesFilter()">
          
          <select class="select-input" id="sales-status-select" onchange="applySalesFilter()">
            <option value="">Todos os status de venda</option>
            <option value="pending_approval" ${state.salesFilterStatus === 'pending_approval' ? 'selected' : ''}>Aguardando Aprovação</option>
            <option value="approved" ${state.salesFilterStatus === 'approved' ? 'selected' : ''}>Aprovadas</option>
            <option value="rejected" ${state.salesFilterStatus === 'rejected' ? 'selected' : ''}>Recusadas</option>
            <option value="cancelled" ${state.salesFilterStatus === 'cancelled' ? 'selected' : ''}>Canceladas</option>
          </select>

          <select class="select-input" id="sales-payment-select" onchange="applySalesFilter()">
            <option value="">Todos os pagamentos</option>
            <option value="pending" ${state.salesFilterPayment === 'pending' ? 'selected' : ''}>Pagamento Pendente</option>
            <option value="confirmed" ${state.salesFilterPayment === 'confirmed' ? 'selected' : ''}>Pagamento Confirmado</option>
            <option value="installments" ${state.salesFilterPayment === 'installments' ? 'selected' : ''}>Parcelado</option>
          </select>

          <button class="btn btn-secondary btn-sm" onclick="applySalesFilter()">Filtrar</button>
        </div>

        <div style="display: flex; gap: 10px;">
          ${role === 'admin' ? `
            <a href="/api/reports/export-sales" target="_blank" class="btn btn-secondary btn-sm">
              📥 Exportar CSV
            </a>
          ` : ''}
          ${(role === 'seller' || role === 'representative') ? `
            <button class="btn btn-primary btn-sm" onclick="openNewSaleModal()">+ Nova Venda</button>
          ` : ''}
        </div>
      </div>
    `;

    const tableHtml = `
      <div class="table-card">
        <div class="table-header-box">
          <h3>Listagem de Vendas (${sales.length} registros)</h3>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Data</th>
                <th>Cliente</th>
                ${role === 'admin' ? '<th>Vendedor</th><th>Representante</th>' : ''}
                ${role === 'representative' ? '<th>Vendedor Responsável</th>' : ''}
                <th>Qtd</th>
                <th>Unitário</th>
                <th>Total</th>
                <th>Status Venda</th>
                <th>Status Pagamento</th>
                <th>Comissão</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${sales.length === 0 ? `
                <tr><td colspan="12" style="text-align: center; padding: 30px; color: #9ca3af;">Nenhuma venda encontrada com os filtros selecionados.</td></tr>
              ` : sales.map(s => `
                <tr>
                  <td><strong>${s.sale_code}</strong></td>
                  <td>${API.formatDate(s.sale_date)}</td>
                  <td>
                    <div><strong>${s.client_name}</strong></div>
                    <div style="font-size: 11px; color: #9ca3af;">${s.client_phone}</div>
                  </td>
                  ${role === 'admin' ? `
                    <td>${s.seller_name}</td>
                    <td>${s.representative_name || '<span style="color:#6b7280;">Nenhum</span>'}</td>
                  ` : ''}
                  ${role === 'representative' ? `
                    <td>${s.seller_id === state.currentUser.id ? '<span class="badge badge-info">Venda Própria</span>' : s.seller_name}</td>
                  ` : ''}
                  <td>${s.quantity} un</td>
                  <td>${API.formatMoney(s.unit_price)}</td>
                  <td><strong>${API.formatMoney(s.total_amount)}</strong></td>
                  <td>
                    ${API.getSaleStatusBadge(s.status)}
                    ${s.below_min_price ? '<span class="badge badge-danger" style="margin-top:4px; display:inline-block;">Abaixo do Mínimo</span>' : ''}
                  </td>
                  <td>${API.getPaymentStatusBadge(s.payment_status)}</td>
                  <td>
                    ${role === 'seller' ? `<strong>${API.formatMoney(s.seller_commission_amount)}</strong>` : (role === 'representative' ? (s.author_role === 'representative' ? `<strong>${API.formatMoney(s.rep_own_amount)}</strong> (20%)` : `<strong>${API.formatMoney(s.rep_indirect_amount)}</strong> (5%)`) : `V: ${API.formatMoney(s.seller_commission_amount)}<br>R: ${API.formatMoney(s.rep_indirect_amount + s.rep_own_amount)}`)}
                  </td>
                  <td>
                    <div style="display: flex; gap: 6px;">
                      <button class="btn btn-secondary btn-sm" onclick="viewSaleDetails(${s.id})">Ver</button>
                      ${role === 'admin' && s.status === 'pending_approval' ? `
                        <button class="btn btn-primary btn-sm" style="background:#10b981; color:#fff;" onclick="adminApproveSale(${s.id})">Aprovar</button>
                        <button class="btn btn-danger btn-sm" onclick="openAdminRejectModal(${s.id})">Recusar</button>
                      ` : ''}
                      ${role === 'admin' && s.status === 'approved' ? `
                        <button class="btn btn-danger btn-sm" onclick="openAdminCancelModal(${s.id})">Cancelar</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = `
      ${filtersHtml}
      ${tableHtml}
    `;

  } catch (err) {
    container.innerHTML = `<div style="padding: 30px; text-align: center; color: #ef4444;">Erro ao carregar vendas: ${err.message}</div>`;
  }
}

function applySalesFilter() {
  state.salesSearchQuery = document.getElementById('sales-search-box')?.value || '';
  state.salesFilterStatus = document.getElementById('sales-status-select')?.value || '';
  state.salesFilterPayment = document.getElementById('sales-payment-select')?.value || '';
  renderSalesView();
}

// Sale Details Modal
async function viewSaleDetails(saleId) {
  try {
    const res = await API.get(`/api/sales/${saleId}`);
    const s = res.sale;
    const role = state.currentUser.role;

    const bodyHtml = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid #212631; padding-bottom: 14px;">
        <div>
          <span style="font-size: 18px; font-weight: 700; color: #ffffff;">${s.sale_code}</span>
          <div style="font-size: 12px; color: #9ca3af;">Data de registro: ${API.formatDate(s.created_at)}</div>
        </div>
        <div>
          ${API.getSaleStatusBadge(s.status)}
          ${API.getPaymentStatusBadge(s.payment_status)}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px;">
        <div style="background: rgba(255,255,255,0.02); padding: 14px; border-radius: 8px; border: 1px solid #212631;">
          <h4 style="font-size: 12px; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px;">Dados do Cliente</h4>
          <p><strong>Nome:</strong> ${s.client_name}</p>
          <p><strong>Responsável:</strong> ${s.client_contact_name || '-'}</p>
          <p><strong>Telefone:</strong> ${s.client_phone}</p>
          <p><strong>E-mail:</strong> ${s.client_email || '-'}</p>
          <p><strong>Localidade:</strong> ${s.client_city || '-'}/${s.client_state || '-'}</p>
        </div>

        <div style="background: rgba(255,255,255,0.02); padding: 14px; border-radius: 8px; border: 1px solid #212631;">
          <h4 style="font-size: 12px; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px;">Dados da Transação</h4>
          <p><strong>Produto:</strong> ${s.product_name}</p>
          <p><strong>Quantidade:</strong> ${s.quantity} plaquinha(s)</p>
          <p><strong>Valor Unitário:</strong> ${API.formatMoney(s.unit_price)}</p>
          <p><strong>Valor Total:</strong> <strong style="color: #ffffff;">${API.formatMoney(s.total_amount)}</strong></p>
          <p><strong>Forma de Pagamento:</strong> ${s.payment_method} ${s.installments_count > 1 ? `(${s.installments_count}x)` : ''}</p>
        </div>
      </div>

      ${s.below_min_price ? `
        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 13px;">
          <strong style="color: #f87171;">⚠️ Venda com valor abaixo do preço mínimo:</strong>
          <p style="margin-top: 4px; color: #d1d5db;">Justificativa registrada: ${s.price_justification || 'Não informada'}</p>
        </div>
      ` : ''}

      <div style="background: #0d0f15; padding: 14px 18px; border-radius: 8px; border: 1px solid #212631; margin-bottom: 16px;">
        <h4 style="font-size: 12px; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px;">Comissões da Venda</h4>
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
          <span>Vendedor Responsável: <strong>${s.seller_name}</strong></span>
          <span>Comissão (${s.seller_commission_rate}%): <strong>${API.formatMoney(s.seller_commission_amount)}</strong></span>
        </div>
        ${s.representative_name ? `
          <div style="display: flex; justify-content: space-between; font-size: 13px;">
            <span>Representante Vinculado: <strong>${s.representative_name}</strong></span>
            <span>Comissão Indireta (${s.rep_indirect_rate}%): <strong>${API.formatMoney(s.rep_indirect_amount)}</strong></span>
          </div>
        ` : ''}
        ${s.author_role === 'representative' ? `
          <div style="display: flex; justify-content: space-between; font-size: 13px;">
            <span>Representante (Venda Própria): <strong>${s.seller_name}</strong></span>
            <span>Comissão Própria (${s.rep_own_rate}%): <strong>${API.formatMoney(s.rep_own_amount)}</strong></span>
          </div>
        ` : ''}
      </div>

      ${s.rejection_reason ? `
        <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 10px 14px; border-radius: 6px; font-size: 13px; color: #f87171; margin-bottom: 14px;">
          <strong>Motivo da Recusa:</strong> ${s.rejection_reason}
        </div>
      ` : ''}

      ${s.cancellation_reason ? `
        <div style="background: rgba(156, 163, 175, 0.15); border: 1px solid #9ca3af; padding: 10px 14px; border-radius: 6px; font-size: 13px; color: #d1d5db; margin-bottom: 14px;">
          <strong>Motivo do Cancelamento:</strong> ${s.cancellation_reason}
        </div>
      ` : ''}

      ${role === 'admin' ? `
        <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid #212631; display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 13px; color: #9ca3af;">Atualizar Status de Pagamento do Cliente:</span>
          <select class="select-input" onchange="adminUpdateSalePaymentStatus(${s.id}, this.value)">
            <option value="pending" ${s.payment_status === 'pending' ? 'selected' : ''}>Pendente</option>
            <option value="confirmed" ${s.payment_status === 'confirmed' ? 'selected' : ''}>Confirmado / Recebido</option>
            <option value="installments" ${s.payment_status === 'installments' ? 'selected' : ''}>Parcelado</option>
          </select>
        </div>
      ` : ''}
    `;

    let footerHtml = `<button class="btn btn-secondary" onclick="closeModal()">Fechar</button>`;

    if (role === 'admin') {
      if (s.status === 'pending_approval') {
        footerHtml += `
          <button class="btn btn-danger" onclick="closeModal(); openAdminRejectModal(${s.id})">Recusar Venda</button>
          <button class="btn btn-primary" style="background:#10b981; color:#fff;" onclick="closeModal(); adminApproveSale(${s.id})">Aprovar Venda</button>
        `;
      } else if (s.status === 'approved') {
        footerHtml += `
          <button class="btn btn-danger" onclick="closeModal(); openAdminCancelModal(${s.id})">Cancelar Venda</button>
        `;
      }
    } else {
      // Seller / Representative can request correction or cancellation
      footerHtml += `
        <button class="btn btn-secondary" onclick="closeModal(); openRequestCorrectionModal(${s.id}, '${s.sale_code}')">Solicitar Correção ou Cancelamento</button>
      `;
    }

    openModal(`Detalhes da Venda — ${s.sale_code}`, bodyHtml, footerHtml);

  } catch (err) {
    showToast(`Erro ao carregar detalhes: ${err.message}`, 'danger');
  }
}

async function adminApproveSale(saleId) {
  try {
    await API.post(`/api/sales/${saleId}/approve`);
    showToast('Venda aprovada com sucesso! Comissões liberadas.', 'success');
    renderSalesView();
  } catch (err) {
    showToast(`Erro ao aprovar venda: ${err.message}`, 'danger');
  }
}

function openAdminRejectModal(saleId) {
  openModal(
    'Recusar Venda',
    `
      <p style="font-size: 13px; color: #d1d5db; margin-bottom: 12px;">
        Informe o motivo da recusa. As comissões pendentes serão canceladas e o vendedor será notificado.
      </p>
      <div class="form-group">
        <label class="form-label">Motivo da Recusa *</label>
        <textarea id="reject-reason" class="form-control" rows="3" placeholder="ex: Pagamento não identificado pelo cliente, desistência"></textarea>
      </div>
    `,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Voltar</button>
      <button class="btn btn-danger" onclick="submitAdminRejectSale(${saleId})">Confirmar Recusa</button>
    `
  );
}

async function submitAdminRejectSale(saleId) {
  const reason = document.getElementById('reject-reason').value.trim();
  if (!reason) {
    showToast('Informe o motivo da recusa', 'warning');
    return;
  }
  try {
    await API.post(`/api/sales/${saleId}/reject`, { reason });
    closeModal();
    showToast('Venda recusada com sucesso.', 'info');
    renderSalesView();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

function openAdminCancelModal(saleId) {
  openModal(
    'Cancelar Venda Aprovada',
    `
      <p style="font-size: 13px; color: #d1d5db; margin-bottom: 12px;">
        O cancelamento de uma venda aprovada cancelará comissões pendentes.
        <strong style="color: #f87171; display: block; margin-top: 6px;">Caso a comissão já tenha sido paga, um estorno de ajuste financeiro rastreável será criado no sistema.</strong>
      </p>
      <div class="form-group">
        <label class="form-label">Motivo do Cancelamento *</label>
        <textarea id="cancel-reason" class="form-control" rows="3" placeholder="ex: Devolução de mercadoria, cancelamento de contrato"></textarea>
      </div>
    `,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Voltar</button>
      <button class="btn btn-danger" onclick="submitAdminCancelSale(${saleId})">Confirmar Cancelamento</button>
    `
  );
}

async function submitAdminCancelSale(saleId) {
  const reason = document.getElementById('cancel-reason').value.trim();
  if (!reason) {
    showToast('Informe o motivo do cancelamento', 'warning');
    return;
  }
  try {
    await API.post(`/api/sales/${saleId}/cancel`, { reason });
    closeModal();
    showToast('Venda cancelada com sucesso. Ajustes e histórico preservados.', 'info');
    renderSalesView();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function adminUpdateSalePaymentStatus(saleId, newStatus) {
  try {
    await API.post(`/api/sales/${saleId}/payment-status`, { payment_status: newStatus });
    showToast('Status de pagamento atualizado com sucesso.', 'success');
  } catch (err) {
    showToast(`Erro ao atualizar pagamento: ${err.message}`, 'danger');
  }
}

function openRequestCorrectionModal(saleId, saleCode) {
  openModal(
    `Solicitar Alteração na Venda ${saleCode}`,
    `
      <p style="font-size: 13px; color: #d1d5db; margin-bottom: 12px;">
        Vendedores e representantes não podem apagar ou alterar diretamente registros financeiros.
        Sua solicitação será encaminhada diretamente para análise do administrador.
      </p>
      <div class="form-group">
        <label class="form-label">Tipo de Solicitação</label>
        <select id="req-corr-type" class="form-control">
          <option value="correction">Correção de Dados (Cliente, Valor, Forma de Pagamento)</option>
          <option value="cancellation">Cancelamento da Venda</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Justificativa e Detalhes da Alteração *</label>
        <textarea id="req-corr-reason" class="form-control" rows="3" placeholder="Descreva claramente o que precisa ser corrigido ou o motivo do cancelamento"></textarea>
      </div>
    `,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Voltar</button>
      <button class="btn btn-primary" onclick="submitRequestCorrection(${saleId})">Enviar Solicitação ao Administrador</button>
    `
  );
}

async function submitRequestCorrection(saleId) {
  const type = document.getElementById('req-corr-type').value;
  const reason = document.getElementById('req-corr-reason').value.trim();
  if (!reason) {
    showToast('Por favor descreva o motivo da solicitação.', 'warning');
    return;
  }
  try {
    await API.post(`/api/sales/${saleId}/request-correction`, { type, reason });
    closeModal();
    showToast('Solicitação encaminhada ao administrador com sucesso!', 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// =========================================================================
// USERS & TEAMS MANAGEMENT (ADMIN ONLY)
// =========================================================================
async function renderUsersView() {
  const container = document.getElementById('view-container');
  container.innerHTML = `<div style="padding: 30px; text-align: center; color: #9ca3af;">Carregando usuários...</div>`;

  try {
    const res = await API.get('/api/users');
    const users = res.users;

    const reps = users.filter(u => u.role === 'representative' && u.status === 'active');

    const headerBar = `
      <div class="filters-bar">
        <div>
          <input type="text" class="search-input" id="user-search-box" placeholder="Buscar por nome, usuário, email..." oninput="filterUsersTable(this.value)">
        </div>
        <div>
          <button class="btn btn-primary" onclick="openCreateUserModal()">+ Criar Novo Usuário</button>
        </div>
      </div>
    `;

    const tableHtml = `
      <div class="table-card">
        <div class="table-header-box">
          <h3>Usuários Cadastrados (${users.length})</h3>
        </div>
        <div class="table-container">
          <table id="users-table">
            <thead>
              <tr>
                <th>Nome Completo</th>
                <th>Usuário</th>
                <th>Perfil</th>
                <th>Status</th>
                <th>Representante Vinculado</th>
                <th>Vendas Aprovadas</th>
                <th>Data Cadastro</th>
                <th>Último Acesso</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr data-user-text="${u.full_name} ${u.username} ${u.email || ''}">
                  <td><strong>${u.full_name}</strong></td>
                  <td><code>${u.username}</code></td>
                  <td>
                    ${u.role === 'admin' ? '<span class="badge badge-danger">Administrador</span>' : (u.role === 'representative' ? '<span class="badge badge-info">Representante</span>' : '<span class="badge badge-gray">Vendedor</span>')}
                  </td>
                  <td>
                    ${u.status === 'active' ? '<span class="badge badge-success">Ativo</span>' : '<span class="badge badge-danger">Inativo</span>'}
                  </td>
                  <td>
                    ${u.role === 'seller' ? (u.representative_name ? `<strong>${u.representative_name}</strong>` : '<span style="color:#6b7280;">Sem Representante</span>') : (u.role === 'representative' ? `<span style="font-size:12px; color:#60a5fa;">${u.active_sellers_count || 0} vendedores vinculados</span>` : '-')}
                  </td>
                  <td>${u.approved_sales_count || 0} (${API.formatMoney(u.approved_sales_total || 0)})</td>
                  <td>${API.formatDate(u.created_at)}</td>
                  <td>${u.last_login_at ? API.formatDate(u.last_login_at) : '<span style="color:#6b7280;">Nunca</span>'}</td>
                  <td>
                    <div style="display: flex; gap: 6px;">
                      <button class="btn btn-secondary btn-sm" onclick="openEditUserModal(${u.id})">Editar</button>
                      <button class="btn btn-secondary btn-sm" onclick="openAdminResetPasswordModal(${u.id}, '${u.username}')">Senha</button>
                      ${u.role === 'seller' ? `
                        <button class="btn btn-secondary btn-sm" onclick="openLinkRepModal(${u.id}, '${u.full_name}', ${u.representative_id || 'null'})">Vínculo</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = `
      ${headerBar}
      ${tableHtml}
    `;

  } catch (err) {
    container.innerHTML = `<div style="padding: 30px; text-align: center; color: #ef4444;">Erro ao carregar usuários: ${err.message}</div>`;
  }
}

function filterUsersTable(text) {
  const rows = document.querySelectorAll('#users-table tbody tr');
  const term = text.toLowerCase().trim();
  rows.forEach(r => {
    const content = r.getAttribute('data-user-text')?.toLowerCase() || '';
    r.style.display = content.includes(term) ? '' : 'none';
  });
}

async function openCreateUserModal() {
  const usersRes = await API.get('/api/users');
  const reps = usersRes.users.filter(u => u.role === 'representative' && u.status === 'active');

  const repOptions = reps.map(r => `<option value="${r.id}">${r.full_name} (${r.username})</option>`).join('');

  openModal(
    'Criar Novo Usuário no Sistema',
    `
      <div id="create-user-alert" style="display: none; padding: 10px; border-radius: 6px; margin-bottom: 14px; font-size: 13px;"></div>

      <div class="form-group">
        <label class="form-label">Perfil de Acesso *</label>
        <select id="new-user-role" class="form-control" onchange="document.getElementById('new-user-rep-group').style.display = (this.value === 'seller' ? 'block' : 'none')">
          <option value="seller">Vendedor (Comissão própria 10%)</option>
          <option value="representative">Representante Comercial (20% própria + 5% equipe)</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Nome Completo *</label>
        <input type="text" id="new-user-fullname" class="form-control" placeholder="ex: Carlos Alberto Santos" required>
      </div>

      <div class="form-group">
        <label class="form-label">Nome de Usuário Único *</label>
        <input type="text" id="new-user-username" class="form-control" placeholder="ex: carlos.santos" required autocomplete="off">
      </div>

      <div class="form-group">
        <label class="form-label">Senha Inicial *</label>
        <input type="password" id="new-user-password" class="form-control" placeholder="Mínimo 6 caracteres" required autocomplete="new-password">
        <span style="font-size: 11px; color: #9ca3af;">O usuário será solicitado a alterar esta senha no primeiro login.</span>
      </div>

      <div class="form-group" id="new-user-rep-group">
        <label class="form-label">Representante Comercial Responsável (opcional)</label>
        <select id="new-user-rep" class="form-control">
          <option value="">Nenhum (Vendedor independente)</option>
          ${repOptions}
        </select>
        <span style="font-size: 11px; color: #9ca3af;">Se vinculado, o representante receberá 5% de comissão indireta nas vendas deste vendedor.</span>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div class="form-group">
          <label class="form-label">Telefone / WhatsApp</label>
          <input type="text" id="new-user-phone" class="form-control" placeholder="(11) 98888-7777">
        </div>
        <div class="form-group">
          <label class="form-label">E-mail</label>
          <input type="email" id="new-user-email" class="form-control" placeholder="carlos@empresa.com">
        </div>
      </div>
    `,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="submitCreateUser()">Salvar Usuário</button>
    `
  );
}

async function submitCreateUser() {
  const alertBox = document.getElementById('create-user-alert');
  const role = document.getElementById('new-user-role').value;
  const fullName = document.getElementById('new-user-fullname').value.trim();
  const username = document.getElementById('new-user-username').value.trim();
  const password = document.getElementById('new-user-password').value;
  const repId = document.getElementById('new-user-rep').value || null;
  const phone = document.getElementById('new-user-phone').value.trim();
  const email = document.getElementById('new-user-email').value.trim();

  try {
    await API.post('/api/users', {
      role,
      full_name: fullName,
      username,
      password,
      representative_id: repId ? parseInt(repId, 10) : null,
      phone,
      email
    });
    closeModal();
    showToast(`Usuário ${username} criado com sucesso!`, 'success');
    renderUsersView();
  } catch (err) {
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
    alertBox.style.color = '#f87171';
    alertBox.innerText = err.message;
  }
}

async function openEditUserModal(userId) {
  try {
    const res = await API.get(`/api/users/${userId}`);
    const u = res.user;

    openModal(
      `Editar Usuário — ${u.full_name}`,
      `
        <div id="edit-user-alert" style="display: none; padding: 10px; border-radius: 6px; margin-bottom: 14px; font-size: 13px;"></div>

        <div class="form-group">
          <label class="form-label">Nome Completo *</label>
          <input type="text" id="edit-user-fullname" class="form-control" value="${u.full_name}" required>
        </div>

        <div class="form-group">
          <label class="form-label">Nome de Usuário</label>
          <input type="text" id="edit-user-username" class="form-control" value="${u.username}" required>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label class="form-label">Telefone</label>
            <input type="text" id="edit-user-phone" class="form-control" value="${u.phone || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">E-mail</label>
            <input type="email" id="edit-user-email" class="form-control" value="${u.email || ''}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Status da Conta</label>
          <select id="edit-user-status" class="form-control">
            <option value="active" ${u.status === 'active' ? 'selected' : ''}>Ativo</option>
            <option value="inactive" ${u.status === 'inactive' ? 'selected' : ''}>Inativo (Acesso bloqueado)</option>
          </select>
        </div>
      `,
      `
        <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="submitEditUser(${u.id})">Salvar Alterações</button>
      `
    );
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function submitEditUser(userId) {
  const alertBox = document.getElementById('edit-user-alert');
  const fullName = document.getElementById('edit-user-fullname').value.trim();
  const username = document.getElementById('edit-user-username').value.trim();
  const phone = document.getElementById('edit-user-phone').value.trim();
  const email = document.getElementById('edit-user-email').value.trim();
  const status = document.getElementById('edit-user-status').value;

  try {
    await API.put(`/api/users/${userId}`, {
      full_name: fullName,
      username,
      phone,
      email,
      status
    });
    closeModal();
    showToast('Usuário atualizado com sucesso!', 'success');
    renderUsersView();
  } catch (err) {
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
    alertBox.style.color = '#f87171';
    alertBox.innerText = err.message;
  }
}

function openAdminResetPasswordModal(userId, username) {
  openModal(
    `Redefinir Senha — ${username}`,
    `
      <div id="reset-pw-alert" style="display: none; padding: 10px; border-radius: 6px; margin-bottom: 14px; font-size: 13px;"></div>
      <p style="font-size: 13px; color: #d1d5db; margin-bottom: 14px;">
        Defina uma nova senha temporária para o usuário. Ele será obrigado a alterá-la no próximo acesso.
        Por segurança, sessões ativas deste usuário serão encerradas imediatamente.
      </p>
      <div class="form-group">
        <label class="form-label">Nova Senha Provisória *</label>
        <input type="password" id="reset-new-password" class="form-control" placeholder="Mínimo 6 caracteres" required>
      </div>
    `,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="submitAdminResetPassword(${userId})">Confirmar Redefinição</button>
    `
  );
}

async function submitAdminResetPassword(userId) {
  const newPassword = document.getElementById('reset-new-password').value;
  const alertBox = document.getElementById('reset-pw-alert');
  try {
    await API.post(`/api/users/${userId}/reset-password`, { newPassword });
    closeModal();
    showToast('Senha redefinida com sucesso!', 'success');
  } catch (err) {
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
    alertBox.style.color = '#f87171';
    alertBox.innerText = err.message;
  }
}

async function openLinkRepModal(sellerId, sellerName, currentRepId) {
  try {
    const usersRes = await API.get('/api/users');
    const reps = usersRes.users.filter(u => u.role === 'representative' && u.status === 'active');
    const historyRes = await API.get(`/api/users/${sellerId}/history`);

    const repOptions = reps.map(r => `
      <option value="${r.id}" ${currentRepId === r.id ? 'selected' : ''}>
        ${r.full_name} (${r.username})
      </option>
    `).join('');

    const historyRows = historyRes.history.map(h => `
      <div style="font-size: 12px; padding: 8px 0; border-bottom: 1px solid #212631; color: #9ca3af;">
        <strong>${API.formatDate(h.created_at)}:</strong> ${h.action === 'link' ? `Vinculado a ${h.representative_name}` : 'Desvinculado'} por ${h.admin_name}.
        ${h.notes ? `<div style="font-size: 11px; color: #6b7280;">Obs: ${h.notes}</div>` : ''}
      </div>
    `).join('');

    openModal(
      `Vínculo de Equipe — ${sellerName}`,
      `
        <div id="link-rep-alert" style="display: none; padding: 10px; border-radius: 6px; margin-bottom: 14px; font-size: 13px;"></div>

        <div style="background: rgba(255,255,255,0.03); border: 1px solid #212631; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 12.5px;">
          <strong style="color:#ffffff;">Regra de Histórico e Portabilidade:</strong>
          <p style="margin-top: 4px; color: #d1d5db;">
            Ao alterar o vínculo de um vendedor, as vendas registradas anteriormente preservam suas comissões e representantes originais. O novo vínculo terá efeito a partir de sua data de vigência para vendas futuras.
          </p>
        </div>

        <div class="form-group">
          <label class="form-label">Representante Comercial Atribuído</label>
          <select id="link-rep-id" class="form-control">
            <option value="">Nenhum (Vendedor independente / sem comissão indireta)</option>
            ${repOptions}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Justificativa / Observação do Vínculo</label>
          <input type="text" id="link-rep-notes" class="form-control" placeholder="ex: Transferência para equipe regional São Paulo">
        </div>

        <h4 style="font-size: 12px; text-transform: uppercase; color: #9ca3af; margin: 16px 0 8px 0;">Histórico de Alterações de Vínculo</h4>
        <div style="max-height: 160px; overflow-y: auto;">
          ${historyRows || '<p style="font-size: 12px; color: #6b7280;">Nenhuma alteração de vínculo anterior.</p>'}
        </div>
      `,
      `
        <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="submitLinkRep(${sellerId})">Atualizar Vínculo</button>
      `
    );
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function submitLinkRep(sellerId) {
  const repId = document.getElementById('link-rep-id').value;
  const notes = document.getElementById('link-rep-notes').value.trim();
  const alertBox = document.getElementById('link-rep-alert');

  try {
    await API.post(`/api/users/${sellerId}/link-rep`, {
      representative_id: repId ? parseInt(repId, 10) : null,
      notes
    });
    closeModal();
    showToast('Vínculo comercial atualizado com sucesso!', 'success');
    renderUsersView();
  } catch (err) {
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
    alertBox.style.color = '#f87171';
    alertBox.innerText = err.message;
  }
}

// =========================================================================
// COMMISSIONS VIEW
// =========================================================================
async function renderCommissionsView() {
  const container = document.getElementById('view-container');
  container.innerHTML = `<div style="padding: 30px; text-align: center; color: #9ca3af;">Carregando comissões...</div>`;

  try {
    const res = await API.get('/api/commissions');
    const comms = res.commissions;
    const role = state.currentUser.role;

    const commTypeLabels = {
      'seller_direct': '<span class="badge badge-gray">Vendedor Direto (10%)</span>',
      'rep_own': '<span class="badge badge-info">Representante Própria (20%)</span>',
      'rep_indirect': '<span class="badge badge-warning">Representante Indireta (5%)</span>'
    };

    const tableHtml = `
      <div class="table-card">
        <div class="table-header-box">
          <h3>Extrato Detalhado de Comissões (${comms.length})</h3>
          ${role === 'admin' ? `
            <button class="btn btn-primary btn-sm" onclick="navigate('payments')">Gerenciar Pagamentos</button>
          ` : ''}
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Código Venda</th>
                <th>Data Venda</th>
                <th>Cliente</th>
                ${role === 'admin' ? '<th>Beneficiário</th>' : ''}
                <th>Tipo de Comissão</th>
                <th>Valor da Venda</th>
                <th>% Aplicada</th>
                <th>Valor da Comissão</th>
                <th>Status</th>
                <th>Data Pagamento</th>
              </tr>
            </thead>
            <tbody>
              ${comms.length === 0 ? `
                <tr><td colspan="10" style="text-align: center; padding: 30px; color: #9ca3af;">Nenhuma comissão registrada.</td></tr>
              ` : comms.map(c => `
                <tr>
                  <td><strong>${c.sale_code}</strong></td>
                  <td>${API.formatDate(c.sale_date)}</td>
                  <td>${c.client_name}</td>
                  ${role === 'admin' ? `<td><strong>${c.beneficiary_name}</strong> (${c.beneficiary_username})</td>` : ''}
                  <td>${commTypeLabels[c.commission_type] || c.commission_type}</td>
                  <td>${API.formatMoney(c.origin_amount)}</td>
                  <td>${c.percentage_applied}%</td>
                  <td><strong style="color: #ffffff;">${API.formatMoney(c.commission_amount)}</strong></td>
                  <td>${API.getCommissionStatusBadge(c.status)}</td>
                  <td>${c.paid_at ? API.formatDate(c.paid_at) : '<span style="color:#6b7280;">Pendente</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = tableHtml;

  } catch (err) {
    container.innerHTML = `<div style="padding: 30px; text-align: center; color: #ef4444;">Erro ao carregar comissões: ${err.message}</div>`;
  }
}

// =========================================================================
// PAYMENTS VIEW (ADMIN & FINANCIAL SUMMARY)
// =========================================================================
async function renderPaymentsView() {
  const container = document.getElementById('view-container');
  container.innerHTML = `<div style="padding: 30px; text-align: center; color: #9ca3af;">Carregando pagamentos...</div>`;

  try {
    const role = state.currentUser.role;
    const paymentsRes = await API.get('/api/payments');
    const payments = paymentsRes.payments;

    let eligibleHtml = '';
    if (role === 'admin') {
      const eligibleRes = await API.get('/api/payments/eligible');
      const eligibleComms = eligibleRes.commissions;

      // Group eligible by beneficiary
      const byUser = {};
      eligibleComms.forEach(c => {
        if (!byUser[c.beneficiary_id]) {
          byUser[c.beneficiary_id] = {
            id: c.beneficiary_id,
            name: c.beneficiary_name,
            role: c.beneficiary_role,
            total: 0,
            commissions: []
          };
        }
        byUser[c.beneficiary_id].total += c.commission_amount;
        byUser[c.beneficiary_id].commissions.push(c);
      });

      const userGroups = Object.values(byUser);

      eligibleHtml = `
        <div class="card" style="margin-bottom: 24px; border-left: 4px solid #10b981;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <div>
              <h3 style="font-size: 16px; font-weight: 600; color: #ffffff;">Comissões Aprovadas Aguardando Pagamento</h3>
              <p style="font-size: 12.5px; color: #9ca3af;">Selecione um profissional para quitar comissões individuais ou agrupar várias em um único pagamento consolidado.</p>
            </div>
            <span class="badge badge-success">${eligibleComms.length} comissões prontas</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;">
            ${userGroups.length === 0 ? `
              <p style="font-size: 13px; color: #6b7280; padding: 12px;">Não há comissões aprovadas pendentes de pagamento no momento.</p>
            ` : userGroups.map(ug => `
              <div style="background: rgba(255,255,255,0.02); border: 1px solid #212631; border-radius: 8px; padding: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong>${ug.name}</strong>
                  <span class="badge ${ug.role === 'representative' ? 'badge-info' : 'badge-gray'}">${ug.role === 'representative' ? 'Representante' : 'Vendedor'}</span>
                </div>
                <div style="margin: 8px 0; font-size: 18px; font-weight: 700; color: #ffffff;">
                  ${API.formatMoney(ug.total)}
                </div>
                <div style="font-size: 12px; color: #9ca3af; margin-bottom: 12px;">
                  ${ug.commissions.length} comissão(ões) incluída(s)
                </div>
                <button class="btn btn-primary btn-sm" style="width: 100%;" onclick='openPayoutModal(${ug.id}, "${ug.name}", ${JSON.stringify(ug.commissions.map(c => c.id))}, ${ug.total})'>
                  Efetuar Pagamento
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    const historyHtml = `
      <div class="table-card">
        <div class="table-header-box">
          <h3>Histórico de Pagamentos Realizados (${payments.length})</h3>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Comprovante / Código</th>
                <th>Data Pagamento</th>
                ${role === 'admin' ? '<th>Beneficiário</th>' : ''}
                <th>Forma de Pagamento</th>
                <th>Qtd Comissões</th>
                <th>Valor Total Quitado</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${payments.length === 0 ? `
                <tr><td colspan="8" style="text-align: center; padding: 30px; color: #9ca3af;">Nenhum pagamento registrado até o momento.</td></tr>
              ` : payments.map(p => `
                <tr>
                  <td><strong>${p.payment_code}</strong></td>
                  <td>${API.formatDate(p.payment_date)}</td>
                  ${role === 'admin' ? `<td><strong>${p.beneficiary_name}</strong> (${p.beneficiary_username})</td>` : ''}
                  <td>${p.payment_method}</td>
                  <td>${p.items_count} comissões</td>
                  <td><strong style="color: #34d399;">${API.formatMoney(p.total_amount)}</strong></td>
                  <td><span class="badge badge-success">Pago</span></td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="viewPaymentReceipt(${p.id})">Recibo</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = `
      ${eligibleHtml}
      ${historyHtml}
    `;

  } catch (err) {
    container.innerHTML = `<div style="padding: 30px; text-align: center; color: #ef4444;">Erro ao carregar pagamentos: ${err.message}</div>`;
  }
}

function openPayoutModal(beneficiaryId, beneficiaryName, commIds, totalAmount) {
  openModal(
    `Confirmar Pagamento de Comissões — ${beneficiaryName}`,
    `
      <div id="payout-alert" style="display: none; padding: 10px; border-radius: 6px; margin-bottom: 14px; font-size: 13px;"></div>

      <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
        <div style="font-size: 13px; color: #d1d5db;">Beneficiário: <strong>${beneficiaryName}</strong></div>
        <div style="font-size: 20px; font-weight: 700; color: #34d399; margin-top: 4px;">Total a Pagar: ${API.formatMoney(totalAmount)}</div>
        <div style="font-size: 12px; color: #9ca3af; margin-top: 4px;">${commIds.length} comissões aprovadas serão baixadas atomicamente.</div>
      </div>

      <div class="form-group">
        <label class="form-label">Forma de Pagamento Utilizada *</label>
        <select id="payout-method" class="form-control" required>
          <option value="Pix">Pix</option>
          <option value="Transferência Bancária (TED/DOC)">Transferência Bancária (TED/DOC)</option>
          <option value="Dinheiro">Dinheiro</option>
          <option value="Outro">Outro</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Data do Pagamento *</label>
        <input type="date" id="payout-date" class="form-control" value="${new Date().toISOString().slice(0, 10)}">
      </div>

      <div class="form-group">
        <label class="form-label">Identificador da Transação / Chave Pix / Comprovante</label>
        <input type="text" id="payout-ref" class="form-control" placeholder="ex: E2E-9876543210-PIX">
      </div>

      <div class="form-group">
        <label class="form-label">Observações Internas</label>
        <textarea id="payout-notes" class="form-control" rows="2" placeholder="Informações de conciliação ou comprovante"></textarea>
      </div>
    `,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" style="background:#10b981; color:#fff;" onclick="submitPayout(${beneficiaryId}, ${JSON.stringify(commIds)})">Confirmar Quitação</button>
    `
  );
}

async function submitPayout(beneficiaryId, commIds) {
  const method = document.getElementById('payout-method').value;
  const payDate = document.getElementById('payout-date').value;
  const ref = document.getElementById('payout-ref').value.trim();
  const notes = document.getElementById('payout-notes').value.trim();
  const alertBox = document.getElementById('payout-alert');

  try {
    const res = await API.post('/api/payments', {
      beneficiary_id: beneficiaryId,
      commission_ids: commIds,
      payment_method: method,
      payment_date: payDate,
      transaction_reference: ref,
      notes
    });
    closeModal();
    showToast(`Pagamento ${res.payment.payment_code} efetuado com sucesso!`, 'success');
    renderPaymentsView();
  } catch (err) {
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
    alertBox.style.color = '#f87171';
    alertBox.innerText = err.message;
  }
}

async function viewPaymentReceipt(paymentId) {
  try {
    const res = await API.get(`/api/payments/${paymentId}`);
    const p = res.payment;

    openModal(
      `Recibo de Pagamento — ${p.payment_code}`,
      `
        <div style="border: 1px solid #212631; background: #0d0f15; border-radius: 8px; padding: 20px; font-family: monospace;">
          <div style="text-align: center; border-bottom: 1px dashed #374151; padding-bottom: 12px; margin-bottom: 14px;">
            <img src="/images/logo-dark.png" alt="Lidery Media Agency" style="height: 38px; width: auto; object-fit: contain; margin-bottom: 4px;">
            <p style="font-size: 11px; color: #9ca3af; letter-spacing: 0.5px;">Comprovante de Repasse de Comissões</p>
          </div>

          <p><strong>CÓDIGO:</strong> ${p.payment_code}</p>
          <p><strong>BENEFICIÁRIO:</strong> ${p.beneficiary_name} (${p.beneficiary_username})</p>
          <p><strong>DATA:</strong> ${API.formatDate(p.payment_date)}</p>
          <p><strong>FORMA DE PAGAMENTO:</strong> ${p.payment_method}</p>
          <p><strong>AUTORIZADO POR:</strong> ${p.admin_name}</p>
          ${p.transaction_reference ? `<p><strong>DOC/TRANS:</strong> ${p.transaction_reference}</p>` : ''}

          <div style="border-top: 1px dashed #374151; margin: 12px 0; padding-top: 8px;">
            <strong style="color: #ffffff;">Comissões Inclusas (${p.items ? p.items.length : 0}):</strong>
            <div style="margin-top: 6px; font-size: 11px;">
              ${(p.items || []).map(i => `
                <div style="display: flex; justify-content: space-between; padding: 3px 0;">
                  <span>${i.sale_code} - ${i.client_name} (${i.percentage_applied}%)</span>
                  <span><strong>${API.formatMoney(i.amount)}</strong></span>
                </div>
              `).join('')}
            </div>
          </div>

          <div style="border-top: 1px solid #374151; padding-top: 10px; margin-top: 12px; display: flex; justify-content: space-between; font-size: 14px;">
            <strong style="color: #ffffff;">VALOR TOTAL:</strong>
            <strong style="color: #34d399; font-size: 16px;">${API.formatMoney(p.total_amount)}</strong>
          </div>
        </div>
      `,
      `<button class="btn btn-secondary" onclick="closeModal()">Fechar</button>`
    );
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// =========================================================================
// REPRESENTATIVE TEAM VIEW
// =========================================================================
async function renderTeamView() {
  const container = document.getElementById('view-container');
  container.innerHTML = `<div style="padding: 30px; text-align: center; color: #9ca3af;">Carregando equipe de vendedores...</div>`;

  try {
    const res = await API.get('/api/team');
    const team = res.team;

    const bannerHtml = `
      <div class="card" style="margin-bottom: 24px;">
        <h3 style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 6px;">Minha Equipe Comercial</h3>
        <p style="font-size: 13px; color: #9ca3af;">
          Você recebe <strong>5% de comissão indireta adicional</strong> sobre todas as vendas aprovadas dos vendedores vinculados à sua equipe, sem deduzir dos 10% do vendedor.
        </p>
      </div>
    `;

    const tableHtml = `
      <div class="table-card">
        <div class="table-header-box">
          <h3>Vendedores Vinculados (${team.length})</h3>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Usuário</th>
                <th>Status</th>
                <th>Data de Vínculo</th>
                <th>Vendas Aprovadas</th>
                <th>Volume Total Vendido</th>
                <th>Comissão do Vendedor</th>
                <th>Sua Comissão Indireta (5%)</th>
              </tr>
            </thead>
            <tbody>
              ${team.length === 0 ? `
                <tr><td colspan="8" style="text-align: center; padding: 30px; color: #9ca3af;">Nenhum vendedor vinculado à sua equipe no momento. Solicite a vinculação ao administrador.</td></tr>
              ` : team.map(v => `
                <tr>
                  <td><strong>${v.full_name}</strong></td>
                  <td><code>${v.username}</code></td>
                  <td>${v.status === 'active' ? '<span class="badge badge-success">Ativo</span>' : '<span class="badge badge-danger">Inativo</span>'}</td>
                  <td>${v.linked_at ? API.formatDate(v.linked_at) : API.formatDate(v.created_at)}</td>
                  <td>${v.total_approved_sales_count}</td>
                  <td><strong>${API.formatMoney(v.total_approved_sales_volume)}</strong></td>
                  <td>${API.formatMoney(v.seller_total_commission)}</td>
                  <td><strong style="color: #60a5fa;">${API.formatMoney(v.rep_indirect_commission_generated)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = `
      ${bannerHtml}
      ${tableHtml}
    `;

  } catch (err) {
    container.innerHTML = `<div style="padding: 30px; text-align: center; color: #ef4444;">Erro ao carregar equipe: ${err.message}</div>`;
  }
}

// =========================================================================
// REPORTS & RANKING VIEW
// =========================================================================
async function renderReportsView() {
  const container = document.getElementById('view-container');
  container.innerHTML = `<div style="padding: 30px; text-align: center; color: #9ca3af;">Carregando relatórios analíticos...</div>`;

  try {
    const rankings = await API.get('/api/reports/rankings');
    const periodData = await API.get('/api/reports/period');

    const rankingsHtml = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
        <!-- Sellers Ranking -->
        <div class="table-card">
          <div class="table-header-box">
            <h3>🏆 Ranking de Vendedores</h3>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Vendedor</th>
                  <th>Vendas</th>
                  <th>Volume</th>
                  <th>Comissão</th>
                </tr>
              </thead>
              <tbody>
                ${(rankings.sellers || []).map((s, idx) => `
                  <tr>
                    <td><strong>${idx + 1}º</strong></td>
                    <td>${s.full_name}</td>
                    <td>${s.approved_sales_count}</td>
                    <td><strong>${API.formatMoney(s.total_sold)}</strong></td>
                    <td>${API.formatMoney(s.total_commission)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Reps Ranking -->
        <div class="table-card">
          <div class="table-header-box">
            <h3>🎖️ Ranking de Representantes</h3>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Representante</th>
                  <th>Próprio</th>
                  <th>Equipe</th>
                  <th>Comissão Total</th>
                </tr>
              </thead>
              <tbody>
                ${(rankings.representatives || []).map((r, idx) => `
                  <tr>
                    <td><strong>${idx + 1}º</strong></td>
                    <td>${r.full_name}</td>
                    <td>${API.formatMoney(r.own_sales_volume)}</td>
                    <td>${API.formatMoney(r.team_sales_volume)}</td>
                    <td><strong style="color: #60a5fa;">${API.formatMoney(r.total_commission)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const periodHtml = `
      <div class="table-card">
        <div class="table-header-box">
          <h3>Vendas Consolidadas por Dia</h3>
          <a href="/api/reports/export-sales" target="_blank" class="btn btn-secondary btn-sm">📥 Exportar CSV Completo</a>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Qtd Vendas</th>
                <th>Plaquinhas Vendidas</th>
                <th>Volume Total</th>
                <th>Ticket Médio</th>
                <th>Comissões Vendedores</th>
                <th>Comissões Representantes</th>
              </tr>
            </thead>
            <tbody>
              ${(periodData.report || []).length === 0 ? `
                <tr><td colspan="7" style="text-align: center; padding: 24px; color: #9ca3af;">Nenhum dado consolidado no período.</td></tr>
              ` : (periodData.report || []).map(r => `
                <tr>
                  <td><strong>${API.formatDate(r.sale_date)}</strong></td>
                  <td>${r.sales_count}</td>
                  <td>${r.plates_count} un</td>
                  <td><strong>${API.formatMoney(r.total_volume)}</strong></td>
                  <td>${API.formatMoney(r.avg_ticket)}</td>
                  <td>${API.formatMoney(r.seller_commissions)}</td>
                  <td>${API.formatMoney(r.rep_commissions)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = `
      ${rankingsHtml}
      ${periodHtml}
    `;

  } catch (err) {
    container.innerHTML = `<div style="padding: 30px; text-align: center; color: #ef4444;">Erro ao carregar relatórios: ${err.message}</div>`;
  }
}

// =========================================================================
// COMMERCIAL SETTINGS & PRODUCTS VIEW (ADMIN ONLY)
// =========================================================================
async function renderSettingsView() {
  const container = document.getElementById('view-container');
  container.innerHTML = `<div style="padding: 30px; text-align: center; color: #9ca3af;">Carregando configurações...</div>`;

  try {
    const res = await API.get('/api/settings');
    const s = res.settings;
    const products = res.products;

    const settingsFormHtml = `
      <div class="card" style="margin-bottom: 24px;">
        <h3 style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 4px;">Parâmetros de Comissões e Regras de Preço</h3>
        <p style="font-size: 12.5px; color: #9ca3af; margin-bottom: 18px;">
          * Alterações nestes parâmetros valem para <strong>vendas futuras</strong>, preservando integralmente os percentuais e cálculos de vendas e comissões já registradas.
        </p>

        <form id="settings-form" onsubmit="submitSaveSettings(event)">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
            <div class="form-group">
              <label class="form-label">Comissão do Vendedor (%)</label>
              <input type="number" id="set-seller-pct" class="form-control" step="0.5" value="${s.seller_commission_pct || 10.0}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Comissão Própria Representante (%)</label>
              <input type="number" id="set-rep-own-pct" class="form-control" step="0.5" value="${s.rep_own_commission_pct || 20.0}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Comissão Indireta Representante (%)</label>
              <input type="number" id="set-rep-ind-pct" class="form-control" step="0.5" value="${s.rep_indirect_commission_pct || 5.0}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Preço Mínimo por Plaquinha (R$)</label>
              <input type="number" id="set-min-price" class="form-control" step="1.0" value="${s.default_min_price || 70.00}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Preço Sugerido por Plaquinha (R$)</label>
              <input type="number" id="set-sug-price" class="form-control" step="1.0" value="${s.default_suggested_price || 85.00}" required>
            </div>
          </div>

          <div style="margin-top: 14px;">
            <button type="submit" class="btn btn-primary">Salvar Parâmetros Comerciais</button>
          </div>
        </form>
      </div>
    `;

    const productsHtml = `
      <div class="table-card">
        <div class="table-header-box">
          <h3>Catálogo de Produtos (${products.length})</h3>
          <button class="btn btn-primary btn-sm" onclick="openCreateProductModal()">+ Novo Produto</button>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Descrição</th>
                <th>Preço Mínimo</th>
                <th>Preço Sugerido</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${products.map(p => `
                <tr>
                  <td><strong>${p.name}</strong></td>
                  <td>${p.description || '-'}</td>
                  <td>${API.formatMoney(p.min_price)}</td>
                  <td><strong>${API.formatMoney(p.suggested_price)}</strong></td>
                  <td>${p.is_active ? '<span class="badge badge-success">Ativo</span>' : '<span class="badge badge-danger">Inativo</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = `
      ${settingsFormHtml}
      ${productsHtml}
    `;

  } catch (err) {
    container.innerHTML = `<div style="padding: 30px; text-align: center; color: #ef4444;">Erro ao carregar configurações: ${err.message}</div>`;
  }
}

async function submitSaveSettings(e) {
  e.preventDefault();
  const sellerPct = document.getElementById('set-seller-pct').value;
  const repOwnPct = document.getElementById('set-rep-own-pct').value;
  const repIndPct = document.getElementById('set-rep-ind-pct').value;
  const minPrice = document.getElementById('set-min-price').value;
  const sugPrice = document.getElementById('set-sug-price').value;

  try {
    await API.put('/api/settings', {
      seller_commission_pct: sellerPct,
      rep_own_commission_pct: repOwnPct,
      rep_indirect_commission_pct: repIndPct,
      default_min_price: minPrice,
      default_suggested_price: sugPrice
    });
    showToast('Regras comerciais atualizadas com sucesso!', 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

function openCreateProductModal() {
  openModal(
    'Cadastrar Novo Produto no Catálogo',
    `
      <div id="new-prod-alert" style="display: none; padding: 10px; border-radius: 6px; margin-bottom: 14px; font-size: 13px;"></div>

      <div class="form-group">
        <label class="form-label">Nome do Produto *</label>
        <input type="text" id="prod-name" class="form-control" placeholder="ex: Display NFC de Mesa Acrílico" required>
      </div>

      <div class="form-group">
        <label class="form-label">Descrição</label>
        <textarea id="prod-desc" class="form-control" rows="2" placeholder="Especificações técnicas ou acabamento"></textarea>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div class="form-group">
          <label class="form-label">Preço Mínimo (R$) *</label>
          <input type="number" id="prod-min" class="form-control" value="70.00" step="1.0" required>
        </div>
        <div class="form-group">
          <label class="form-label">Preço Sugerido (R$) *</label>
          <input type="number" id="prod-sug" class="form-control" value="85.00" step="1.0" required>
        </div>
      </div>
    `,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="submitCreateProduct()">Salvar Produto</button>
    `
  );
}

async function submitCreateProduct() {
  const name = document.getElementById('prod-name').value.trim();
  const desc = document.getElementById('prod-desc').value.trim();
  const minP = document.getElementById('prod-min').value;
  const sugP = document.getElementById('prod-sug').value;
  const alertBox = document.getElementById('new-prod-alert');

  try {
    await API.post('/api/products', {
      name,
      description: desc,
      min_price: minP,
      suggested_price: sugP
    });
    closeModal();
    showToast('Produto cadastrado com sucesso!', 'success');
    renderSettingsView();
  } catch (err) {
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
    alertBox.style.color = '#f87171';
    alertBox.innerText = err.message;
  }
}

// =========================================================================
// AUDIT LOGS VIEW (ADMIN ONLY)
// =========================================================================
async function renderAuditView() {
  const container = document.getElementById('view-container');
  container.innerHTML = `<div style="padding: 30px; text-align: center; color: #9ca3af;">Carregando trilha de auditoria...</div>`;

  try {
    const res = await API.get('/api/audit');
    const logs = res.logs;

    container.innerHTML = `
      <div class="table-card">
        <div class="table-header-box">
          <h3>Trilha Permanente de Auditoria (${logs.length})</h3>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Usuário</th>
                <th>Ação Executada</th>
                <th>Entidade</th>
                <th>ID</th>
                <th>Detalhes / Observações</th>
              </tr>
            </thead>
            <tbody>
              ${logs.length === 0 ? `
                <tr><td colspan="6" style="text-align: center; padding: 24px; color: #9ca3af;">Nenhum registro de auditoria.</td></tr>
              ` : logs.map(l => `
                <tr>
                  <td><code>${API.formatDate(l.created_at)}</code></td>
                  <td><strong>${l.username || 'Sistema'}</strong></td>
                  <td><span class="badge badge-gray">${l.action}</span></td>
                  <td>${l.entity_type}</td>
                  <td>${l.entity_id || '-'}</td>
                  <td style="font-size: 12px; color: #d1d5db;">${l.notes || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

  } catch (err) {
    container.innerHTML = `<div style="padding: 30px; text-align: center; color: #ef4444;">Erro ao carregar auditoria: ${err.message}</div>`;
  }
}

// =========================================================================
// PROFILE & PASSWORD CHANGE VIEW
// =========================================================================
function renderProfileView() {
  const container = document.getElementById('view-container');
  const u = state.currentUser;

  const roleLabels = {
    admin: 'Administrador Geral',
    representative: 'Representante Comercial',
    seller: 'Vendedor'
  };

  container.innerHTML = `
    <div style="max-width: 680px; margin: 0 auto;">
      <div class="card" style="margin-bottom: 24px;">
        <h3 style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 14px;">Meu Perfil Comercial</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; font-size: 13.5px;">
          <div><span style="color: #9ca3af;">Nome Completo:</span> <strong>${u.full_name}</strong></div>
          <div><span style="color: #9ca3af;">Nome de Usuário:</span> <code>${u.username}</code></div>
          <div><span style="color: #9ca3af;">Perfil de Acesso:</span> <span class="badge badge-info">${roleLabels[u.role]}</span></div>
          <div><span style="color: #9ca3af;">Status da Conta:</span> <span class="badge badge-success">Ativa</span></div>
          ${u.role === 'seller' ? `
            <div><span style="color: #9ca3af;">Representante Responsável:</span> <strong>${u.representative_name || 'Nenhum'}</strong></div>
          ` : ''}
          <div><span style="color: #9ca3af;">Data de Criação:</span> ${API.formatDate(u.created_at)}</div>
        </div>
      </div>

      <div class="card">
        <h3 style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 6px;">Segurança — Alteração de Senha</h3>
        <p style="font-size: 12.5px; color: #9ca3af; margin-bottom: 18px;">
          Para sua segurança, informe sua senha atual para confirmar a alteração.
        </p>

        <div id="prof-pw-alert" style="display: none; padding: 10px; border-radius: 6px; margin-bottom: 14px; font-size: 13px;"></div>

        <form onsubmit="submitChangeProfilePassword(event)">
          <div class="form-group">
            <label class="form-label">Senha Atual *</label>
            <input type="password" id="prof-curr-pw" class="form-control" required>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Nova Senha (mínimo 6 caracteres) *</label>
              <input type="password" id="prof-new-pw" class="form-control" required>
            </div>
            <div class="form-group">
              <label class="form-label">Confirmar Nova Senha *</label>
              <input type="password" id="prof-conf-pw" class="form-control" required>
            </div>
          </div>

          <button type="submit" class="btn btn-primary" style="margin-top: 10px;">Atualizar Senha</button>
        </form>
      </div>
    </div>
  `;
}

async function submitChangeProfilePassword(e) {
  e.preventDefault();
  const curr = document.getElementById('prof-curr-pw').value;
  const newPw = document.getElementById('prof-new-pw').value;
  const confPw = document.getElementById('prof-conf-pw').value;
  const alertBox = document.getElementById('prof-pw-alert');

  if (newPw !== confPw) {
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
    alertBox.style.color = '#f87171';
    alertBox.innerText = 'A confirmação de senha não confere.';
    return;
  }

  try {
    await API.post('/api/auth/change-password', {
      currentPassword: curr,
      newPassword: newPw
    });
    alertBox.style.display = 'none';
    document.getElementById('prof-curr-pw').value = '';
    document.getElementById('prof-new-pw').value = '';
    document.getElementById('prof-conf-pw').value = '';
    showToast('Senha atualizada com sucesso!', 'success');
  } catch (err) {
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
    alertBox.style.color = '#f87171';
    alertBox.innerText = err.message;
  }
}

// Notifications Modal
async function openNotificationsModal() {
  try {
    const res = await API.get('/api/notifications');
    const notifs = res.notifications;

    const notifRows = notifs.map(n => `
      <div style="padding: 12px; border-radius: 8px; margin-bottom: 8px; border: 1px solid ${n.is_read ? '#212631' : '#3b82f6'}; background: ${n.is_read ? 'rgba(255,255,255,0.01)' : 'rgba(59,130,246,0.08)'};">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <strong style="color: #ffffff; font-size: 13.5px;">${n.title}</strong>
          <span style="font-size: 11px; color: #9ca3af;">${API.formatDate(n.created_at)}</span>
        </div>
        <p style="font-size: 13px; color: #d1d5db;">${n.message}</p>
        ${!n.is_read ? `
          <button class="btn btn-secondary btn-sm" style="margin-top: 8px; font-size: 11px; padding: 3px 8px;" onclick="markNotificationRead(${n.id})">Marcar como lida</button>
        ` : ''}
      </div>
    `).join('');

    openModal(
      'Notificações do Sistema',
      `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <span style="font-size: 13px; color: #9ca3af;">${notifs.length} notificações registradas</span>
          ${notifs.some(n => !n.is_read) ? `
            <button class="btn btn-secondary btn-sm" onclick="markAllNotificationsRead()">Marcar todas como lidas</button>
          ` : ''}
        </div>
        <div style="max-height: 400px; overflow-y: auto;">
          ${notifRows || '<p style="text-align: center; color: #6b7280; padding: 20px;">Nenhuma notificação recebida.</p>'}
        </div>
      `,
      `<button class="btn btn-secondary" onclick="closeModal()">Fechar</button>`
    );
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function markNotificationRead(id) {
  try {
    await API.post(`/api/notifications/${id}/read`);
    state.unreadNotifications = Math.max(0, state.unreadNotifications - 1);
    updateHeaderBadges();
    openNotificationsModal();
  } catch (e) {}
}

async function markAllNotificationsRead() {
  try {
    await API.post('/api/notifications/read-all');
    state.unreadNotifications = 0;
    updateHeaderBadges();
    openNotificationsModal();
  } catch (e) {}
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
