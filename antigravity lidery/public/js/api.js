const API = {
  getToken() {
    return localStorage.getItem('lidery_token') || '';
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('lidery_token', token);
    } else {
      localStorage.removeItem('lidery_token');
    }
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    const config = {
      ...options,
      headers
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }

    try {
      const res = await fetch(endpoint, config);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401 && !endpoint.includes('/api/auth/login')) {
          this.setToken(null);
          window.dispatchEvent(new CustomEvent('auth:expired'));
        }
        throw new Error(data.error || `Erro HTTP ${res.status}`);
      }

      return data;
    } catch (err) {
      throw err;
    }
  },

  get(endpoint, query = {}) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') {
        params.append(k, v);
      }
    }
    const qStr = params.toString();
    return this.request(qStr ? `${endpoint}?${qStr}` : endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body });
  },

  put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body });
  },

  formatMoney(amount) {
    const num = Number(amount) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    // If YYYY-MM-DD
    if (dateStr.length === 10) {
      const [y, m, d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },

  getSaleStatusBadge(status) {
    const map = {
      'pending_approval': '<span class="badge badge-warning">Aguardando Aprovação</span>',
      'approved': '<span class="badge badge-success">Aprovada</span>',
      'rejected': '<span class="badge badge-danger">Recusada</span>',
      'cancelled': '<span class="badge badge-gray">Cancelada</span>'
    };
    return map[status] || `<span class="badge badge-gray">${status}</span>`;
  },

  getPaymentStatusBadge(status) {
    const map = {
      'pending': '<span class="badge badge-warning">Pendente</span>',
      'confirmed': '<span class="badge badge-success">Confirmado</span>',
      'installments': '<span class="badge badge-info">Parcelado</span>',
      'cancelled': '<span class="badge badge-danger">Cancelado</span>'
    };
    return map[status] || `<span class="badge badge-gray">${status}</span>`;
  },

  getCommissionStatusBadge(status) {
    const map = {
      'pending_approval': '<span class="badge badge-warning">Aguardando Aprovação</span>',
      'approved': '<span class="badge badge-info">Aprovada (Pendente Pagamento)</span>',
      'paid': '<span class="badge badge-success">Paga</span>',
      'cancelled': '<span class="badge badge-danger">Cancelada</span>'
    };
    return map[status] || `<span class="badge badge-gray">${status}</span>`;
  }
};
