// =============================================================
// RECEISCAN WEBSITE - API (parehong api.php ng mobile app)
// =============================================================
(function () {
  const CFG = window.RECEISCAN_CONFIG;

  function store(kind) {
    try {
      return kind === 'local' ? window.localStorage : window.sessionStorage;
    } catch (_) {
      return null;
    }
  }
  function get(kind, k) {
    try { const s = store(kind); return s ? s.getItem(k) : null; } catch (_) { return null; }
  }
  function set(kind, k, v) {
    try { const s = store(kind); if (s) { v == null ? s.removeItem(k) : s.setItem(k, v); } } catch (_) {}
  }

  // ID ng browser na ito (para sa "isang device lang")
  function deviceId() {
    let id = get('local', 'rs_device_id');
    if (!id || id.length < 16) {
      const a = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(a);
      id = 'web' + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
      set('local', 'rs_device_id', id);
    }
    return id;
  }

  const Api = {
    token: get('session', 'rs_token') || '',
    user: JSON.parse(get('session', 'rs_user') || 'null'),

    saveSession(token, user) {
      this.token = token || '';
      this.user = user || null;
      set('session', 'rs_token', token || null);
      set('session', 'rs_user', user ? JSON.stringify(user) : null);
    },

    async post(body) {
      const fd = new FormData();
      if (this.token) fd.append('session_token', this.token);
      Object.entries(body).forEach(([k, v]) => fd.append(k, v == null ? '' : String(v)));
      fd.append('app_token', CFG.APP_TOKEN);

      let res;
      try {
        res = await fetch(CFG.API_URL, { method: 'POST', body: fd });
      } catch (e) {
        throw new Error('Unable to reach the server. Please check your internet connection.');
      }
      const text = await res.text();
      if (res.status === 403) throw new Error('The hosting server blocked the request (403). Please try again later.');
      if (res.status === 401) throw new Error('Unauthorized. Check that APP_TOKEN in js/config.js matches config.php.');
      let data;
      try {
        data = JSON.parse(text);
      } catch (_) {
        throw new Error('The server returned an invalid response (HTTP ' + res.status + ').');
      }
      if (data && data.sessionExpired && body.action !== 'login') {
        this.saveSession('', null);
        window.dispatchEvent(new Event('rs-session-expired'));
      }
      return data;
    },

    async list(action, key, extra = {}) {
      const d = await this.post({ action, ...extra });
      if (!d.success) throw new Error(d.message || 'Request failed.');
      return Array.isArray(d[key]) ? d[key] : [];
    },

    login(email, password, loginAs) {
      return this.post({ action: 'login', email, password, login_as: loginAs, device_id: deviceId() });
    },
    // Create account (pareho sa sign up ng app)
    signupSendCode(email) { return this.post({ action: 'signup_send_code', email }); },
    signup(body) { return this.post({ action: 'signup', privacy_agreed: '1', ...body }); },
    signupBranches(ownerCode) { return this.list('list_branches', 'branches', { owner_code: ownerCode, free_for_admin: '1' }); },
    setPin(email, password, pin) { return this.post({ action: 'set_pin', email, password, pin }); },
    verifyPin(email, password, pin) { return this.post({ action: 'verify_pin', email, password, pin }); },
    ping() { return this.token ? this.post({ action: 'ping' }).catch(() => null) : null; },
    async logout() {
      const t = this.token;
      this.saveSession('', null);
      if (t) {
        const fd = new FormData();
        fd.append('action', 'logout');
        fd.append('session_token', t);
        fd.append('app_token', CFG.APP_TOKEN);
        try { await fetch(CFG.API_URL, { method: 'POST', body: fd }); } catch (_) {}
      }
    },

    transactions(all) { return this.list('get_transactions', 'transactions', { scope: all ? 'all' : 'mine' }); },
    duplicates() { return this.list('get_duplicates', 'duplicates'); },
    logs() { return this.list('get_logs', 'logs'); },
    users() { return this.list('list_users', 'users'); },
    branches() { return this.list('list_branches', 'branches'); },
    receiptImage(id, ref) { return this.post({ action: 'get_receipt_image', transaction_id: id || 0, reference_no: ref || '' }); },
    deleteTransaction(id, ref) { return this.post({ action: 'delete_transaction', id: id || 0, reference_no: ref || '' }); },
    branchRequests() { return this.list('list_branch_requests', 'requests'); },
    decideBranchRequest(id, approve) { return this.post({ action: 'decide_branch_request', request_id: id, decision: approve ? 'approve' : 'reject' }); },
    // Manual sales ng staff (Admin lang sa website)
    manualSales() { return this.list('get_manual_sales', 'sales'); },
    updateManualSale(id, customerName, items) { return this.post({ action: 'update_manual_sale', id, customer_name: customerName, items: JSON.stringify(items) }); },
    manualRequests() { return this.list('list_manual_requests', 'requests'); },
    decideManualRequest(id, approve) { return this.post({ action: 'decide_manual_request', request_id: id, decision: approve ? 'approve' : 'reject' }); },
    deleteManualSale(id) { return this.post({ action: 'delete_manual_sale', id }); },
    addBranch(name, password, location) { return this.post({ action: 'add_branch', name, password, location }); },
    updateBranch(branchId, name, location) { return this.post({ action: 'update_branch', branch_id: branchId, name, location }); },
    deleteBranch(branchId, password) { return this.post({ action: 'delete_branch', branch_id: branchId, password }); },
    updateBranchLocation(branchId, location) { return this.post({ action: 'update_branch_location', branch_id: branchId, location }); },
    changeBranchPassword(branchId, nw) { return this.post({ action: 'change_branch_password', branch_id: branchId, new_password: nw }); },
    addLog(action, description, userName) { return this.post({ action: 'add_log', log_action: action, description, user_name: userName }).catch(() => null); },
    resetPassword(targetId, nw) { return this.post({ action: 'reset_staff_password', target_id: targetId, new_password: nw }); },
    passwordRequests() { return this.list('list_password_requests', 'requests'); },
    dismissPasswordRequest(id) { return this.post({ action: 'dismiss_password_request', request_id: id }); },
    changePassword(cur, nw) { return this.post({ action: 'change_password', current_password: cur, new_password: nw }); },
    changePin(cur, nw) { return this.post({ action: 'change_pin', current_pin: cur, new_pin: nw }); },
    forgotRequest(email) { return this.post({ action: 'forgot_request', email }); },
    forgotReset(email, code, newPassword) { return this.post({ action: 'forgot_reset', email, code, new_password: newPassword }); },
  };

  window.Api = Api;
})();
