// =============================================================
// RECEISCAN WEBSITE - APP
// Kapareho ng mobile app ang data: iisang api.php at database.
// Ang na-scan sa app ay lumalabas dito (kusang nagre-refresh).
// =============================================================
(function () {
  const CFG = window.RECEISCAN_CONFIG;
  const Api = window.Api;
  const root = document.getElementById('root');

  // ---------------------------------------------------------------
  // MALILIIT NA HELPER
  // ---------------------------------------------------------------
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const money = (n) => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const short = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toString();
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const roleLabel = (r) => ({ owner: 'Owner', admin: 'Admin', staff: 'Staff' }[String(r || '').toLowerCase()] || 'Staff');
  const scanDate = (t) => /^\d{4}-\d{2}-\d{2}/.test(t.createdAt || '') ? t.createdAt.slice(0, 10) : (t.date || '');
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 3500);
  }

  const modal = document.getElementById('modal');
  const modalCard = document.getElementById('modal-card');
  function openModal(html) { modalCard.innerHTML = html; modal.classList.remove('hidden'); }
  function closeModal() { modal.classList.add('hidden'); modalCard.innerHTML = ''; }
  modal.addEventListener('click', (e) => { if (e.target === modal && !modal.dataset.locked) closeModal(); });

  // Mga icon (SVG)
  const ICON = {
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    logs: '<path d="M12 8v4l3 2M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"/>',
    receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    cal: '<path d="M3 5h18v16H3zM16 3v4M8 3v4M3 10h18"/>',
    copy: '<path d="M9 9h11v11H9zM5 15H4V4h11v1"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    sum: '<path d="M18 4H6l6 8-6 8h12"/>',
  };
  const svg = (k, color) => `<svg viewBox="0 0 24 24" fill="none" stroke="${color || 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

  // ---------------------------------------------------------------
  // ESTADO
  // ---------------------------------------------------------------
  const S = {
    tx: [], dups: [], logs: [], users: [], branches: [], pwReqs: [], brReqs: [], manual: [], mreqs: [], openLocs: new Set(), chipLocClosed: new Set(), txTab: 'gcash', msSearch: '', msPeriod: 'All', txPeriod: 'All',
    loaded: false, error: '', lastSync: null,
    reportMode: 'Daily', selectedBar: null, selectedBranch: null, dupsOpen: false,
    txSearch: '', txBranch: 'All', logSearch: '', logBranch: 'All', logLoc: 'All',
  };
  const role = () => String((Api.user && Api.user.role) || '').toLowerCase();
  const isOwner = () => role() === 'owner';
  const isAdmin = () => role() === 'admin';
  const isManager = () => isOwner() || isAdmin();

  // ---------------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------------
  // Website: Admin at Owner lang (ang Staff ay sa mobile app)
  const WEB_ROLES = ['admin', 'owner'];
  let loginRole = 'admin';

  function renderLogin() {
    stopTimers();
    const label = roleLabel(loginRole);
    root.innerHTML = `
      <div class="login-page">
        <form class="login-card" id="login-form" autocomplete="on">
          <div class="login-logo"><img src="img/logo.png" alt="" onerror="this.remove()"></div>
          <h1>${label} Login</h1>
          <p class="sub">Sign in with your ${label.toLowerCase()} account</p>
          <div class="role-select" id="role-select">
            ${WEB_ROLES.map((r) => `<button type="button" data-r="${r}" class="${r === loginRole ? 'on' : ''}">${roleLabel(r)}</button>`).join('')}
          </div>
          <div class="field"><label>Email</label><input id="l-email" type="email" required autocomplete="username"></div>
          <div class="field"><label>Password</label><input id="l-pass" type="password" required autocomplete="current-password"></div>
          <button class="btn block" id="l-btn" type="submit">Login as ${label}</button>
          <div style="margin-top:8px">
            <button type="button" class="link-btn" id="l-create">Create Account</button>
            <button type="button" class="link-btn" id="l-forgot">Forgot Password?</button>
            <button type="button" class="link-btn" id="l-privacy">Privacy Notice</button>
          </div>
          <p class="login-note">This website is for Admin and Owner accounts only.<br>
          Staff accounts and scanning use the ReceiScan mobile app.<br>
          One account can be logged in on one device at a time.</p>
        </form>
      </div>`;

    document.getElementById('role-select').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-r]');
      if (!b) return;
      const em = document.getElementById('l-email').value;
      loginRole = b.dataset.r;
      renderLogin();
      document.getElementById('l-email').value = em;
    });
    document.getElementById('l-forgot').onclick = forgotPassword;
    document.getElementById('l-create').onclick = () => createAccount(loginRole);
    document.getElementById('l-privacy').onclick = privacyNotice;
    document.getElementById('login-form').onsubmit = doLogin;
  }

  async function doLogin(e) {
    e.preventDefault();
    const email = document.getElementById('l-email').value.trim().toLowerCase();
    const password = document.getElementById('l-pass').value;
    const btn = document.getElementById('l-btn');
    if (!email || !password) return toast('Please enter email and password.');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    try {
      const r = await Api.login(email, password, loginRole);
      if (!r.success) throw new Error(r.message || 'Invalid email or password.');
      if ((parseInt(r.apiVersion, 10) || 0) < 7) throw new Error('The api.php on the server is outdated.');
      const u = r.user || {};
      // Sa memory muna; ise-save lang pagkatapos ng PIN
      Api.token = r.token || '';
      Api.user = {
        id: u.id, name: u.name || '', email: u.email || email, role: String(u.role || '').toLowerCase(),
        branch: u.branch || '', branchLocation: u.branchLocation || '', ownerCode: u.ownerCode || '', hasPin: !!u.hasPin,
      };
      // Website: Admin at Owner lang
      if (!WEB_ROLES.includes(Api.user.role)) {
        await Api.logout();
        throw new Error('Staff accounts can only use the ReceiScan mobile app.');
      }
      const ok = await pinStep(email, password, !!u.hasPin);
      if (!ok) { await Api.logout(); renderLogin(); return; }
      Api.saveSession(Api.token, Api.user);
      location.hash = '#/dashboard';
      renderShell();
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = `Login as ${roleLabel(loginRole)}`;
    }
  }

  // PIN pagkatapos ng password (pareho sa app)
  function pinStep(email, password, hasPin) {
    return new Promise((resolve) => {
      modal.dataset.locked = '1';
      const render = (msg) => {
        openModal(`
          <h3>${hasPin ? 'Enter Your PIN' : 'Create Your PIN'}</h3>
          <p class="muted">${hasPin ? 'Enter your 4 to 6 digit PIN to continue.' : 'Choose a 4 to 6 digit PIN. You will use it every time you log in.'}</p>
          ${msg ? `<div class="notice">${esc(msg)}</div>` : ''}
          <div class="field"><label>PIN</label><input id="p1" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>
          ${hasPin ? '' : '<div class="field"><label>Confirm PIN</label><input id="p2" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>'}
          <div class="modal-actions">
            <button class="btn ghost" id="p-cancel">Cancel</button>
            <button class="btn" id="p-ok">Continue</button>
          </div>`);
        const p1 = document.getElementById('p1');
        p1.focus();
        const digits = (el) => el && el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, ''); });
        digits(p1); digits(document.getElementById('p2'));
        document.getElementById('p-cancel').onclick = () => { delete modal.dataset.locked; closeModal(); resolve(false); };
        const submit = async () => {
          const pin = p1.value;
          if (!/^\d{4,6}$/.test(pin)) return render('PIN must be 4 to 6 digits.');
          if (!hasPin && pin !== document.getElementById('p2').value) return render('The PINs do not match.');
          try {
            const r = hasPin ? await Api.verifyPin(email, password, pin) : await Api.setPin(email, password, pin);
            if (!r.success) return render(r.message || 'Wrong PIN.');
            delete modal.dataset.locked;
            closeModal();
            resolve(true);
          } catch (err) { render(err.message); }
        };
        document.getElementById('p-ok').onclick = submit;
        p1.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      };
      render('');
    });
  }

  // Forgot Password: code sa email, tapos bagong password
  function forgotPassword() {
    openModal(`
      <h3>Forgot Password</h3>
      <p class="muted">Enter your email. We will send a 6-digit code.</p>
      <div class="field"><label>Email</label><input id="f-email" type="email"></div>
      <div id="f-step2" class="hidden">
        <div class="field"><label>6-digit code</label><input id="f-code" inputmode="numeric" maxlength="6"></div>
        <div class="field"><label>New password</label><input id="f-pass" type="password"></div>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" id="f-close">Close</button>
        <button class="btn" id="f-btn">Send Code</button>
      </div>`);
    let sent = false;
    document.getElementById('f-close').onclick = closeModal;
    document.getElementById('f-btn').onclick = async () => {
      const email = document.getElementById('f-email').value.trim().toLowerCase();
      if (!email) return toast('Please enter your email.');
      try {
        if (!sent) {
          const r = await Api.forgotRequest(email);
          toast(r.message || (r.success ? 'Code sent.' : 'Unable to send the code.'));
          if (r.success) {
            sent = true;
            document.getElementById('f-step2').classList.remove('hidden');
            document.getElementById('f-btn').textContent = 'Change Password';
          }
        } else {
          const r = await Api.forgotReset(email, document.getElementById('f-code').value.trim(), document.getElementById('f-pass').value);
          toast(r.message || (r.success ? 'Password changed.' : 'Unable to change the password.'));
          if (r.success) closeModal();
        }
      } catch (err) { toast(err.message); }
    };
  }

  function privacyNotice() {
    openModal(`
      <h3>Privacy Notice</h3>
      ${privacyBody()}
      <div class="modal-actions"><button class="btn" id="pv-close">Close</button></div>`);
    document.getElementById('pv-close').onclick = closeModal;
  }
  function privacyBody() {
    const contact = (CFG.PRIVACY_CONTACT || '').trim() || 'the Owner of your business';
    return `
      <div class="privacy">
        <p>ReceiScan follows the Data Privacy Act of 2012 (Republic Act No. 10173).</p>
        <h4>Information we collect</h4>
        <ul><li>Account details: name, email, role, branch, and your password and PIN (hashed).</li>
        <li>Receipt details: customer name, account number, amount, reference number, and the receipt image.</li>
        <li>Activity records and a random device ID (one device per account).</li></ul>
        <h4>Why we collect it</h4>
        <ul><li>To record, verify and audit payments (GCash, e-wallets and banks), detect duplicate receipts, and produce reports.</li>
        <li>To secure accounts (login, PIN, email verification, password reset).</li></ul>
        <h4>Who can see it</h4>
        <ul><li>Staff: their own scans. Admin: their branch. Owner: all branches of their business.</li>
        <li>We do not sell or share your information. Email codes are sent through EmailJS.</li></ul>
        <h4>How we protect it</h4>
        <ul><li>Hashed passwords and PINs, HTTPS, server-side role checks, login lockout, and a protected image folder.</li></ul>
        <h4>Your rights</h4>
        <p>You may access, correct, object to, or ask for deletion of your data. Contact ${esc(contact)}.</p>
      </div>`;
  }

  // ---------------------------------------------------------------
  // CREATE ACCOUNT (Admin o Owner) - pareho sa sign up ng app
  // ---------------------------------------------------------------
  const NAME_OK = /^[A-Za-zÑñ]+( [A-Za-zÑñ]+)*$/;      // letra at espasyo lang
  const PASS_OK = /^[A-Za-z1-9]+$/;                    // letra at 1-9 lang
  const OWNER_ID_OK = /^OWN-[A-Z0-9]{6}$/;

  function createAccount(role, keep) {
    const isAdm = role === 'admin';
    const label = roleLabel(role);
    openModal(`
      <h3>Create ${label} Account</h3>
      <div class="role-select" id="c-role">
        ${WEB_ROLES.map((r) => `<button type="button" data-r="${r}" class="${r === role ? 'on' : ''}">${roleLabel(r)}</button>`).join('')}
      </div>
      <p class="muted">${isAdm ? 'You need the Owner ID, a branch without an Admin, and the branch password from your Owner.' : 'Create a new business. You will get an Owner ID to give to your Admin and Staff.'}</p>
      <div class="field"><label>Full name</label><input id="c-name" autocomplete="name" placeholder="Letters and spaces only"></div>
      <div class="field"><label>Email</label>
        <div class="input-row"><input id="c-email" type="email" autocomplete="email"><button type="button" class="btn soft sm" id="c-send">Send Code</button></div></div>
      <div class="field"><label>6-digit email code</label><input id="c-code" inputmode="numeric" maxlength="6" placeholder="Check your email"></div>
      <div class="field"><label>Password</label><input id="c-pass" type="password" autocomplete="new-password" placeholder="At least 6, letters and 1-9 only"></div>
      <div class="field"><label>Confirm password</label><input id="c-pass2" type="password" autocomplete="new-password"></div>
      ${isAdm ? `
      <div class="field"><label>Owner ID</label><input id="c-owner" placeholder="OWN-XXXXXX" maxlength="10" style="text-transform:uppercase"></div>
      <div class="field"><label>Branch</label><select id="c-branch" disabled><option value="">Enter the Owner ID first</option></select>
        <div class="muted c-msg" id="c-branch-msg"></div></div>
      <div class="field"><label>Branch password</label><input id="c-bpass" type="password" autocomplete="off"></div>` : ''}
      <label class="check-row"><input type="checkbox" id="c-agree"> <span>I have read and agree to the <button type="button" class="link-btn inline" id="c-pv">Privacy Notice</button>.</span></label>
      <div id="c-pv-box" class="hidden pv-box">${privacyBody()}</div>
      <div class="modal-actions">
        <button class="btn ghost" id="c-cancel">Cancel</button>
        <button class="btn" id="c-ok">Create Account</button>
      </div>`);

    const $ = (id) => document.getElementById(id);
    // Lipat Admin <-> Owner (hindi nawawala ang na-type na)
    const KEEP = ['c-name', 'c-email', 'c-code', 'c-pass', 'c-pass2'];
    if (keep) KEEP.forEach((id) => { if (keep[id]) $(id).value = keep[id]; });
    $('c-role').onclick = (e) => {
      const b = e.target.closest('button[data-r]');
      if (!b || b.dataset.r === role) return;
      const vals = {}; KEEP.forEach((id) => { vals[id] = $(id).value; });
      clearInterval(createAccount._t);
      createAccount(b.dataset.r, vals);
    };
    $('c-cancel').onclick = () => { clearInterval(createAccount._t); closeModal(); };
    $('c-pv').onclick = () => $('c-pv-box').classList.toggle('hidden');
    $('c-code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });

    // Send Code (isang beses kada 60 segundo)
    const sendBtn = $('c-send');
    sendBtn.onclick = async () => {
      const em = $('c-email').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast('Please enter a valid email address first.');
      sendBtn.disabled = true; sendBtn.textContent = 'Sending...';
      try {
        const r = await Api.signupSendCode(em);
        toast(r.message || (r.success ? 'Code sent.' : 'Unable to send the code.'));
        if (!r.success) { sendBtn.disabled = false; sendBtn.textContent = 'Send Code'; return; }
        let wait = 60;
        clearInterval(createAccount._t);
        createAccount._t = setInterval(() => {
          const b = document.getElementById('c-send');
          if (!b) return clearInterval(createAccount._t);
          wait--;
          if (wait <= 0) { clearInterval(createAccount._t); b.disabled = false; b.textContent = 'Resend'; }
          else b.textContent = wait + 's';
        }, 1000);
        sendBtn.textContent = '60s';
      } catch (err) { toast(err.message); sendBtn.disabled = false; sendBtn.textContent = 'Send Code'; }
    };

    // Admin: kapag buo na ang Owner ID, kunin ang mga branch na wala pang Admin
    if (isAdm) {
      let loaded = '';
      let deb = null;
      const ownerEl = $('c-owner'); const sel = $('c-branch'); const msg = $('c-branch-msg');
      const reset = (text) => { sel.innerHTML = `<option value="">${esc(text)}</option>`; sel.disabled = true; };
      ownerEl.addEventListener('input', () => {
        const code = ownerEl.value.trim().toUpperCase();
        if (code === loaded) return;
        clearTimeout(deb);
        msg.textContent = '';
        if (!OWNER_ID_OK.test(code)) { loaded = ''; return reset('Enter the Owner ID first'); }
        deb = setTimeout(async () => {
          reset('Loading branches...');
          try {
            const rows = await Api.signupBranches(code);
            if (ownerEl.value.trim().toUpperCase() !== code) return;
            loaded = code;
            if (!rows.length) { reset('No available branch'); msg.textContent = 'All branches of this owner already have an Admin.'; return; }
            sel.innerHTML = '<option value="">Choose a branch</option>' + rows.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
            sel.disabled = false;
          } catch (_) {
            loaded = '';
            reset('Enter the Owner ID first');
            msg.textContent = 'Owner ID not found. Please check the code.';
          }
        }, 400);
      });
    }

    $('c-ok').onclick = async () => {
      const name = $('c-name').value.trim().replace(/\s+/g, ' ');
      const email = $('c-email').value.trim().toLowerCase();
      const pass = $('c-pass').value; const pass2 = $('c-pass2').value;
      const code = $('c-code').value.trim();
      if (!name || !email || !pass || !pass2) return toast('Please complete all fields.');
      if (!NAME_OK.test(name)) return toast('Name can only have letters and spaces. Numbers and symbols are not allowed.');
      if (pass.length < 6) return toast('Password must be at least 6 characters.');
      if (!PASS_OK.test(pass)) return toast('Password can only have letters and numbers 1-9. 0, symbols and spaces are not allowed.');
      if (pass !== pass2) return toast('Passwords do not match.');
      if (!$('c-agree').checked) return toast('Please read and agree to the Privacy Notice first.');
      if (code.length !== 6) return toast('Please enter the 6-digit code sent to your email. Click Send Code first.');
      const body = { name: name.toUpperCase(), email, password: pass, role, email_code: code };
      if (isAdm) {
        body.owner_code = $('c-owner').value.trim().toUpperCase();
        body.branch_id = $('c-branch').value;
        body.branch_password = $('c-bpass').value.trim();
        if (!body.owner_code) return toast('Please enter your Owner ID.');
        if (!body.branch_id) return toast('Please choose your branch.');
        if (!body.branch_password) return toast('Please enter the branch password.');
      }
      const ok = $('c-ok');
      ok.disabled = true; ok.textContent = 'Creating...';
      try {
        const r = await Api.signup(body);
        if (!r.success) throw new Error(r.message || 'Unable to create account.');
        clearInterval(createAccount._t);
        const ownerId = (r.user && r.user.ownerCode) || '';
        const done = () => {
          closeModal();
          loginRole = role;
          renderLogin();
          document.getElementById('l-email').value = email;
          document.getElementById('l-pass').focus();
        };
        if (ownerId) {
          openModal(`
            <h3>Your Owner ID</h3>
            <p class="muted">Give this code to your Admin and Staff so they can join your business. You can also see it later in your Profile.</p>
            <div class="owner-id">${esc(ownerId)}</div>
            <div class="modal-actions">
              <button class="btn ghost" id="oid-copy">Copy</button>
              <button class="btn" id="oid-ok">Go to Login</button>
            </div>`);
          document.getElementById('oid-copy').onclick = () => {
            try { navigator.clipboard.writeText(ownerId); toast('Owner ID copied.'); } catch (_) { toast(ownerId); }
          };
          document.getElementById('oid-ok').onclick = done;
        } else {
          toast('Account created. You can now log in.');
          done();
        }
      } catch (err) {
        toast(err.message);
        ok.disabled = false; ok.textContent = 'Create Account';
      }
    };
  }

  // ---------------------------------------------------------------
  // SHELL (sidebar + pages)
  // ---------------------------------------------------------------
  function routes() {
    if (isManager()) {
      return [
        ['dashboard', 'Dashboard', 'home'],
        ['transactions', 'Transactions', 'list'],
        ['reports', 'Reports', 'chart'],
        ['logs', 'Activity Logs', 'logs'],
        ['accounts', 'Accounts', 'users'],
        ['profile', 'Profile', 'user'],
      ];
    }
    return [
      ['dashboard', 'Home', 'home'],
      ['transactions', 'My Records', 'list'],
      ['profile', 'Profile', 'user'],
    ];
  }
  const current = () => {
    const r = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
    return routes().some((x) => x[0] === r) ? r : 'dashboard';
  };

  function renderShell() {
    const u = Api.user;
    const r = current();
    const nav = routes().map(([k, t, ic]) => `<a href="#/${k}" class="${k === r ? 'on' : ''}">${svg(ic)}<span>${t}</span></a>`).join('');
    const mobileNav = routes().filter((x) => x[0] !== 'accounts' && x[0] !== 'logs')
      .map(([k, t, ic]) => `<a href="#/${k}" class="${k === r ? 'on' : ''}">${svg(ic)}<span>${t === 'My Records' ? 'Records' : t.split(' ')[0]}</span></a>`).join('');
    root.innerHTML = `
      <div class="topbar"><img src="img/logo.png" alt="" onerror="this.remove()"><b>ReceiScan</b>
        <span class="tag" style="margin-left:auto">${roleLabel(u.role)}</span></div>
      <div class="shell">
        <aside class="sidebar">
          <div class="brand"><img src="img/logo.png" alt="" onerror="this.remove()"><b>ReceiScan</b></div>
          <nav class="nav">${nav}</nav>
          <div class="side-user"><b>${esc(u.name)}</b>${roleLabel(u.role)}${u.branch ? ' • ' + esc(u.branch) : ''}</div>
        </aside>
        <main class="main" id="page"></main>
      </div>
      <nav class="bottom-nav">${mobileNav}</nav>`;
    renderPage();
    startTimers();
    if (!S.loaded) loadAll();
  }

  function renderPage() {
    const page = document.getElementById('page');
    if (!page) return;
    const r = current();
    const pages = { dashboard: pageDashboard, transactions: pageTransactions, reports: pageReports, logs: pageLogs, accounts: pageAccounts, profile: pageProfile };
    page.innerHTML = (pages[r] || pageDashboard)();
    bindPage(r);
  }

  function head(title, sub) {
    const t = S.lastSync ? S.lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...';
    return `<div class="page-head"><div><h2>${title}</h2><p>${sub}</p></div>
      <div class="live"><i></i>Live • updated ${t}
      <button class="btn small soft" data-act="refresh">Refresh</button></div></div>
      ${S.error ? `<div class="notice">${esc(S.error)}</div>` : ''}
      ${!S.loaded ? '<div class="spinner"></div>' : ''}`;
  }

  // ---------------------------------------------------------------
  // DATA (kusang kinukuha ulit para lumabas ang bagong scan mula sa app)
  // ---------------------------------------------------------------
  async function loadAll(silent) {
    try {
      S.tx = await Api.transactions(isManager());
      if (isManager()) {
        const [d, l, u, pr, br, rq, ms, mr] = await Promise.all([
          Api.duplicates().catch(() => S.dups),
          Api.logs().catch(() => S.logs),
          Api.users().catch(() => S.users),
          isOwner() ? Api.passwordRequests().catch(() => S.pwReqs) : Promise.resolve([]),
          Api.branches().catch(() => S.branches),
          Api.branchRequests().catch(() => S.brReqs),
          Api.manualSales().catch(() => S.manual),
          isAdmin() ? Api.manualRequests().then((x) => { S.mreqErr = ''; return x; }).catch((err) => { S.mreqErr = err.message; return S.mreqs; }) : Promise.resolve([]),
        ]);
        S.dups = d; S.logs = l; S.users = u; S.pwReqs = pr; S.branches = br; S.brReqs = rq; S.manual = ms; S.mreqs = mr;
      }
      S.error = '';
      S.lastSync = new Date();
    } catch (err) {
      S.error = err.message;
    }
    S.loaded = true;
    if (Api.token) {
      // Huwag galawin ang page habang may bukas na modal o nagta-type
      const typing = document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName);
      if (!silent || (!typing && modal.classList.contains('hidden'))) renderPage();
    }
  }

  let refreshTimer = null, pingTimer = null;
  function startTimers() {
    stopTimers();
    refreshTimer = setInterval(() => loadAll(true), Math.max(10, CFG.REFRESH_SECONDS || 30) * 1000);
    pingTimer = setInterval(() => Api.ping(), 20000); // "isang device lang"
  }
  function stopTimers() { clearInterval(refreshTimer); clearInterval(pingTimer); }

  // ---------------------------------------------------------------
  // DASHBOARD
  // ---------------------------------------------------------------
  function pageDashboard() {
    const u = Api.user;
    const tx = S.tx;
    const total = tx.reduce((s, t) => s + Number(t.amount || 0), 0);
    const byDay = {}; const cntDay = {};
    tx.forEach((t) => { const k = scanDate(t); byDay[k] = (byDay[k] || 0) + Number(t.amount || 0); cntDay[k] = (cntDay[k] || 0) + 1; });
    const now = new Date();
    const week = Array.from({ length: 7 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i));
    const weekVals = week.map((d) => byDay[dateKey(d)] || 0);
    const today = dateKey(now);
    const initial = (u.name || '?').trim().charAt(0).toUpperCase();

    return `${head(isManager() ? 'Dashboard' : 'Home', `${greeting()}, ${esc((u.name || '').split(' ')[0])}`)}
      <div class="hero">
        <div class="who"><div class="avatar">${esc(initial)}</div>
          <div><small>${greeting()}</small><div class="name">${esc(u.name)}</div>
          ${!isOwner() && u.branch ? `<small>${esc(u.branch)}${u.branchLocation ? ' • 📍 ' + esc(u.branchLocation) : ''}</small>` : ''}</div>
          <span class="pill">${roleLabel(u.role)}</span></div>
        ${(() => {
          // Total Received = scanned receipts + manual sales
          const man = S.manual.reduce((x, m) => x + Number(m.total || 0), 0);
          // Ngayong araw (scanned + manual)
          const tdTx = tx.filter((t) => scanDate(t) === today);
          const tdR = tdTx.reduce((x, t) => x + Number(t.amount || 0), 0);
          const tdM = S.manual.filter((m) => String(m.createdAt || '').startsWith(today));
          const tdMs = tdM.reduce((x, m) => x + Number(m.total || 0), 0);
          return `<div style="margin-top:16px"><small>Today Receipt</small><div class="big">₱${money(tdR + tdMs)}</div>
            <div class="hero-split"><span>Scanned ₱${money(tdR)} • ${tdTx.length}</span><span>Manual ₱${money(tdMs)} • ${tdM.length}</span></div></div>
            <div class="hero-total"><small>Total Amount</small><b>₱${money(total + man)}</b><div class="muted-w">Scanned ₱${money(total)} • ${tx.length} &nbsp; Manual ₱${money(man)} • ${S.manual.length}</div></div>`;
        })()}
      </div>
      <div class="grid k4 mt">
        ${statCard('receipt', 'var(--blue)', isManager() ? 'Transactions' : 'My Scans', tx.length, 'All time • View all', 'data-act="goTx"')}
        ${statCard('cal', 'var(--blue)', 'Today', '₱' + short(byDay[today] || 0), (cntDay[today] || 0) + ' receipt(s) • Calendar', 'data-act="calendar"')}
        ${statCard('chart', 'var(--blue)', 'Last 7 days', '₱' + short(weekVals.reduce((a, b) => a + b, 0)), 'Received • View daily', 'data-act="goWeek"')}
        ${isManager() ? statCard('copy', 'var(--blue)', 'Duplicate attempts', S.dups.length, S.dups.length ? 'Click to view' : 'Blocked receipts', S.dups.length ? 'data-act="dups"' : '') : statCard('check', 'var(--blue)', 'Average', '₱' + short(tx.length ? total / tx.length : 0), 'Per receipt')}
      </div>
      ${isManager() ? (() => {
        const logsToday = S.logs.filter((l) => String(l.created || '').slice(0, 10) === today).length;
        const brCard = isOwner()
          ? statCard('home', 'var(--blue)', 'Branches', S.branches.length, (S.brReqs.length ? S.brReqs.length + ' request(s) • ' : '') + 'Manage branches', 'data-act="goBranches"')
          : statCard('home', 'var(--blue)', 'Your Branch', u.branch || '—', ((S.brReqs.length + S.mreqs.length) ? (S.brReqs.length + S.mreqs.length) + ' request(s) • ' : '') + 'View requests', 'data-act="goBranches"');
        return `<div class="grid k2 mt">
          ${brCard}
          ${statCard('logs', 'var(--blue)', 'Activity Logs', S.logs.length, logsToday + ' today • View logs', 'data-act="goLogs"')}
        </div>
        ${isAdmin() ? `<div class="grid k2 mt">
          ${statCard('receipt', 'var(--blue)', 'Manual Records', S.manual.length, '₱' + short(S.manual.reduce((a, m) => a + Number(m.total || 0), 0)) + ' • View and edit', 'data-act="goManual"')}
        </div>` : ''}`;
      })() : ''}`;
  }
  function statCard(ic, color, label, value, note, attrs = '') {
    return `<div class="card stat ${attrs ? 'clickable' : ''}" ${attrs}><div class="ic" style="background:color-mix(in srgb, ${color} 12%, white)">${svg(ic, color)}</div>
      <div class="v">${esc(value)}</div><div class="l">${esc(label)}</div><div class="n">${esc(note)}</div></div>`;
  }

  // ---------------------------------------------------------------
  // TRANSACTIONS / MY RECORDS
  // ---------------------------------------------------------------
  function txRow(t, compact) {
    const idx = S.tx.indexOf(t);
    return `<tr class="click" data-tx="${idx}">
      <td><b>${esc(t.accountName || 'Unknown')}</b><div class="muted">Ref: ${esc(t.reference)}${t.senderNumber ? ' • ' + esc(t.senderNumber) : ''}</div>
        ${!compact && isManager() ? `<div class="muted">${esc(t.scannedBy)}${t.branch ? ' • ' + esc(t.branch) : ''}</div>` : ''}</td>
      ${compact ? '' : `<td class="hide-sm muted">${esc(t.date)} ${esc(t.time)}</td>`}
      <td style="text-align:right"><div class="amt">₱${money(t.amount)}</div>${t.hasImage ? '<span class="tag">View receipt</span>' : ''}</td>
    </tr>`;
  }

  // ---------------------------------------------------------------
  // EXPORT: Excel at PDF (Owner: lahat ng branch, Admin: branch niya)
  // Ang server na ang nagsasala kung anong branch ang nakikita.
  // ---------------------------------------------------------------
  function expButtons(kind) {
    return `<div class="exp-btns">
      <button class="btn soft small" data-exp="${kind}" data-fmt="xlsx" title="Download as Excel">⬇ Excel</button>
      <button class="btn soft small" data-exp="${kind}" data-fmt="pdf" title="Download as PDF">⬇ PDF</button></div>`;
  }
  function expScope() { return isOwner() ? 'All branches' : (Api.user.branch || 'Your branch'); }
  function expFile(name) {
    const sc = expScope().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return `ReceiScan_${name}_${sc}_${dateKey(new Date())}`;
  }
  // ---- Bar graph na DAILY / MONTHLY / YEARLY ----
  // entries: [{ d: 'YYYY-MM-DD', b: branch, a: amount }]
  // Owner (lahat ng branch): isang kulay bawat branch • Admin: branch niya lang
  const BR_COLORS = ['0869EE', '38BDF8', '1E3A8A', '60A5FA', '0EA5E9', '93C5FD', '2563EB', '7DD3FC', '1D4ED8', 'BAE6FD'];
  function periodGraphs(entries, what, ownerPick) {
    const ok = entries.filter((e) => /^\d{4}-\d{2}-\d{2}/.test(e.d || ''));
    const multi = isOwner() && (!ownerPick || ownerPick === 'All');
    const brName = isOwner() ? (multi ? 'All branches' : ownerPick) : (Api.user.branch || 'Your branch');
    const branches = multi ? [...new Set(ok.map((e) => e.b || 'No Branch'))].sort() : [brName];
    const modes = [
      { mode: 'Daily', key: (d) => d.slice(0, 10), keep: 31, label: (k) => `${MONTHS[+k.slice(5, 7) - 1]} ${+k.slice(8, 10)}, ${k.slice(0, 4)}` },
      { mode: 'Monthly', key: (d) => d.slice(0, 7), keep: 12, label: (k) => `${MONTHS[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}` },
      { mode: 'Yearly', key: (d) => d.slice(0, 4), keep: 10, label: (k) => k },
    ];
    return modes.map((m) => {
      const by = {};
      ok.forEach((e) => {
        const k = m.key(e.d); const b = multi ? (e.b || 'No Branch') : brName;
        (by[k] = by[k] || {}); by[k][b] = (by[k][b] || 0) + Number(e.a || 0);
      });
      const keys = Object.keys(by).sort().slice(-m.keep);
      const r2 = (v) => Math.round(v * 100) / 100;
      const head = multi ? ['Period', ...branches, 'Total'] : ['Period', 'Amount'];
      const rows = keys.map((k) => {
        const vals = branches.map((b) => r2(by[k][b] || 0));
        return multi ? [m.label(k), ...vals, r2(vals.reduce((a, v) => a + v, 0))] : [m.label(k), vals[0]];
      });
      const valCols = branches.map((_, i) => i + 1);
      const colors = multi ? BR_COLORS : ['0869EE'];
      const title = `${what} - ${m.mode} (${multi ? 'per branch' : brName})`;
      const totals = ['TOTAL', ...head.slice(1).map((_, i) => r2(rows.reduce((a, r) => a + r[i + 1], 0)))];
      return {
        sheet: { name: `${m.mode} Graph`, rows: [head, ...rows, totals], moneyCols: head.map((_, i) => i).slice(1), widths: [16, ...head.slice(1).map(() => 15)],
          chart: { title, catCol: 0, valCols, first: 1, last: rows.length, colors, at: { col: head.length + 1, row: 1, w: 13, h: 22 } } },
        pdf: { heading: `${m.mode} (${multi ? 'per branch' : brName})`, rows: [head, ...rows], moneyCols: head.map((_, i) => i).slice(1), totals,
          chart: { title, labels: rows.map((r) => r[0]), series: branches.map((b, i) => ({ name: b, color: colors[i % colors.length], values: rows.map((r) => r[i + 1]) })) } },
      };
    });
  }

  // Isang sheet na "Graphs": Daily, Monthly at Yearly na magkakasunod,
  // bawat isa may sariling table at bar graph sa tabi
  function graphsSheet(G) {
    const rows = []; const bold = []; const charts = []; let width = 2;
    G.forEach((g) => {
      const sh = g.sheet; const ch = sh.chart;
      const start = rows.length;
      rows.push([g.pdf.heading.toUpperCase()]); // pamagat ng section
      bold.push(start + 1);
      sh.rows.forEach((r, i) => rows.push(r));
      width = Math.max(width, sh.rows[0].length);
      if (sh.rows.length > 2) {
        charts.push(Object.assign({}, ch, { headRow: start + 1, first: start + 2, last: start + 1 + (sh.rows.length - 2), at: { col: 0, row: 0, w: 13, h: 20 } }));
        charts[charts.length - 1]._start = start;
      }
      // espasyo para hindi magpatong ang mga graph
      const used = rows.length - start;
      for (let k = used; k < 24; k++) rows.push([]);
      rows.push([]);
    });
    charts.forEach((c) => { c.at = { col: width + 1, row: c._start, w: 13, h: 21 }; delete c._start; });
    const moneyCols = []; for (let i = 1; i < width; i++) moneyCols.push(i);
    return { name: 'Graphs (Daily-Monthly-Yearly)', rows, boldRows: bold, moneyCols, widths: [18, ...moneyCols.map(() => 15)], charts };
  }

  function doExport(kind, fmt) {
    if (!window.Exporter) return toast('Export is not loaded. Please refresh the page (Ctrl + F5).');
    const num = (v) => Math.round(Number(v || 0) * 100) / 100;
    if (kind === 'tx') {
      const list = S.expTx || [];
      const head = ['Date & Time', 'Account Name', 'Account Number', 'Amount', 'Reference No.', 'Receipt Type', 'Branch', 'Location', 'Scanned by'];
      const rows = list.map((t) => [t.createdAt || (t.date + ' ' + t.time), t.accountName || '', t.senderNumber || '', num(t.amount), t.reference || '', t.receiptType || '', t.branch || '', t.branchLocation || '', t.scannedBy || '']);
      const total = rows.reduce((a, r) => a + r[3], 0);
      const filt = [S.txPeriod !== 'All' ? S.txPeriod : 'All dates', isOwner() && S.txBranch !== 'All' ? S.txBranch : expScope()].join(' • ');
      const G = periodGraphs(list.map((t) => ({ d: scanDate(t), b: t.branch, a: t.amount })), 'Scanned Receipts', S.txBranch);
      if (fmt === 'xlsx') {
        Exporter.xlsx(expFile('Scanned_Receipts'), [
          graphsSheet(G),
          { name: 'Scanned Receipts', rows: [head, ...rows, ['TOTAL', `${rows.length} receipt(s)`, '', num(total)]], moneyCols: [3], widths: [20, 22, 20, 14, 18, 14, 18, 18, 16] },
        ]);
      } else {
        Exporter.pdf('Scanned Receipts', filt, [...G.map((x) => x.pdf), { heading: 'All scanned receipts', rows: [head.filter((_, i) => i !== 7), ...rows.map((r) => r.filter((_, i) => i !== 7))], moneyCols: [3], totals: ['TOTAL', `${rows.length} receipt(s)`, '', num(total), '', '', '', ''] }]);
      }
    } else if (kind === 'ms') {
      const list = S.expMs || [];
      const items = (m) => (Array.isArray(m.items) ? m.items : []).map((i) => `${i.name} x${i.qty} @ ${money(i.price)}`).join(', ');
      const head = ['Date & Time', 'Customer', 'Items', 'Total', 'Branch', 'Entered by'];
      const rows = list.map((m) => [m.createdAt || '', m.customerName || 'Walk-in customer', items(m), num(m.total), m.branch || '', m.staffName || '']);
      const total = rows.reduce((a, r) => a + r[3], 0);
      const filt = [S.msPeriod !== 'All' ? S.msPeriod : 'All dates', isOwner() && S.msBranch && S.msBranch !== 'All' ? S.msBranch : expScope()].join(' • ');
      const G = periodGraphs(list.map((m) => ({ d: String(m.createdAt || '').slice(0, 10), b: m.branch, a: m.total })), 'Manual Sales', S.msBranch);
      if (fmt === 'xlsx') {
        Exporter.xlsx(expFile('Manual_Sales'), [
          graphsSheet(G),
          { name: 'Manual Sales', rows: [head, ...rows, ['TOTAL', `${rows.length} sale(s)`, '', num(total)]], moneyCols: [3], widths: [20, 22, 50, 14, 18, 16] },
        ]);
      } else {
        Exporter.pdf('Manual Sales (not scanned receipts)', filt, [...G.map((x) => x.pdf), { heading: 'All manual sales', rows: [head, ...rows], moneyCols: [3], totals: ['TOTAL', `${rows.length} sale(s)`, '', num(total), '', ''] }]);
      }
    } else if (kind === 'rep') {
      const R = S.repExp;
      if (!R) return;
      const set = new Set(R.keys);
      const byM = {}; const byMB = {};
      S.manual.forEach((m) => {
        const k = keyOf(String(m.createdAt || '').slice(0, 10));
        if (!set.has(k)) return;
        const a = Number(m.total || 0); const br = m.branch || 'No Branch';
        (byM[k] = byM[k] || { t: 0, c: 0 }); byM[k].t += a; byM[k].c++;
        (byMB[br] = byMB[br] || { t: 0, c: 0 }); byMB[br].t += a; byMB[br].c++;
      });
      const z = { t: 0, c: 0 };
      // Kada araw/buwan/taon
      const per = [['Period', 'Scanned Amount', 'Scanned Receipts', 'Manual Amount', 'Manual Sales', 'Total Amount']];
      R.keys.slice().reverse().forEach((k) => { const r = R.byB[k] || z, m = byM[k] || z; per.push([longLabel(k), num(r.t), r.c, num(m.t), m.c, num(r.t + m.t)]); });
      const sumCol = (i) => per.slice(1).reduce((a, r) => a + r[i], 0);
      const perTot = ['TOTAL', num(sumCol(1)), sumCol(2), num(sumCol(3)), sumCol(4), num(sumCol(5))];
      // Kada branch
      const byRB = {};
      Object.values(R.byKB).forEach((kb) => Object.entries(kb).forEach(([b, a]) => { (byRB[b] = byRB[b] || { t: 0, c: 0 }); byRB[b].t += a.t; byRB[b].c += a.c; }));
      const names = [...new Set([...Object.keys(byRB), ...Object.keys(byMB)])].sort();
      const loc = (b) => ((S.branches.find((x) => x.name === b) || {}).location || '');
      const br = [['Branch', 'Location', 'Scanned Amount', 'Scanned Receipts', 'Manual Amount', 'Manual Sales', 'Total Amount']];
      names.forEach((b) => { const r = byRB[b] || z, m = byMB[b] || z; br.push([b, loc(b), num(r.t), r.c, num(m.t), m.c, num(r.t + m.t)]); });
      const sumB = (i) => br.slice(1).reduce((a, r) => a + r[i], 0);
      const brTot = ['TOTAL', '', num(sumB(2)), sumB(3), num(sumB(4)), sumB(5), num(sumB(6))];
      // Top scanners
      const sc = [['Scanner', 'Branch', 'Amount', 'Receipts']];
      R.scanners.forEach(([k, a]) => { const [n, b] = k.split('\u0001'); sc.push([n, b || 'No Branch', num(a.t), a.c]); });
      const sub = `${R.range} • ${expScope()}`;
      // Bar graph: Daily / Monthly / Yearly ng Total Amount (scanned + manual)
      const G = periodGraphs([
        ...S.tx.map((t) => ({ d: scanDate(t), b: t.branch, a: t.amount })),
        ...S.manual.map((m) => ({ d: String(m.createdAt || '').slice(0, 10), b: m.branch, a: m.total })),
      ], 'Total Amount', 'All');
      const sumTitle = `${S.reportMode} Summary (${R.range})`;
      if (fmt === 'xlsx') {
        const sheets = [graphsSheet(G),
          { name: S.reportMode + ' Summary', rows: [...per, perTot], moneyCols: [1, 3, 5], widths: [22, 16, 16, 16, 14, 16] }];
        if (isOwner()) sheets.push({ name: 'Per Branch', rows: [...br, brTot], moneyCols: [2, 4, 6], widths: [22, 20, 16, 16, 16, 14, 16] });
        sheets.push({ name: 'Top Scanners', rows: sc, moneyCols: [2], widths: [22, 20, 16, 12] });
        Exporter.xlsx(expFile('Report_' + S.reportMode), sheets);
      } else {
        const secs = [...G.map((x) => x.pdf), { heading: sumTitle, rows: per, moneyCols: [1, 3, 5], totals: perTot }];
        if (isOwner()) secs.push({ heading: 'Per Branch', rows: br, moneyCols: [2, 4, 6], totals: brTot });
        secs.push({ heading: 'Top Scanners', rows: sc, moneyCols: [2] });
        Exporter.pdf(`${S.reportMode} Report`, sub, secs);
      }
    }
    Api.addLog('Report Exported', `${Api.user.name} exported ${kind === 'tx' ? 'scanned receipts' : kind === 'ms' ? 'manual sales' : S.reportMode.toLowerCase() + ' report'} as ${fmt === 'xlsx' ? 'Excel' : 'PDF'} (${expScope()}).`, Api.user.name);
  }

  // Admin: GCash Receipts | Manual Sales (magkahiwalay)
  function txTabs() {
    if (!isManager()) return '';
    return `<div class="seg" id="tx-tabs" style="margin-bottom:14px">
      <button data-txtab="gcash" class="${S.txTab === 'gcash' ? 'on' : ''}">Scanned Receipts</button>
      <button data-txtab="manual" class="${S.txTab === 'manual' ? 'on' : ''}">Manual Records${S.manual.length ? ' (' + S.manual.length + ')' : ''}</button>
    </div>`;
  }

  // Location ng isang branch (galing sa Branches, o sa mga resibo)
  function branchLoc(name) {
    const b = S.branches.find((x) => x.name === name);
    if (b && b.location) return b.location;
    const t = S.tx.find((x) => x.branch === name && x.branchLocation);
    return t ? t.branchLocation : '';
  }
  // Owner: mga branch na nakapangkat ayon sa LOCATION (hal. MARIKINA NCR, BATANGAS)
  //   names: listahan ng branch • per: {branch: {t, c}} • sel: napili • attr: data-attribute
  function locChips(names, per, sel, attr, allCnt, allSum, id) {
    const chip = (key, name, c, t) => `<button class="br-chip ${sel === key ? 'on' : ''}" data-${attr}="${esc(key)}">
        <span class="br-name">${esc(name)}</span><span class="br-meta">${c} • ₱${short(t)}</span></button>`;
    const groups = {};
    names.forEach((b) => { const l = branchLoc(b) || 'OTHER BRANCHES'; (groups[l] = groups[l] || []).push(b); });
    const locs = Object.keys(groups).sort((a, b) => (a === 'OTHER BRANCHES') - (b === 'OTHER BRANCHES') || a.localeCompare(b));
    return `<div class="loc-chips"${id ? ` id="${id}"` : ''}>
      <div class="br-chips">${chip('All', 'All branches', allCnt, allSum)}</div>
      ${locs.map((l) => {
        const list = groups[l].sort();
        const c = list.reduce((a, b) => a + ((per[b] || {}).c || 0), 0);
        const t = list.reduce((a, b) => a + ((per[b] || {}).t || 0), 0);
        const closed = S.chipLocClosed.has(l) && !list.includes(sel);
        return `<div class="lcg">
          <button class="lcg-head" data-chiploc="${esc(l)}"><span class="lcg-arrow">${closed ? '▸' : '▾'}</span> 📍 <b>${esc(l)}</b>
            <span class="lcg-meta">${list.length} branch${list.length === 1 ? '' : 'es'} • ${c} • ₱${short(t)}</span></button>
          ${closed ? '' : `<div class="br-chips">${list.map((b) => chip(b, b, (per[b] || { c: 0 }).c, (per[b] || { t: 0 }).t)).join('')}</div>`}
        </div>`;
      }).join('')}
    </div>`;
  }

  // Today Receipt card (kapareho ng Dashboard): ginagamit sa Reports at Transactions
  function todayHero(txList, manList, scope) {
    const td = dateKey(new Date());
    const tdTx = txList.filter((t) => scanDate(t) === td);
    const tdR = tdTx.reduce((x, t) => x + Number(t.amount || 0), 0);
    const tdM = manList.filter((m) => String(m.createdAt || '').startsWith(td));
    const tdMs = tdM.reduce((x, m) => x + Number(m.total || 0), 0);
    const all = txList.reduce((x, t) => x + Number(t.amount || 0), 0);
    const man = manList.reduce((x, m) => x + Number(m.total || 0), 0);
    return `<div class="hero mt">
      <div class="hero-top"><small>Today Receipt</small>${scope ? `<span class="pill">${esc(scope)}</span>` : ''}</div>
      <div class="big">₱${money(tdR + tdMs)}</div>
      <div class="hero-split"><span>Scanned ₱${money(tdR)} • ${tdTx.length}</span><span>Manual ₱${money(tdMs)} • ${tdM.length}</span></div>
      <div class="hero-total"><small>Total Amount</small><b>₱${money(all + man)}</b><div class="muted-w">Scanned ₱${money(all)} • ${txList.length} &nbsp; Manual ₱${money(man)} • ${manList.length}</div></div></div>`;
  }

  function pageTransactions() {
    if (isManager() && S.txTab === 'manual') return pageManualSales();
    const q = S.txSearch.toLowerCase();
    const branches = [...new Set(S.tx.map((t) => t.branch || 'No Branch'))].sort();
    let list = S.tx.filter((t) => inPeriod(S.txPeriod, scanDate(t)) && (!q || [t.accountName, t.reference, t.senderNumber, t.scannedBy, t.branch].join(' ').toLowerCase().includes(q)));
    // Owner: bilang at total ng bawat branch (para sa mga button)
    const per = {};
    list.forEach((t) => { const b = t.branch || 'No Branch'; (per[b] = per[b] || { t: 0, c: 0 }); per[b].t += Number(t.amount || 0); per[b].c++; });
    const allSum = list.reduce((s, t) => s + Number(t.amount || 0), 0);
    if (isOwner() && S.txBranch !== 'All' && !branches.includes(S.txBranch)) S.txBranch = 'All';
    if (isOwner() && S.txBranch !== 'All') list = list.filter((t) => (t.branch || 'No Branch') === S.txBranch);
    const sum = list.reduce((s, t) => s + Number(t.amount || 0), 0);
    S.expTx = list; // para sa Export (Excel/PDF): kung ano ang nakikita
    return `${head(isManager() ? 'Transactions' : 'My Records', isManager() ? (isOwner() ? 'All branches' : 'Your branch') : 'Receipts you scanned')}
      ${txTabs()}
      ${(() => {
        // Owner: sundin ang napiling branch
        const pick = isOwner() && S.txBranch !== 'All' ? S.txBranch : null;
        const hx = pick ? S.tx.filter((t) => (t.branch || 'No Branch') === pick) : S.tx;
        const hm = pick ? S.manual.filter((m) => (m.branch || 'No Branch') === pick) : S.manual;
        return todayHero(hx, hm, isOwner() ? (pick || 'All branches') : (isAdmin() ? (Api.user.branch || '') : ''));
      })()}
      <div class="card mt">
        <div class="toolbar">
          <input id="tx-search" placeholder="Search name, reference, number, scanner..." value="${esc(S.txSearch)}">
          ${isManager() ? expButtons('tx') : ''}
        </div>
        <div class="seg" id="tx-period" style="margin-bottom:10px">${['All', 'Today', 'This Week', 'This Month'].map((p) => `<button data-txp="${p}" class="${S.txPeriod === p ? 'on' : ''}">${p}</button>`).join('')}</div>
        ${isOwner() && branches.length ? locChips(branches, per, S.txBranch, 'txbranch', Object.values(per).reduce((a, x) => a + x.c, 0), allSum, 'br-chips') : ''}
        <p class="hint">${isOwner() && S.txBranch !== 'All' ? `<b>${esc(S.txBranch)}</b> • ` : ''}${S.txPeriod !== 'All' ? esc(S.txPeriod) + ' • ' : ''}${list.length} receipt(s) • ₱${money(sum)}</p>
        ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Receipt</th><th class="hide-sm">Date &amp; time</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>${list.map((t) => txRow(t, false)).join('')}</tbody></table></div>` : '<div class="empty">No receipts found.</div>'}
      </div>`;
  }

  // ---------------------------------------------------------------
  // MANUAL SALES (Admin lang): mga mano-manong benta ng staff sa branch
  // HIWALAY sa GCash receipts. Admin lang ang nakaka-edit at nakakabura.
  // ---------------------------------------------------------------
  const msItems = (m) => (Array.isArray(m.items) ? m.items : []);
  function msInPeriod(m) { return inPeriod(S.msPeriod, m.createdAt); }
  // All / Today / This Week (Lunes-Linggo) / This Month
  function inPeriod(period, dateStr) {
    if (period === 'All') return true;
    const d = new Date(String(dateStr || '').slice(0, 10) + 'T00:00:00');
    if (isNaN(d)) return false;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (period === 'Today') return +day === +today;
    if (period === 'This Week') {
      const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      const next = new Date(mon); next.setDate(mon.getDate() + 7);
      return day >= mon && day < next;
    }
    return day.getFullYear() === today.getFullYear() && day.getMonth() === today.getMonth();
  }
  function pageManualSales() {
    const q = S.msSearch.toLowerCase();
    const brOf = (m) => m.branch || 'No Branch';
    let list = S.manual.filter((m) => msInPeriod(m) && (!q || [m.customerName, m.staffName, m.branch, ...msItems(m).map((i) => i.name)].join(' ').toLowerCase().includes(q)));
    // Owner: hiwa-hiwalay kada branch (mga button)
    const per = {};
    list.forEach((m) => { const b = brOf(m); (per[b] = per[b] || { t: 0, c: 0 }); per[b].t += Number(m.total || 0); per[b].c++; });
    const brNames = [...new Set([...S.branches.map((b) => b.name), ...S.manual.map(brOf)])].sort();
    if (!S.msBranch || (S.msBranch !== 'All' && !brNames.includes(S.msBranch))) S.msBranch = 'All';
    const allSum = list.reduce((a, m) => a + Number(m.total || 0), 0), allCnt = list.length;
    if (isOwner() && S.msBranch !== 'All') list = list.filter((m) => brOf(m) === S.msBranch);
    S.expMs = list; // para sa Export (Excel/PDF)
    const sum = list.reduce((a, m) => a + Number(m.total || 0), 0);
    return `${head('Transactions', isOwner() ? 'All branches' : 'Your branch')}
      ${txTabs()}
      <div class="hero"><small>Manual Sales Total • not included in scanned receipts</small><div class="big">₱${money(sum)}</div><small>${list.length} sale(s)</small></div>
      <div class="card mt">
        <div class="toolbar"><input id="ms-search" placeholder="Search customer, item, staff..." value="${esc(S.msSearch)}">${expButtons('ms')}</div>
        <div class="seg" id="ms-period" style="margin-bottom:10px">${['All', 'Today', 'This Week', 'This Month'].map((p) => `<button data-msp="${p}" class="${S.msPeriod === p ? 'on' : ''}">${p}</button>`).join('')}</div>
        ${isOwner() && brNames.length ? `${locChips(brNames, per, S.msBranch, 'msbranch', allCnt, allSum)}
        <p class="hint">${S.msBranch !== 'All' ? `<b>${esc(S.msBranch)}</b> • ` : ''}${list.length} sale(s) • ₱${money(sum)}</p>` : ''}
        ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Sale</th><th class="hide-sm">Entered by</th><th class="hide-sm">Date &amp; time</th><th style="text-align:right">Total</th></tr></thead><tbody>
          ${list.map((m) => `<tr class="click" data-ms="${S.manual.indexOf(m)}">
            <td><b>${esc(m.customerName || 'Walk-in customer')}</b><div class="muted">${esc(msItems(m).map((i) => i.name + ' ×' + i.qty).join(', ') || 'No items')}</div>
              <div class="muted show-sm">${esc(m.staffName)} • ${esc(brOf(m))} • ${esc(m.createdAt)}</div></td>
            <td class="hide-sm">${esc(m.staffName)}<div class="muted">${esc(brOf(m))}${branchLoc(brOf(m)) ? ' • 📍 ' + esc(branchLoc(brOf(m))) : ''}</div></td>
            <td class="hide-sm muted">${esc(m.createdAt)}</td>
            <td style="text-align:right"><div class="amt">₱${money(m.total)}</div><span class="tag">Manual</span>${m.pendingRequest ? `<div><span class="tag orange">${m.pendingRequest === 'delete' ? 'Delete' : 'Edit'} requested</span></div>` : ''}${m.editAllowed ? '<div><span class="tag">Edit approved</span></div>' : ''}</td></tr>`).join('')}
        </tbody></table></div>` : `<div class="empty">${isOwner() ? 'No manual sales for this branch yet.' : 'No manual sales from your staff yet.'}</div>`}
      </div>`;
  }
  function openManualSale(m) {
    if (!m) return;
    openModal(`
      <h3>Manual Sale</h3>
      <div class="kv">
        <span>Customer</span><b>${esc(m.customerName || 'Walk-in customer')}</b>
        <span>Entered by</span><b>${esc(m.staffName)}</b>
        <span>Branch</span><b>${esc(m.branch || 'No Branch')}</b>
        ${branchLoc(m.branch) ? `<span>Location</span><b>${esc(branchLoc(m.branch))}</b>` : ''}
        <span>Date</span><b>${esc(m.createdAt)}</b>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>
        ${msItems(m).map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.qty)}</td><td>₱${money(i.price)}</td><td style="text-align:right">₱${money(i.subtotal)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="bar-detail" style="margin-top:10px"><span>Total</span><span class="amt">₱${money(m.total)}</span></div>
      <p class="muted">Manual sale • not a scanned receipt</p>
      <div class="modal-actions">
        ${isAdmin() ? '<button class="btn danger" id="ms-del">Delete</button><button class="btn soft" id="ms-edit">Edit</button>' : ''}
        <button class="btn" id="ms-close">Close</button>
      </div>`);
    document.getElementById('ms-close').onclick = closeModal;
    if (!isAdmin()) return; // Owner: tingin lang (Admin ang nag-e-edit)
    document.getElementById('ms-edit').onclick = () => editManualSale(m);
    document.getElementById('ms-del').onclick = async () => {
      if (!confirm(`Delete this manual sale of ₱${money(m.total)}? This cannot be undone.`)) return;
      try {
        const r = await Api.deleteManualSale(m.id);
        if (!r.success) throw new Error(r.message || 'Unable to delete.');
        Api.addLog('Manual Sale Deleted', `${Api.user.name} deleted a manual sale of ₱${money(m.total)}${m.staffName ? ' entered by ' + m.staffName : ''}.`, Api.user.name);
        toast('Manual sale deleted.'); closeModal(); loadAll();
      } catch (err) { toast(err.message); }
    };
  }
  function editManualSale(m) {
    const rows = msItems(m).map((i) => ({ name: i.name, qty: i.qty, price: i.price }));
    if (!rows.length) rows.push({ name: '', qty: 1, price: '' });
    let customer = m.customerName || '';
    const draw = () => {
      const total = rows.reduce((a, r) => a + (parseInt(r.qty, 10) || 0) * (parseFloat(r.price) || 0), 0);
      openModal(`
        <h3>Edit Manual Sale</h3>
        <p class="muted">Entered by ${esc(m.staffName)} • ${esc(m.createdAt)}</p>
        <div class="field"><label>Customer name (optional)</label><input id="me-cust" maxlength="120" value="${esc(customer)}"></div>
        <div class="me-row me-head"><span>Item</span><span>Qty</span><span>Price each</span><span></span></div>
        <div id="me-rows">${rows.map((r, i) => `
          <div class="me-row" data-i="${i}">
            <input class="me-name" placeholder="Item name" maxlength="100" value="${esc(r.name)}">
            <input class="me-qty" inputmode="numeric" maxlength="4" placeholder="Qty" value="${esc(r.qty)}">
            <input class="me-price" inputmode="decimal" placeholder="₱ each" value="${esc(r.price)}">
            <button class="btn ghost small me-x" ${rows.length === 1 ? 'disabled' : ''} title="Remove">✕</button>
          </div>`).join('')}</div>
        <button class="link-btn" id="me-add">+ Add another item</button>
        <div class="bar-detail" style="margin-top:10px"><span>Total</span><span class="amt" id="me-total">₱${money(total)}</span></div>
        <div class="modal-actions"><button class="btn ghost" id="me-cancel">Cancel</button><button class="btn" id="me-save">Save Changes</button></div>`);
      const $ = (id) => document.getElementById(id);
      const sync = () => {
        customer = $('me-cust').value;
        modalCard.querySelectorAll('.me-row').forEach((el) => {
          const r = rows[+el.dataset.i];
          r.name = el.querySelector('.me-name').value;
          r.qty = el.querySelector('.me-qty').value.replace(/\D/g, '');
          r.price = el.querySelector('.me-price').value.replace(/[^\d.]/g, '');
        });
        const t = rows.reduce((a, r) => a + (parseInt(r.qty, 10) || 0) * (parseFloat(r.price) || 0), 0);
        $('me-total').textContent = '₱' + money(t);
      };
      $('me-rows').addEventListener('input', sync);
      $('me-rows').addEventListener('click', (e) => {
        const x = e.target.closest('.me-x');
        if (!x || rows.length === 1) return;
        sync(); rows.splice(+x.closest('.me-row').dataset.i, 1); draw();
      });
      $('me-add').onclick = () => { sync(); if (rows.length >= 50) return toast('A sale can have up to 50 items only.'); rows.push({ name: '', qty: 1, price: '' }); draw(); };
      $('me-cancel').onclick = () => openManualSale(m);
      $('me-save').onclick = async () => {
        sync();
        const items = [];
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const n = String(r.name).trim().replace(/\s+/g, ' ');
          const qn = parseInt(r.qty, 10) || 0;
          const pr = Math.round((parseFloat(r.price) || 0) * 100) / 100;
          if (!n) return toast(`Enter the name of item ${i + 1}.`);
          if (qn < 1 || qn > 9999) return toast(`Quantity of ${n} must be from 1 to 9999.`);
          if (pr <= 0) return toast(`Enter the amount of ${n}.`);
          items.push({ name: n, qty: qn, price: pr });
        }
        const btn = $('me-save'); btn.disabled = true;
        try {
          const r = await Api.updateManualSale(m.id, customer.trim(), items);
          if (!r.success) throw new Error(r.message || 'Unable to save.');
          Api.addLog('Manual Sale Edited', `${Api.user.name} edited a manual sale${m.staffName ? ' of ' + m.staffName : ''}: ₱${money(m.total)} → ₱${money(r.total)}.`, Api.user.name);
          toast('Manual sale updated.'); closeModal(); loadAll();
        } catch (err) { btn.disabled = false; toast(err.message); }
      };
    };
    draw();
  }

  // Petsa at oras na NAKASULAT sa resibo. Sa lumang record, hanapin sa OCR text.
  function receiptDT(t) {
    let d = String(t.receiptDate || '').trim(), tm = String(t.receiptTime || '').trim();
    const raw = String(t.rawText || '').split('--- Receipt details ---')[0];
    if (!d) {
      const m = raw.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i)
        || raw.match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/) || raw.match(/\b\d{4}-\d{2}-\d{2}\b/);
      if (m) d = m[0];
    }
    if (!tm) {
      const m = raw.match(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(AM|PM)\b/i) || raw.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
      if (m) tm = m[0];
    }
    return { d, tm };
  }

  async function openTransaction(t, onBack) {
    const rd = receiptDT(t);
    openModal(`
      <h3>Transaction Details</h3>
      <p class="kv-sec">From the receipt (OCR)</p>
      <div class="kv">
        <span>Account Name</span><b>${esc(t.accountName)}</b>
        ${t.senderNumber ? `<span>Account Number</span><b>${esc(t.senderNumber)}</b>` : ''}
        <span>Amount</span><b class="amt">₱${money(t.amount)}</b>
        <span>Reference No.</span><b>${esc(t.reference)}</b>
        ${t.receiptType ? `<span>Receipt Type</span><b>${esc(t.receiptType)}</b>` : ''}
        <span>Date</span><b>${rd.d ? esc(rd.d) : '<i class="muted">Not found on receipt</i>'}</b>
        <span>Time</span><b>${rd.tm ? esc(rd.tm) : '<i class="muted">Not found on receipt</i>'}</b>
        ${String(t.rawText || '').includes('--- Receipt details ---') ? String(t.rawText).split('--- Receipt details ---').pop().trim().split('\n').filter((l) => l.includes(': ')).map((l) => `<span>${esc(l.slice(0, l.indexOf(': ')))}</span><b>${esc(l.slice(l.indexOf(': ') + 2))}</b>`).join('') : ''}
      </div>
      <p class="kv-sec">Transaction record</p>
      <div class="kv">
        <span>Scanned on</span><b>${esc(t.date)} ${esc(t.time)}</b>
        ${t.scannedBy ? `<span>Scanned by</span><b>${esc(t.scannedBy)}</b>` : ''}
        ${t.branch ? `<span>Branch</span><b>${esc(t.branch)}</b>` : ''}
        ${t.branchLocation ? `<span>Location</span><b>${esc(t.branchLocation)}</b>` : ''}
      </div>
      <b>Scanned Receipt</b>
      <div id="rcpt" style="margin-top:8px">${t.hasImage ? '<div class="spinner"></div>' : '<p class="muted">No receipt image was saved for this transaction.</p>'}</div>
      <div class="modal-actions">
        ${isManager() ? '<button class="btn danger" id="tx-del">Delete</button>' : ''}
        <button class="btn" id="tx-close">${onBack ? 'Back' : 'Close'}</button>
      </div>`);
    document.getElementById('tx-close').onclick = onBack || closeModal;
    const del = document.getElementById('tx-del');
    if (del) del.onclick = async () => {
      if (!confirm('Delete this transaction? This cannot be undone.')) return;
      try {
        const r = await Api.deleteTransaction(t.id, t.reference);
        toast(r.message || (r.success ? 'Deleted.' : 'Unable to delete.'));
        if (r.success) { closeModal(); loadAll(); }
      } catch (err) { toast(err.message); }
    };
    if (t.hasImage) {
      try {
        const r = await Api.receiptImage(t.id, t.reference);
        const box = document.getElementById('rcpt');
        if (!box) return;
        if (r.success && r.image) {
          const src = `data:${r.mime || 'image/jpeg'};base64,${r.image}`;
          box.innerHTML = `<img class="receipt-img" alt="Receipt" src="${src}"><p class="muted">Click the image to open it full size.</p>`;
          box.querySelector('img').onclick = () => { const w = window.open(); if (w) w.document.write(`<img src="${src}" style="max-width:100%">`); };
        } else {
          box.innerHTML = `<p class="muted">${esc(r.message || 'Unable to load the receipt.')}</p>`;
        }
      } catch (err) {
        const box = document.getElementById('rcpt');
        if (box) box.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
      }
    }
  }

  // ---------------------------------------------------------------
  // CALENDAR (Today card sa Dashboard): pumili ng araw, makita ang kita
  // ---------------------------------------------------------------
  const CAL = { y: 0, m: 0, sel: '' };
  function openCalendar() {
    const now = new Date();
    CAL.y = now.getFullYear(); CAL.m = now.getMonth(); CAL.sel = dateKey(now);
    renderCalendar();
  }
  function renderCalendar() {
    const byDay = {};
    S.tx.forEach((t) => { const k = scanDate(t); (byDay[k] = byDay[k] || []).push(t); });
    const first = new Date(CAL.y, CAL.m, 1);
    const days = new Date(CAL.y, CAL.m + 1, 0).getDate();
    const todayK = dateKey(new Date());
    let monthTotal = 0, monthCount = 0;
    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push('<div class="cal-cell empty"></div>');
    for (let d = 1; d <= days; d++) {
      const k = `${CAL.y}-${pad(CAL.m + 1)}-${pad(d)}`;
      const list = byDay[k] || [];
      const tot = list.reduce((a, t) => a + Number(t.amount || 0), 0);
      monthTotal += tot; monthCount += list.length;
      cells.push(`<button class="cal-cell ${k === CAL.sel ? 'on' : ''} ${k === todayK ? 'today' : ''} ${list.length ? 'has' : ''}" data-day="${k}">
        <span class="cal-d">${d}</span>${list.length ? `<span class="cal-amt">₱${short(tot)}</span>` : ''}</button>`);
    }
    const sel = (byDay[CAL.sel] || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const selTot = sel.reduce((a, t) => a + Number(t.amount || 0), 0);
    const per = {};
    sel.forEach((t) => { const b = t.branch || 'No Branch'; (per[b] = per[b] || { t: 0, c: 0 }); per[b].t += Number(t.amount || 0); per[b].c++; });
    const perRows = Object.entries(per).sort((a, b) => b[1].t - a[1].t);
    const [sy, sm, sd] = CAL.sel.split('-').map(Number);
    const selLabel = `${MONTHS[sm - 1]} ${sd}, ${sy}`;

    openModal(`
      <div class="cal-top">
        <button class="btn ghost small" id="cal-prev" aria-label="Previous month">‹</button>
        <div class="cal-title"><b>${MONTHS[CAL.m]} ${CAL.y}</b><div class="muted">₱${money(monthTotal)} • ${monthCount} receipt(s)</div></div>
        <button class="btn ghost small" id="cal-next" aria-label="Next month">›</button>
      </div>
      <div class="cal-grid cal-head">${DAYS.map((d) => `<div>${d.charAt(0)}</div>`).join('')}</div>
      <div class="cal-grid" id="cal-grid">${cells.join('')}</div>
      <div class="cal-sel">
        <div class="bar-detail"><span>${esc(selLabel)}${CAL.sel === todayK ? ' (Today)' : ''}</span><span>₱${money(selTot)} <span class="muted">• ${sel.length} rcpt</span></span></div>
        ${isOwner() && perRows.length ? perRows.map(([b, a]) => `
          <div class="sb-row"><div class="sb-top"><span class="sb-name">${esc(b)}</span><span class="sb-amt">₱${money(a.t)} <span class="muted">• ${a.c} rcpt</span></span></div>
          <div class="sb-track"><div class="sb-fill" style="width:${selTot ? Math.max(2, a.t / selTot * 100) : 0}%"></div></div></div>`).join('') : ''}
        ${sel.length ? `<div class="cal-list">${sel.map((t) => `
          <button class="cal-item" data-calt="${S.tx.indexOf(t)}">
            <span><b>${esc(t.accountName || 'Unknown')}</b><span class="muted">${esc(t.time || '')}${t.branch ? ' • ' + esc(t.branch) : ''}${t.scannedBy ? ' • ' + esc(t.scannedBy) : ''}</span></span>
            <span class="amt">₱${money(t.amount)}</span></button>`).join('')}</div>` : '<div class="empty">No receipts on this day.</div>'}
      </div>
      <div class="modal-actions"><button class="btn ghost" id="cal-today">Today</button><button class="btn" id="cal-close">Close</button></div>`);

    const $ = (id) => document.getElementById(id);
    $('cal-prev').onclick = () => { CAL.m--; if (CAL.m < 0) { CAL.m = 11; CAL.y--; } renderCalendar(); };
    $('cal-next').onclick = () => { CAL.m++; if (CAL.m > 11) { CAL.m = 0; CAL.y++; } renderCalendar(); };
    $('cal-today').onclick = openCalendar;
    $('cal-close').onclick = closeModal;
    $('cal-grid').onclick = (e) => { const c = e.target.closest('[data-day]'); if (c) { CAL.sel = c.dataset.day; renderCalendar(); } };
    modalCard.querySelectorAll('[data-calt]').forEach((b) => {
      b.onclick = () => openTransaction(S.tx[parseInt(b.dataset.calt, 10)], renderCalendar);
    });
  }

  // ---------------------------------------------------------------
  // REPORTS (Owner: lahat ng branch, Admin: branch niya)
  // ---------------------------------------------------------------
  function bucketKeys() {
    const n = new Date();
    if (S.reportMode === 'Daily') return Array.from({ length: 14 }, (_, i) => dateKey(new Date(n.getFullYear(), n.getMonth(), n.getDate() - i)));
    if (S.reportMode === 'Monthly') return Array.from({ length: 12 }, (_, i) => { const d = new Date(n.getFullYear(), n.getMonth() - i, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; });
    return Array.from({ length: 5 }, (_, i) => String(n.getFullYear() - i));
  }
  const keyOf = (date) => S.reportMode === 'Yearly' ? date.slice(0, 4) : S.reportMode === 'Monthly' ? date.slice(0, 7) : date.slice(0, 10);
  function barLabel(k) {
    if (S.reportMode === 'Yearly') return k;
    const m = MONTHS[(parseInt(k.slice(5, 7), 10) || 1) - 1];
    return S.reportMode === 'Monthly' ? m : String(parseInt(k.slice(8, 10), 10));
  }
  function longLabel(k) {
    if (S.reportMode === 'Yearly') return k;
    const m = MONTHS[(parseInt(k.slice(5, 7), 10) || 1) - 1];
    return S.reportMode === 'Monthly' ? `${m} ${k.slice(0, 4)}` : `${m} ${parseInt(k.slice(8, 10), 10)}, ${k.slice(0, 4)}`;
  }

  // ISANG bar graph: Scanned receipts + Manual sales (nakapatong)
  function incomeChart(keys, byB, byKB, range) {
    const set = new Set(keys);
    const byM = {}; const byMKB = {};
    S.manual.forEach((m) => {
      const k = keyOf(String(m.createdAt || '').slice(0, 10));
      if (!set.has(k)) return;
      const a = Number(m.total || 0);
      (byM[k] = byM[k] || { t: 0, c: 0 }); byM[k].t += a; byM[k].c++;
      const br = m.branch || 'No Branch';
      const kb = (byMKB[k] = byMKB[k] || {});
      (kb[br] = kb[br] || { t: 0, c: 0 }); kb[br].t += a; kb[br].c++;
    });
    const z = { t: 0, c: 0 };
    const sum = (k) => (byB[k] || z).t + (byM[k] || z).t;
    const max = Math.max(0, ...keys.map(sum));
    const sel = keys.includes(S.selectedBar) ? S.selectedBar : keys[0];
    const sR = byB[sel] || z; const sM = byM[sel] || z;
    const selTot = sR.t + sM.t;
    const allR = keys.reduce((a, k) => a + (byB[k] || z).t, 0);
    const allM = keys.reduce((a, k) => a + (byM[k] || z).t, 0);
    // Per branch ng napiling bar
    const names = [...new Set([...Object.keys(byKB[sel] || {}), ...Object.keys(byMKB[sel] || {})])];
    const rows = names.map((n) => [n, ((byKB[sel] || {})[n] || z), ((byMKB[sel] || {})[n] || z)])
      .sort((a, b) => (b[1].t + b[2].t) - (a[1].t + a[2].t));
    const top = rows.length ? rows[0][1].t + rows[0][2].t : 0;
    return `<div class="card mt" id="income-card"><h3>Income</h3>
      <p class="hint">${range} • ₱${money(allR + allM)} total • click a bar to see details</p>
      <div class="legend"><span><i class="lg-r"></i>Scanned receipts ₱${short(allR)}</span><span><i class="lg-m"></i>Manual sales ₱${short(allM)}</span></div>
      <div class="bar-detail"><span>${esc(longLabel(sel))}</span><span>₱${money(selTot)}</span></div>
      <div class="split-detail"><span><i class="lg-r"></i>Scanned ₱${money(sR.t)} <span class="muted">• ${sR.c} rcpt</span></span><span><i class="lg-m"></i>Manual ₱${money(sM.t)} <span class="muted">• ${sM.c} sale(s)</span></span></div>
      <div class="bars" id="bars">${[...keys].reverse().map((k) => {
        const r = (byB[k] || z).t, m = (byM[k] || z).t, v = r + m;
        const h = max ? Math.max(3, v / max * 150) : 3;
        const hm = v ? h * m / v : 0;
        return `<div class="bar ${k === sel ? 'on' : ''} ${v ? '' : 'zero'}" data-k="${k}" title="Scanned ₱${money(r)} • Manual ₱${money(m)}">
          <div class="bstack" style="height:${h}px">${m ? `<div class="bm" style="height:${hm}px"></div>` : ''}<div class="br"></div></div>
          <div class="x">${esc(barLabel(k))}</div></div>`;
      }).join('')}</div>
      <div class="sel-branch">
        <h4>Per branch • ${esc(longLabel(sel))}</h4>
        ${rows.length ? rows.map(([b, r, m]) => `
          <div class="sb-row">
            <div class="sb-top"><span class="sb-name">${esc(b)}</span><span class="sb-amt">₱${money(r.t + m.t)} <span class="muted">• ${selTot ? Math.round((r.t + m.t) / selTot * 100) : 0}%</span></span></div>
            <div class="sb-track two"><div class="sb-fill" style="width:${top ? r.t / top * 100 : 0}%"></div><div class="sb-fill man" style="width:${top ? m.t / top * 100 : 0}%"></div></div>
            <div class="muted sb-sub">Scanned ₱${money(r.t)} (${r.c}) • Manual ₱${money(m.t)} (${m.c})</div>
          </div>`).join('') : '<div class="empty">No receipts or manual sales on this period.</div>'}
      </div>
    </div>`;
  }

  function pageReports() {
    const keys = bucketKeys();
    const set = new Set(keys);
    const byB = {}; const byBranch = {}; const byScanner = {}; const byKB = {};
    let total = 0, count = 0;
    S.tx.forEach((t) => {
      const k = keyOf(scanDate(t));
      if (!set.has(k)) return;
      const a = Number(t.amount || 0);
      total += a; count++;
      (byB[k] = byB[k] || { t: 0, c: 0 }); byB[k].t += a; byB[k].c++;
      const br = t.branch || 'No Branch';
      (byBranch[br] = byBranch[br] || { t: 0, c: 0 }); byBranch[br].t += a; byBranch[br].c++;
      const kb = (byKB[k] = byKB[k] || {});
      (kb[br] = kb[br] || { t: 0, c: 0 }); kb[br].t += a; kb[br].c++;
      const sc = t.scannedBy || 'Unknown';
      const sk = sc + '\u0001' + br; // pangalan + branch kung saan na-scan
      (byScanner[sk] = byScanner[sk] || { t: 0, c: 0 }); byScanner[sk].t += a; byScanner[sk].c++;
    });
    const max = Math.max(0, ...keys.map((k) => (byB[k] || { t: 0 }).t));
    const sel = keys.includes(S.selectedBar) ? S.selectedBar : keys[0];
    const selA = byB[sel] || { t: 0, c: 0 };
    let best = null;
    keys.forEach((k) => { if ((byB[k] || { t: 0 }).t > 0 && (!best || byB[k].t > byB[best].t)) best = k; });
    const range = S.reportMode === 'Daily' ? 'Last 14 days' : S.reportMode === 'Monthly' ? 'Last 12 months' : 'Last 5 years';
    const branchRows = Object.entries(byBranch).sort((a, b) => b[1].t - a[1].t);
    const scanners = Object.entries(byScanner).sort((a, b) => b[1].t - a[1].t).slice(0, 5);
    const topScan = scanners.length ? scanners[0][1].t : 0;
    S.avgInfo = { range, total, count, rows: branchRows };
    S.repExp = { keys, byB, byKB, range, scanners: Object.entries(byScanner).sort((a, b) => b[1].t - a[1].t) };

    return `${head('Reports', isOwner() ? 'All branches' : 'Your branch')}
      <div class="rep-top"><div class="seg" id="seg">${['Daily', 'Monthly', 'Yearly'].map((m) => `<button data-m="${m}" class="${m === S.reportMode ? 'on' : ''}">${m}</button>`).join('')}</div>${expButtons('rep')}</div>
      ${todayHero(S.tx, S.manual, isOwner() ? 'All branches' : (Api.user.branch || 'Your branch'))}
      <div class="grid k4 mt">
        ${statCard('receipt', 'var(--blue)', 'Receipts', count, range + ' • View all', 'data-act="goTx"')}
        ${statCard('sum', 'var(--blue)', 'Average per receipt', '₱' + money(count ? total / count : 0), count ? 'Click to see per branch' : 'Total ÷ receipts', count ? 'data-act="avg"' : '')}
        ${statCard('trophy', 'var(--blue)', S.reportMode === 'Daily' ? 'Best day' : S.reportMode === 'Monthly' ? 'Best month' : 'Best year', best ? '₱' + short(byB[best].t) : '—', best ? longLabel(best) + ' • View' : 'No scans yet', best ? `data-act="best" data-k="${best}"` : '')}
        ${statCard('copy', 'var(--blue)', 'Duplicate attempts', S.dups.length, S.dups.length ? 'Click to view' : 'All time', S.dups.length ? 'data-act="dups"' : '')}
      </div>
      ${incomeChart(keys, byB, byKB, range)}
      <div class="grid k2 mt">
        <div class="card"><h3>${isOwner() ? 'Total per Branch' : 'Your Branch'}</h3><p class="hint">${range} • click a bar to see details</p>
          ${branchRows.length ? (() => {
            const bmax = Math.max(0, ...branchRows.map(([, a]) => a.t));
            const selB = branchRows.some(([b]) => b === S.selectedBranch) ? S.selectedBranch : branchRows[0][0];
            const sa = byBranch[selB];
            return `<div class="bar-detail"><span>${esc(selB)}</span><span>₱${money(sa.t)} <span class="muted">• ${sa.c} rcpt • ${total ? Math.round(sa.t / total * 100) : 0}%</span></span></div>
              <div class="bars branch-bars" id="branch-bars">${branchRows.map(([b, a]) => `
                <div class="bar ${b === selB ? 'on' : ''}" data-branch="${esc(b)}" title="${esc(b)}: ₱${money(a.t)}">
                  <div class="bv">₱${short(a.t)}</div>
                  <div class="b" style="height:${bmax ? Math.max(3, a.t / bmax * 130) : 3}px"></div>
                  <div class="x bx">${esc(b)}</div>
                </div>`).join('')}</div>`;
          })() : '<div class="empty">No scans yet.</div>'}
        </div>
        <div class="card"><h3>Top Scanners</h3><p class="hint">${range} • by amount</p>
          ${scanners.length ? scanners.map(([n, a], i) => `<div style="margin:10px 0">
            <div class="row-line"><span>${i + 1}. ${esc(n.split('\u0001')[0])}</span><span>₱${money(a.t)}</span></div>
            <div class="progress"><i style="background:var(--green);width:${topScan ? (a.t / topScan * 100).toFixed(1) : 0}%"></i></div>
            <div class="muted"><span class="scan-br">${esc(n.split('\u0001')[1] || 'No Branch')}</span> ${a.c} receipt(s)</div></div>`).join('') : '<div class="empty">No scans yet.</div>'}
        </div>
      </div>
      <div class="card mt" id="dups-card">
        <button class="dup-head" ${S.dups.length ? 'data-act="dupsToggle"' : 'disabled'} aria-expanded="${S.dupsOpen}">
          <span><h3>Duplicate Receipts ${S.dups.length ? `<span class="dup-count">${S.dups.length}</span>` : ''}</h3>
          <p class="hint">${S.dups.length ? S.dups.length + ' attempt(s) to save a receipt that already exists' : 'All clear — no receipt was saved twice'}</p></span>
          ${S.dups.length ? `<span class="dup-toggle">${S.dupsOpen ? 'Hide' : 'Show'} <span class="chev ${S.dupsOpen ? 'up' : ''}">▾</span></span>` : ''}
        </button>
        ${S.dups.length && S.dupsOpen ? `<div class="table-wrap dup-scroll"><table><thead><tr><th>Reference</th><th>Customer</th><th>Amount</th><th class="hide-sm">Scanned by</th><th class="hide-sm">When</th></tr></thead><tbody>
          ${S.dups.map((d) => `<tr><td><b>${esc(d.reference)}</b></td><td>${esc(d.customer)}</td><td class="amt">₱${money(d.amount)}</td>
          <td class="hide-sm">${esc(d.scanner)}${d.branch ? ' • ' + esc(d.branch) : ''}</td><td class="hide-sm muted">${esc(d.createdAt)}</td></tr>`).join('')}
        </tbody></table></div>` : ''}
      </div>`;
  }

  // Average per receipt: paliwanag + average ng bawat branch
  function averageDetails() {
    const A = S.avgInfo || { range: '', total: 0, count: 0, rows: [] };
    const avg = A.count ? A.total / A.count : 0;
    openModal(`
      <h3>Average per Receipt</h3>
      <p class="muted">${esc(A.range)}</p>
      <div class="avg-hero"><div class="big">₱${money(avg)}</div>
        <div class="muted">₱${money(A.total)} ÷ ${A.count} receipt(s)</div></div>
      <h4 class="avg-h">${isOwner() ? 'Average per branch' : 'Your branch'}</h4>
      ${A.rows.map(([b, x]) => `
        <div class="avg-row"><div><b>${esc(b)}</b><div class="muted">${x.c} receipt(s) • ₱${money(x.t)}</div></div>
        <div class="avg-v">₱${money(x.c ? x.t / x.c : 0)}</div></div>`).join('') || '<div class="empty">No scans yet.</div>'}
      <div class="modal-actions"><button class="btn" id="avg-close">Close</button></div>`);
    document.getElementById('avg-close').onclick = closeModal;
  }

  // ---------------------------------------------------------------
  // ACTIVITY LOGS
  // ---------------------------------------------------------------
  function pageLogs() {
    const q = S.logSearch.toLowerCase();
    const list = S.logs.filter((l) => !q || [l.action, l.description, l.user, l.branch].join(' ').toLowerCase().includes(q));
    const brOf = (l) => l.branch || 'No Branch';
    // Hiwa-hiwalay kada branch
    const groups = {};
    list.forEach((l) => { (groups[brOf(l)] = groups[brOf(l)] || []).push(l); });
    const names = Object.keys(groups).sort((a, b) => (a === 'No Branch') - (b === 'No Branch') || a.localeCompare(b));
    const allNames = [...new Set(S.logs.map(brOf))];
    if (S.logBranch !== 'All' && !allNames.includes(S.logBranch)) S.logBranch = 'All';
    // Location ng bawat branch (hal. MARIKINA NCR, BATANGAS)
    const locOf = (n) => n === 'No Branch' ? 'OWNER / NO BRANCH' : (branchLoc(n) || 'OTHER BRANCHES');
    const locs = [...new Set(names.map(locOf))].sort((a, b) => (/^(OTHER|OWNER)/.test(a)) - (/^(OTHER|OWNER)/.test(b)) || a.localeCompare(b));
    if (S.logLoc !== 'All' && !locs.includes(S.logLoc)) { S.logLoc = 'All'; S.logBranch = 'All'; }
    const inLoc = S.logLoc === 'All' ? names : names.filter((n) => locOf(n) === S.logLoc);
    if (S.logBranch !== 'All' && !inLoc.includes(S.logBranch)) S.logBranch = 'All';
    const shown = S.logBranch === 'All' ? inLoc : inLoc.filter((n) => n === S.logBranch);
    const label = (n) => n === 'No Branch' ? 'Owner / No branch' : n;
    const table = (rows) => `<div class="table-wrap log-scroll"><table><thead><tr><th>Action</th><th>Description</th><th class="hide-sm">User</th><th class="hide-sm">When</th></tr></thead><tbody>
          ${rows.map((l) => `<tr><td><span class="tag ${/delete|duplicate|reject/i.test(l.action) ? 'red' : /login|confirm|approved|added/i.test(l.action) ? 'green' : ''}">${esc(l.action)}</span></td>
          <td>${esc(l.description)}<div class="muted show-sm">${esc(l.user)} • ${esc(l.created)}</div></td><td class="hide-sm">${esc(l.user)}<div class="muted">${roleLabel(l.role)}</div></td>
          <td class="hide-sm muted">${esc(l.created)}</td></tr>`).join('')}
        </tbody></table></div>`;
    const chip = (key, name, c) => `<button class="br-chip ${S.logBranch === key ? 'on' : ''}" data-logbranch="${esc(key)}">
        <span class="br-name">${esc(name)}</span><span class="br-meta">${c} log(s)</span></button>`;
    const locChip = (key, name, c) => `<button class="br-chip ${S.logLoc === key ? 'on' : ''}" data-logloc="${esc(key)}">
        <span class="br-name">${key === 'All' ? '' : '📍 '}${esc(name)}</span><span class="br-meta">${c} log(s)</span></button>`;
    const countLoc = (l) => names.filter((n) => locOf(n) === l).reduce((a, n) => a + groups[n].length, 0);

    return `${head('Activity Logs', isOwner() ? 'All branches' : 'Your branch')}
      <div class="card">
        <div class="toolbar"><input id="log-search" placeholder="Search action, user, branch..." value="${esc(S.logSearch)}"></div>
        ${names.length > 1 || (isOwner() && names.length) ? `<div id="log-chips">
          <div class="br-chips">
            ${locChip('All', 'All locations', list.length)}
            ${locs.map((l) => locChip(l, l, countLoc(l))).join('')}
          </div>
          ${S.logLoc !== 'All' ? `<div class="lcg"><div class="lcg-head" style="cursor:default">📍 <b>${esc(S.logLoc)}</b><span class="lcg-meta">${inLoc.length} branch${inLoc.length === 1 ? '' : 'es'}</span></div>
            <div class="br-chips">
              ${chip('All', 'All in ' + S.logLoc, inLoc.reduce((a, n) => a + groups[n].length, 0))}
              ${inLoc.map((n) => chip(n, label(n), groups[n].length)).join('')}
            </div></div>` : ''}
        </div>` : ''}
        <p class="hint">${list.length} log(s)${names.length ? ' • ' + names.length + ' branch group(s)' : ''}</p>
      </div>
      ${shown.length ? shown.map((n) => `
        <div class="card mt log-group">
          <div class="log-head"><h3>${esc(label(n))}</h3><span class="log-count">${groups[n].length}</span></div>
          ${table(groups[n])}
        </div>`).join('') : '<div class="card mt"><div class="empty">No activity yet.</div></div>'}`;
  }

  // ---------------------------------------------------------------
  // ACCOUNTS (Owner/Admin)
  // ---------------------------------------------------------------
  // Puwede bang i-reset ng naka-login ang password ng account na ito?
  //   Website: OWNER LANG (Admin at Staff ng negosyo niya).
  function canReset(u) {
    const r = String(u.role || '').toLowerCase();
    if (String(u.id) === String(Api.user.id) || r === 'owner') return false;
    return isOwner();
  }

  function pageAccounts() {
    const list = [...S.users].sort((a, b) => String(a.role).localeCompare(String(b.role)) || String(a.name).localeCompare(String(b.name)));
    return `${head('Accounts', isOwner() ? 'Admins and staff of your business' : 'Staff of your branch')}
      ${isOwner() && S.pwReqs.length ? `<div class="card" style="border-color:var(--orange);margin-bottom:14px">
        <h3>Password Requests</h3><p class="hint">These accounts asked for a password reset (Forgot Password).</p>
        <div class="table-wrap"><table><tbody>
          ${S.pwReqs.map((r, i) => `<tr><td><b>${esc(r.name)}</b><div class="muted">${esc(r.email)} • ${roleLabel(r.role)}${r.branch ? ' • ' + esc(r.branch) : ''}</div>
            <div class="muted">${esc(r.createdAt)}</div></td>
            <td style="text-align:right;white-space:nowrap">
              <button class="btn small ghost" data-dismiss="${i}">Dismiss</button>
              <button class="btn small" data-reqreset="${i}">Reset</button></td></tr>`).join('')}
        </tbody></table></div></div>` : ''}
      <div class="card">
        ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th class="hide-sm">Email</th><th>Role</th><th class="hide-sm">Branch</th>${isOwner() ? '<th></th>' : ''}</tr></thead><tbody>
          ${list.map((u) => `<tr><td><b>${esc(u.name)}</b><div class="muted">${esc(u.email)}</div></td><td class="hide-sm">${esc(u.email)}</td>
          <td><span class="tag">${roleLabel(u.role)}</span></td><td class="hide-sm">${esc(u.branch || '—')}</td>
          ${isOwner() ? `<td style="text-align:right">${canReset(u) ? `<button class="btn small soft" data-reset="${S.users.indexOf(u)}">Reset password</button>` : ''}</td>` : ''}</tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">No accounts found.</div>'}
        <p class="hint mt">${isOwner() ? 'You can reset the password of your Admins and Staff. ' : ''}To add accounts or manage branches, use the ReceiScan mobile app.</p>
      </div>`;
  }

  // Bagong password para sa Admin/Staff (Owner o Admin ang nagre-reset)
  function resetPassword(target, requestId) {
    openModal(`<h3>Reset password</h3>
      <p class="muted">${esc(target.name)} • ${esc(target.email)} • ${roleLabel(target.role)}</p>
      <div class="field"><label>New Password</label><input id="r1" type="password"></div>
      <div class="field"><label>Confirm New Password</label><input id="r2" type="password"></div>
      <p class="muted">Letters and numbers 1-9 only, at least 6 characters. The account will be logged out on all devices.</p>
      <div class="modal-actions"><button class="btn ghost" id="r-x">Cancel</button><button class="btn" id="r-ok">Reset</button></div>`);
    document.getElementById('r-x').onclick = closeModal;
    document.getElementById('r-ok').onclick = async () => {
      const a = document.getElementById('r1').value, b = document.getElementById('r2').value;
      if (a.length < 6) return toast('Password must be at least 6 characters.');
      if (a !== b) return toast('Passwords do not match.');
      try {
        const r = await Api.resetPassword(target.id, a);
        toast(r.message || (r.success ? 'Password reset.' : 'Unable to reset the password.'));
        if (r.success) {
          if (requestId) await Api.dismissPasswordRequest(requestId).catch(() => null);
          closeModal();
          loadAll();
        }
      } catch (err) { toast(err.message); }
    };
  }

  // ---------------------------------------------------------------
  // PROFILE
  // ---------------------------------------------------------------
  // ---- Pagkukumpara ng manual sale: kasalukuyan vs hiniling ----
  // Pahintulot lang na mag-edit (walang laman ang hiniling)
  function isPermReq(r) { return r.kind === 'edit' && !(((r.proposed || {}).items || []).length); }
  function custChanged(r) {
    return r.kind !== 'delete' && !isPermReq(r) && String((r.current || {}).customerName || '').trim() !== String((r.proposed || {}).customerName || '').trim();
  }
  function diffItems(r) {
    const cur = ((r.current || {}).items || []);
    const nw = r.kind === 'delete' ? [] : isPermReq(r) ? cur : ((r.proposed || {}).items || []);
    const key = (x) => String(x.name || '').trim().toLowerCase();
    const names = [...new Set([...cur.map(key), ...nw.map(key)])];
    return names.map((k) => {
      const a = cur.find((x) => key(x) === k), b = nw.find((x) => key(x) === k);
      let status = 'same';
      if (a && !b) status = 'removed';
      else if (!a && b) status = 'added';
      else if (Number(a.qty) !== Number(b.qty) || Number(a.price) !== Number(b.price)) status = 'changed';
      return { name: (b || a).name, a, b, status };
    });
  }
  function openManualRequest(r, i) {
    if (!r) return;
    const del = r.kind === 'delete';
    const perm = isPermReq(r);
    const cell = (x) => x ? `${esc(x.qty)} × ₱${money(x.price)} = <b>₱${money(Number(x.qty) * Number(x.price))}</b>` : '<span class="muted">—</span>';
    const lbl = { same: 'No change', changed: 'Changed', added: 'Added', removed: del ? 'Will be deleted' : 'Removed' };
    const rows = diffItems(r).map((d) => `<tr class="df-${d.status}">
        <td><b>${esc(d.name)}</b>${perm ? '' : `<div><span class="df-tag">${lbl[d.status]}</span></div>`}</td>
        <td>${cell(d.a)}</td>${perm ? '' : `<td>${del ? '<span class="muted">—</span>' : cell(d.b)}</td>`}</tr>`).join('');
    const cn = (r.current || {}).customerName || 'Walk-in customer', pn = (r.proposed || {}).customerName || 'Walk-in customer';
    openModal(`
      <h3>${del ? 'Delete' : 'Edit'} Request</h3>
      <div class="kv">
        <span>Requested by</span><b>${esc(r.staffName)}</b>
        <span>Requested on</span><b>${esc(r.createdAt)}</b>
        ${r.saleCreatedAt ? `<span>Sale date</span><b>${esc(r.saleCreatedAt)}</b>` : ''}
        <span>Reason</span><b>${esc(r.reason)}</b>
      </div>
      <div class="df-cust ${custChanged(r) ? 'df-changed' : ''}"><small>Customer</small>
        ${del ? esc(cn) : custChanged(r) ? `${esc(cn)} → <b>${esc(pn)}</b>` : esc(cn)}</div>
      ${perm ? '<div class="notice" style="background:var(--blue-soft);color:var(--ink)">The staff is asking permission to edit this sale. If you allow it, they can edit the record once. The change will show in Activity Logs.</div>' : ''}
      <div class="table-wrap"><table class="df-table"><thead><tr><th>Item</th><th>Now</th>${perm ? '' : `<th>${del ? 'After' : 'Requested'}</th>`}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="df-total"><span>Total</span><span>${perm ? '₱' + money((r.current || {}).total || 0) : `₱${money((r.current || {}).total || 0)} → <b>${del ? 'Deleted' : '₱' + money((r.proposed || {}).total || 0)}</b>`}</span></div>
      <div class="modal-actions">
        <button class="btn ghost" id="mr-x">Close</button>
        <button class="btn danger" data-mreq="${i}" data-ok="0" id="mr-no">Reject</button>
        <button class="btn" data-mreq="${i}" data-ok="1" id="mr-yes">${perm ? 'Allow Edit' : 'Approve'}</button>
      </div>`);
    document.getElementById('mr-x').onclick = closeModal;
    const decide = async (approve) => {
      if (!confirm(approve ? (del ? `Delete this manual sale as requested by ${r.staffName}?` : perm ? `Allow ${r.staffName} to edit this manual sale?` : `Apply the changes requested by ${r.staffName}?`) : `Reject the request of ${r.staffName}?`)) return;
      try {
        const res = await Api.decideManualRequest(r.id, approve);
        if (!res.success) throw new Error(res.message || 'Unable to save.');
        Api.addLog(approve ? 'Manual Request Approved' : 'Manual Request Rejected', `${Api.user.name} ${approve ? (perm ? 'allowed' : 'approved') : 'rejected'} the ${del ? 'delete' : 'edit'} request of ${r.staffName}.`, Api.user.name);
        toast(!approve ? 'Request rejected.' : perm ? 'Edit allowed. The staff can now edit the record.' : 'Request approved.');
        closeModal();
      } catch (err) { toast(err.message); }
      loadAll();
    };
    document.getElementById('mr-yes').onclick = () => decide(true);
    document.getElementById('mr-no').onclick = () => decide(false);
  }

  function pageProfile() {
    const u = Api.user;
    return `${head('Profile', 'Your account')}
      <div class="card">
        <div class="kv">
          <span>Name</span><b>${esc(u.name)}</b>
          <span>Email</span><b>${esc(u.email)}</b>
          <span>Role</span><b>${roleLabel(u.role)}</b>
          ${u.branch ? `<span>Branch</span><b>${esc(u.branch)}</b>` : ''}
          ${isOwner() && u.ownerCode ? `<span>Owner ID</span><b>${esc(u.ownerCode)}</b>` : ''}
        </div>
        <div class="toolbar">
          <button class="btn soft" data-act="chpass">Change Password</button>
          <button class="btn soft" data-act="chpin">Change PIN</button>
          <button class="btn soft" data-act="privacy">Privacy Notice</button>
          <button class="btn danger" data-act="logout">Log Out</button>
        </div>
      </div>
      ${isAdmin() ? (() => {
        const i = S.branches.findIndex((b) => b.name === Api.user.branch);
        const b = S.branches[i];
        return `<div class="card mt" id="mybranch-card">
          <h3>Your Branch</h3><p class="hint">You can change the name and location of your own branch</p>
          ${b ? `<div class="branch-row">
            <div><b>${esc(b.name)}</b><div class="br-loc">📍 ${b.location ? esc(b.location) : '<span class="muted">No location yet</span>'}</div></div>
            <div class="br-btns"><button class="btn soft small" data-brloc="${i}">Change Name</button></div>
          </div>` : `<div class="empty">${Api.user.branch ? 'Loading your branch...' : 'No branch yet. Ask the Owner to assign you.'}</div>`}
        </div>`;
      })() : ''}
      ${isAdmin() ? (S.mreqs.length ? `<div class="card mt req-card" id="mreq-card">
        <h3>Manual Change Requests <span class="dup-count">${S.mreqs.length}</span></h3>
        <p class="hint">Staff asked to edit or delete these manual sales. Click a request to see the changes. The record changes only when you approve.</p>
        ${S.mreqs.map((r, i) => {
          const del = r.kind === 'delete';
          const now = (r.current && r.current.total) || 0, nw = (r.proposed && r.proposed.total) || 0;
          return `<button class="mreq-item" data-mreqopen="${i}">
            <div class="mreq-top"><b>${esc(r.staffName)}</b> <span class="tag ${del ? 'red' : ''}">${del ? 'Delete' : 'Edit'} request</span> <span class="muted">${esc(r.createdAt)}</span></div>
            <div class="mreq-reason">Reason: ${esc(r.reason)}</div>
            <div class="mreq-sum"><span>${del ? `Delete sale of <b>₱${money(now)}</b>` : isPermReq(r) ? `Wants to edit sale of <b>₱${money(now)}</b>` : `₱${money(now)} → <b>₱${money(nw)}</b> • ${diffItems(r).filter((d) => d.status !== 'same').length + (custChanged(r) ? 1 : 0)} change(s)`}</span>
              <span class="mreq-view">${isPermReq(r) ? 'View details' : 'View changes'} ›</span></div>
          </button>`;
        }).join('')}
      </div>` : `<div class="card mt" id="mreq-card"><h3>Manual Change Requests</h3><p class="hint">Staff requests to edit or delete manual sales will appear here.</p>${S.mreqErr ? `<div class="notice">Cannot load requests: ${esc(S.mreqErr)}. Make sure the latest api.php is uploaded.</div>` : '<div class="empty">No pending requests.</div>'}</div>`) : ''}
      ${isManager() ? `
      <div class="card mt" id="brreq-card">
        <h3>Branch Change Requests ${S.brReqs.length ? `<span class="dup-count">${S.brReqs.length}</span>` : ''}</h3>
        <p class="hint">${isOwner() ? 'Staff who want to move to another branch' : 'Staff who want to move to your branch'}</p>
        ${S.brReqs.length ? S.brReqs.map((q, i) => `
          <div class="branch-row req-row">
            <div><b>${esc(q.name)}</b><div class="muted">${esc(q.email)}</div>
              <div class="req-move"><span>${esc(q.fromBranch || 'No branch')}</span> → <b>${esc(q.toBranch)}</b></div>
              <div class="muted">${esc(q.createdAt || '')}</div></div>
            <div class="req-actions">
              <button class="btn small danger" data-brreq="${i}" data-ok="0">Reject</button>
              <button class="btn small" data-brreq="${i}" data-ok="1">Approve</button>
            </div>
          </div>`).join('') : '<div class="empty">No pending requests.</div>'}
      </div>` : ''}
      ${isOwner() ? `
      <div class="card mt" id="branches-card">
        <div class="card-head"><div><h3>Branches</h3><p class="hint">Add branches and change branch passwords</p></div>
          <button class="btn small" data-act="addBranch">+ Add Branch</button></div>
        ${S.branches.length ? (() => {
          // Naka-grupo ayon sa LOCATION; pindutin ang location para makita ang branches
          const locOf = (b) => (b.location || '').trim() || 'No location';
          const locs = [...new Set(S.branches.map(locOf))].sort((x, y) => (x === 'No location') - (y === 'No location') || x.localeCompare(y));
          return locs.map((loc) => {
            const list = S.branches.map((b, i) => [b, i]).filter(([b]) => locOf(b) === loc);
            const open = S.openLocs.has(loc);
            return `<div class="loc-group">
              <button class="loc-head" data-loc="${esc(loc)}" aria-expanded="${open}">
                <span>📍 <b>${esc(loc)}</b></span>
                <span class="muted">${list.length} branch(es) <span class="chev ${open ? 'up' : ''}">▾</span></span>
              </button>
              ${open ? list.map(([b, i]) => `
                <div class="branch-row">
                  <div><b>${esc(b.name)}</b>
                    <div class="muted">${b.adminName ? 'Admin: ' + esc(b.adminName) : 'No Admin yet'}</div></div>
                  <div class="br-btns">
                    <button class="btn soft small" data-brloc="${i}">Change Name</button>
                    <button class="btn soft small" data-brpass="${i}">Change Password</button>
                    <button class="btn danger small" data-brdel="${i}">Delete</button>
                  </div>
                </div>`).join('') : ''}
            </div>`;
          }).join('');
        })() : '<div class="empty">No branches yet. Add your first branch.</div>'}
      </div>` : ''}`;
  }

  // Owner: magdagdag ng branch
  function addBranch() {
    openModal(`<h3>Add Branch</h3>
      <p class="muted">Staff and Admin need the branch password to join this branch.</p>
      <div class="field"><label>Branch name</label><input id="ab-name" placeholder="e.g. SM LIPA" style="text-transform:uppercase"></div>
      <div class="field"><label>Location</label><input id="ab-loc" placeholder="e.g. MARIKINA NCR" style="text-transform:uppercase"></div>
      <div class="field"><label>Branch password</label><input id="ab-pass" type="password" autocomplete="new-password" placeholder="At least 6 characters"></div>
      <div class="field"><label>Confirm branch password</label><input id="ab-pass2" type="password" autocomplete="new-password"></div>
      <div class="modal-actions"><button class="btn ghost" id="ab-x">Cancel</button><button class="btn" id="ab-ok">Add Branch</button></div>`);
    document.getElementById('ab-x').onclick = closeModal;
    document.getElementById('ab-ok').onclick = async () => {
      const name = document.getElementById('ab-name').value.trim().replace(/\s+/g, ' ').toUpperCase();
      const pw = document.getElementById('ab-pass').value;
      const loc = document.getElementById('ab-loc').value.trim().replace(/\s+/g, ' ').toUpperCase();
      if (!name || pw.length < 6) return toast('Enter a branch name and a password (min 6 characters).');
      if (!loc) return toast('Enter the branch location (e.g. MARIKINA NCR).');
      if (pw !== document.getElementById('ab-pass2').value) return toast('Passwords do not match.');
      const btn = document.getElementById('ab-ok'); btn.disabled = true;
      try {
        const r = await Api.addBranch(name, pw, loc);
        if (!r.success) { btn.disabled = false; return toast(r.message || 'Unable to add branch.'); }
        Api.addLog('Branch Added', `${Api.user.name} added branch ${name} (${loc}).`, Api.user.name);
        closeModal();
        toast('Branch added.');
        loadAll();
      } catch (err) { btn.disabled = false; toast(err.message); }
    };
  }

  // Palitan ang pangalan (at location) ng branch
  // Owner: kahit anong branch niya. Admin: sariling branch lang.
  function changeBranchName(b) {
    if (!b) return;
    openModal(`<h3>Change Branch Name</h3>
      <div class="field"><label>Branch name</label><input id="bn-name" maxlength="60" style="text-transform:uppercase" value="${esc(b.name || '')}"></div>
      <div class="field"><label>Location</label><input id="bn-loc" placeholder="e.g. MARIKINA NCR" style="text-transform:uppercase" value="${esc(b.location || '')}"></div>
      <div class="modal-actions"><button class="btn ghost" id="bn-x">Cancel</button><button class="btn" id="bn-ok">Save</button></div>`);
    document.getElementById('bn-x').onclick = closeModal;
    document.getElementById('bn-ok').onclick = async () => {
      const name = document.getElementById('bn-name').value.trim().replace(/\s+/g, ' ').toUpperCase();
      const loc = document.getElementById('bn-loc').value.trim().replace(/\s+/g, ' ').toUpperCase();
      if (!name || !loc) return toast('Please enter the branch name and location.');
      const btn = document.getElementById('bn-ok'); btn.disabled = true;
      try {
        const r = await Api.updateBranch(b.id, name, loc);
        if (!r.success) { btn.disabled = false; return toast(r.message || 'Unable to save.'); }
        const nn = r.name || name, nl = r.location || loc;
        Api.addLog('Branch Updated', nn === b.name ? `${Api.user.name} set the location of ${nn} to ${nl}.` : `${Api.user.name} renamed branch ${b.name} to ${nn} (${nl}).`, Api.user.name);
        // Admin: sariling branch ang napalitan
        if (isAdmin() && Api.user.branch === b.name) {
          Api.user.branch = nn; Api.user.branchLocation = nl;
          Api.saveSession(Api.token, Api.user);
        }
        closeModal(); toast('Branch saved.'); loadAll();
      } catch (err) { btn.disabled = false; toast(err.message); }
    };
  }

  // Owner: burahin ang branch (kailangan ang password ng Owner)
  function deleteBranch(b) {
    if (!b) return;
    openModal(`<h3>Delete ${esc(b.name)}?</h3>
      <div class="notice">The Admin and Staff of this branch will have no branch until they are assigned again. Old transactions stay in the records. This cannot be undone.</div>
      <div class="field"><label>Your password (Owner)</label><input id="bd-pass" type="password" autocomplete="current-password"></div>
      <div class="modal-actions"><button class="btn ghost" id="bd-x">Cancel</button><button class="btn danger" id="bd-ok">Delete Branch</button></div>`);
    document.getElementById('bd-x').onclick = closeModal;
    document.getElementById('bd-ok').onclick = async () => {
      const pw = document.getElementById('bd-pass').value;
      if (!pw) return toast('Please enter your password.');
      const btn = document.getElementById('bd-ok'); btn.disabled = true;
      try {
        const r = await Api.deleteBranch(b.id, pw);
        if (!r.success) { btn.disabled = false; return toast(r.message || 'Unable to delete.'); }
        Api.addLog('Branch Deleted', `${Api.user.name} deleted branch ${b.name}${b.location ? ' (' + b.location + ')' : ''}.`, Api.user.name);
        closeModal(); toast('Branch deleted.'); loadAll();
      } catch (err) { btn.disabled = false; toast(err.message); }
    };
  }

  // Owner: palitan ang password ng branch
  function changeBranchPassword(b) {
    if (!b) return;
    openModal(`<h3>New password for ${esc(b.name)}</h3>
      <p class="muted">At least 6 characters. Give the new password to the Staff and Admin who will join this branch.</p>
      <div class="field"><label>New branch password</label><input id="bp1" type="password" autocomplete="new-password"></div>
      <div class="field"><label>Confirm new password</label><input id="bp2" type="password" autocomplete="new-password"></div>
      <div class="modal-actions"><button class="btn ghost" id="bp-x">Cancel</button><button class="btn" id="bp-ok">Save</button></div>`);
    document.getElementById('bp-x').onclick = closeModal;
    document.getElementById('bp-ok').onclick = async () => {
      const a = document.getElementById('bp1').value;
      if (a.length < 6) return toast('Password must be at least 6 characters.');
      if (a !== document.getElementById('bp2').value) return toast('Passwords do not match.');
      const btn = document.getElementById('bp-ok'); btn.disabled = true;
      try {
        const r = await Api.changeBranchPassword(b.id, a);
        if (!r.success) { btn.disabled = false; return toast(r.message || 'Unable to change password.'); }
        Api.addLog('Branch Password Changed', `${Api.user.name} changed the password of ${b.name}.`, Api.user.name);
        closeModal();
        toast('Branch password changed.');
      } catch (err) { btn.disabled = false; toast(err.message); }
    };
  }

  function changePassword() {
    openModal(`<h3>Change Password</h3>
      <div class="field"><label>Current Password</label><input id="c1" type="password"></div>
      <div class="field"><label>New Password</label><input id="c2" type="password"></div>
      <div class="field"><label>Confirm New Password</label><input id="c3" type="password"></div>
      <div class="modal-actions"><button class="btn ghost" id="c-x">Cancel</button><button class="btn" id="c-ok">Save</button></div>`);
    document.getElementById('c-x').onclick = closeModal;
    document.getElementById('c-ok').onclick = async () => {
      const a = document.getElementById('c1').value, b = document.getElementById('c2').value, c = document.getElementById('c3').value;
      if (b.length < 6 || b !== c) return toast('Check the new password fields.');
      try {
        const r = await Api.changePassword(a, b);
        toast(r.message || (r.success ? 'Password changed.' : 'Unable to change the password.'));
        if (r.success) closeModal();
      } catch (err) { toast(err.message); }
    };
  }

  function changePin() {
    openModal(`<h3>Change PIN</h3>
      <div class="field"><label>Current PIN</label><input id="n1" type="password" inputmode="numeric" maxlength="6"></div>
      <div class="field"><label>New PIN (4-6 digits)</label><input id="n2" type="password" inputmode="numeric" maxlength="6"></div>
      <div class="field"><label>Confirm New PIN</label><input id="n3" type="password" inputmode="numeric" maxlength="6"></div>
      <div class="modal-actions"><button class="btn ghost" id="n-x">Cancel</button><button class="btn" id="n-ok">Save</button></div>`);
    ['n1', 'n2', 'n3'].forEach((id) => { const el = document.getElementById(id); el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, ''); }); });
    document.getElementById('n-x').onclick = closeModal;
    document.getElementById('n-ok').onclick = async () => {
      const a = document.getElementById('n1').value, b = document.getElementById('n2').value, c = document.getElementById('n3').value;
      if (!/^\d{4,6}$/.test(b)) return toast('New PIN must be 4 to 6 digits.');
      if (b !== c) return toast('The new PINs do not match.');
      try {
        const r = await Api.changePin(a, b);
        toast(r.message || (r.success ? 'PIN changed.' : 'Unable to change the PIN.'));
        if (r.success) closeModal();
      } catch (err) { toast(err.message); }
    };
  }

  // ---------------------------------------------------------------
  // MGA PINDUTAN SA BAWAT PAGE
  // ---------------------------------------------------------------
  function bindPage(r) {
    const page = document.getElementById('page');
    page.onclick = async (e) => {
      const row = e.target.closest('[data-tx]');
      if (row) return openTransaction(S.tx[parseInt(row.dataset.tx, 10)]);
      const rs = e.target.closest('[data-reset]');
      if (rs && isOwner()) return resetPassword(S.users[parseInt(rs.dataset.reset, 10)]);
      const rq = e.target.closest('[data-reqreset]');
      if (rq && isOwner()) {
        const q = S.pwReqs[parseInt(rq.dataset.reqreset, 10)];
        return resetPassword({ id: q.userId, name: q.name, email: q.email, role: q.role }, q.id);
      }
      const ds = e.target.closest('[data-dismiss]');
      if (ds && isOwner()) {
        const q = S.pwReqs[parseInt(ds.dataset.dismiss, 10)];
        try { await Api.dismissPasswordRequest(q.id); toast('Request dismissed.'); loadAll(); } catch (err) { toast(err.message); }
        return;
      }
      const ex = e.target.closest('[data-exp]');
      if (ex && isManager()) return doExport(ex.dataset.exp, ex.dataset.fmt);
      const tt = e.target.closest('[data-txtab]');
      if (tt && isManager()) { S.txTab = tt.dataset.txtab; return renderPage(); }
      const clh = e.target.closest('[data-chiploc]');
      if (clh) { const l = clh.dataset.chiploc; if (!S.chipLocClosed.delete(l)) S.chipLocClosed.add(l); return renderPage(); }
      const msb = e.target.closest('[data-msbranch]');
      if (msb && isOwner()) { S.msBranch = msb.dataset.msbranch; return renderPage(); }
      const txp = e.target.closest('[data-txp]');
      if (txp) { S.txPeriod = txp.dataset.txp; return renderPage(); }
      const msp = e.target.closest('[data-msp]');
      if (msp) { S.msPeriod = msp.dataset.msp; return renderPage(); }
      const mo = e.target.closest('[data-mreqopen]');
      if (mo && isAdmin()) return openManualRequest(S.mreqs[parseInt(mo.dataset.mreqopen, 10)], parseInt(mo.dataset.mreqopen, 10));
      const mq = e.target.closest('[data-mreq]');
      if (mq && isAdmin()) {
        const r = S.mreqs[parseInt(mq.dataset.mreq, 10)];
        if (!r) return;
        const approve = mq.dataset.ok === '1';
        const del = r.kind === 'delete';
        if (!confirm(approve ? (del ? `Delete this manual sale as requested by ${r.staffName}?` : `Apply the changes requested by ${r.staffName}?`) : `Reject the request of ${r.staffName}?`)) return;
        try {
          const res = await Api.decideManualRequest(r.id, approve);
          if (!res.success) throw new Error(res.message || 'Unable to save.');
          Api.addLog(approve ? 'Manual Request Approved' : 'Manual Request Rejected', `${Api.user.name} ${approve ? 'approved' : 'rejected'} the ${del ? 'delete' : 'edit'} request of ${r.staffName}.`, Api.user.name);
          toast(approve ? 'Request approved.' : 'Request rejected.');
        } catch (err) { toast(err.message); }
        return loadAll();
      }
      const msr = e.target.closest('[data-ms]');
      if (msr && isManager()) return openManualSale(S.manual[parseInt(msr.dataset.ms, 10)]);
      const bq = e.target.closest('[data-brreq]');
      if (bq && isManager()) {
        const q = S.brReqs[parseInt(bq.dataset.brreq, 10)];
        if (!q) return;
        const approve = bq.dataset.ok === '1';
        if (!confirm(`${approve ? 'Approve' : 'Reject'} ${q.name} moving to ${q.toBranch}?`)) return;
        page.querySelectorAll('[data-brreq]').forEach((b) => { b.disabled = true; });
        try {
          const r = await Api.decideBranchRequest(q.id, approve);
          if (!r.success) throw new Error(r.message || 'Unable to save.');
          Api.addLog(approve ? 'Branch Request Approved' : 'Branch Request Rejected',
            `${Api.user.name} ${approve ? 'approved' : 'rejected'} ${q.name} moving to ${q.toBranch}.`, Api.user.name);
          toast(approve ? 'Request approved.' : 'Request rejected.');
        } catch (err) { toast(err.message); }
        return loadAll();
      }
      const lh = e.target.closest('[data-loc]');
      if (lh) { const l = lh.dataset.loc; if (!S.openLocs.delete(l)) S.openLocs.add(l); return renderPage(); }
      const bd = e.target.closest('[data-brdel]');
      if (bd && isOwner()) return deleteBranch(S.branches[parseInt(bd.dataset.brdel, 10)]);
      const bl = e.target.closest('[data-brloc]');
      if (bl && isManager()) return changeBranchName(S.branches[parseInt(bl.dataset.brloc, 10)]);
      const bp = e.target.closest('[data-brpass]');
      if (bp && isOwner()) return changeBranchPassword(S.branches[parseInt(bp.dataset.brpass, 10)]);
      const act = e.target.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'refresh') { toast('Refreshing...'); return loadAll(); }
        if (a === 'addBranch' && isOwner()) return addBranch();
        if (a === 'calendar') return openCalendar();
        if (a === 'goManual') { S.txTab = 'manual'; if (location.hash === '#/transactions') renderPage(); else location.hash = '#/transactions'; return; }
        if (a === 'goLogs') { S.logBranch = 'All'; location.hash = '#/logs'; return; }
        if (a === 'goBranches') {
          location.hash = '#/profile';
          setTimeout(() => { const c = document.getElementById(isOwner() ? 'branches-card' : 'mybranch-card'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120);
          return;
        }
        if (a === 'goTx') { location.hash = '#/transactions'; return; }
        if (a === 'goWeek') {
          // Reports > Daily, naka-select ang araw ngayon
          S.reportMode = 'Daily';
          S.selectedBar = dateKey(new Date());
          location.hash = '#/reports';
          setTimeout(() => { const c = document.getElementById('income-card'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120);
          return;
        }
        if (a === 'best') {
          S.selectedBar = act.dataset.k;
          renderPage();
          setTimeout(() => { const c = document.getElementById('income-card'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
          return;
        }
        if (a === 'avg') return averageDetails();
        if (a === 'dupsToggle') { S.dupsOpen = !S.dupsOpen; return renderPage(); }
        if (a === 'dups') {
          S.dupsOpen = true;
          if (location.hash !== '#/reports') location.hash = '#/reports'; else renderPage();
          setTimeout(() => { const c = document.getElementById('dups-card'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
          return;
        }
        if (a === 'chpass') return changePassword();
        if (a === 'chpin') return changePin();
        if (a === 'privacy') return privacyNotice();
        if (a === 'logout') {
          if (!confirm('Are you sure you want to log out?')) return;
          await Api.logout();
          S.loaded = false; S.tx = []; S.dups = []; S.logs = []; S.users = []; S.branches = []; S.pwReqs = []; S.brReqs = []; S.manual = []; S.txTab = 'gcash';
          location.hash = '';
          return renderLogin();
        }
      }
      const seg = e.target.closest('#seg button');
      if (seg) { S.reportMode = seg.dataset.m; S.selectedBar = null; S.selectedMBar = null; return renderPage(); }
      const bb = e.target.closest('#branch-bars .bar');
      if (bb) { S.selectedBranch = bb.dataset.branch; return renderPage(); }
      const bar = e.target.closest('#bars .bar');
      if (bar) { S.selectedBar = bar.dataset.k; return renderPage(); }
    };
    if (r === 'transactions' && document.getElementById('ms-search')) {
      const m = document.getElementById('ms-search');
      m.oninput = () => { S.msSearch = m.value; const pos = m.selectionStart; renderPage(); const n = document.getElementById('ms-search'); n.focus(); n.setSelectionRange(pos, pos); };
    }
    if (r === 'transactions' && document.getElementById('tx-search')) {
      const s = document.getElementById('tx-search');
      s.oninput = () => { S.txSearch = s.value; const pos = s.selectionStart; renderPage(); const n = document.getElementById('tx-search'); n.focus(); n.setSelectionRange(pos, pos); };
      const chips = document.getElementById('br-chips');
      if (chips && isOwner()) chips.onclick = (e) => {
        const c = e.target.closest('[data-txbranch]');
        if (!c) return;
        S.txBranch = c.dataset.txbranch;
        renderPage();
      };
    }
    if (r === 'logs') {
      const s = document.getElementById('log-search');
      s.oninput = () => { S.logSearch = s.value; const pos = s.selectionStart; renderPage(); const n = document.getElementById('log-search'); n.focus(); n.setSelectionRange(pos, pos); };
      const lc = document.getElementById('log-chips');
      if (lc) lc.onclick = (e) => {
        const l = e.target.closest('[data-logloc]');
        if (l) { S.logLoc = l.dataset.logloc; S.logBranch = 'All'; return renderPage(); }
        const c = e.target.closest('[data-logbranch]');
        if (!c) return;
        S.logBranch = c.dataset.logbranch;
        renderPage();
      };
    }
  }

  // ---------------------------------------------------------------
  // SIMULA
  // ---------------------------------------------------------------
  window.addEventListener('hashchange', () => {
    if (!modal.dataset.locked) closeModal(); // isara ang bukas na detalye kapag lumipat ng page
    if (Api.token && Api.user) renderShell();
  });
  window.addEventListener('rs-session-expired', () => {
    toast('Your session has expired. Please log in again.');
    S.loaded = false;
    renderLogin();
  });

  if (Api.token && Api.user && !WEB_ROLES.includes(String(Api.user.role))) {
    Api.logout();
  }
  if (Api.token && Api.user) {
    // Tingnan kung buhay pa ang session (hal. pagka-refresh ng page)
    Api.post({ action: 'ping' }).then((r) => {
      if (r && r.success) renderShell(); else renderLogin();
    }).catch(() => renderLogin());
  } else {
    renderLogin();
  }
})();
