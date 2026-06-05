// ── Auth ──────────────────────────────────────────────────────────────────────

window.Auth = {
  _user: null,

  init() {
    const stored = localStorage.getItem('wcp_session');
    if (stored) {
      try { this._user = JSON.parse(stored); } catch { this._user = null; }
    }
  },

  getToken() {
    return this._user ? this._user.token : null;
  },

  getUser() {
    return this._user ? this._user.user : null;
  },

  isLoggedIn() {
    return !!this._user;
  },

  _save(token, user) {
    this._user = { token, user };
    localStorage.setItem('wcp_session', JSON.stringify(this._user));
  },

  logout() {
    this._user = null;
    localStorage.removeItem('wcp_session');
    Router.navigate('login');
  },

  async register(email, displayName, password) {
    const data = await API.post({ action: 'register', email, display_name: displayName, password });
    if (data.error) throw new Error(data.error);
    this._save(data.token, data.user);
    return data.user;
  },

  async login(email, password) {
    const data = await API.post({ action: 'login', email, password });
    if (data.error) throw new Error(data.error);
    this._save(data.token, data.user);
    return data.user;
  },

  renderLoginPage() {
    return `
      <div class="auth-card">
        <div class="auth-logo">⚽</div>
        <h1>World Cup Pool 2026</h1>
        <p class="auth-subtitle">Pick scores. Fill brackets. Win money.</p>

        <div class="tab-bar">
          <button class="tab active" data-tab="login">Sign In</button>
          <button class="tab" data-tab="register">Create Account</button>
        </div>

        <form id="login-form" class="auth-form">
          <div class="field">
            <label>Email</label>
            <input type="email" id="login-email" required autocomplete="email">
          </div>
          <div class="field">
            <label>Password</label>
            <input type="password" id="login-pw" required autocomplete="current-password">
          </div>
          <button type="submit" class="btn-primary">Sign In</button>
          <p id="login-error" class="error-msg hidden"></p>
        </form>

        <form id="register-form" class="auth-form hidden">
          <div class="field">
            <label>Display Name</label>
            <input type="text" id="reg-name" required placeholder="How you'll appear on the leaderboard">
          </div>
          <div class="field">
            <label>Email</label>
            <input type="email" id="reg-email" required autocomplete="email">
          </div>
          <div class="field">
            <label>Password <span class="hint">(min 6 characters)</span></label>
            <input type="password" id="reg-pw" required minlength="6" autocomplete="new-password">
          </div>
          <button type="submit" class="btn-primary">Create Account</button>
          <p id="reg-error" class="error-msg hidden"></p>
        </form>
      </div>
    `;
  },

  bindLoginEvents() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
        document.getElementById(`${tab.dataset.tab}-form`).classList.remove('hidden');
      });
    });

    document.getElementById('login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      const errEl = document.getElementById('login-error');
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      errEl.classList.add('hidden');
      try {
        await Auth.login(
          document.getElementById('login-email').value.trim(),
          document.getElementById('login-pw').value
        );
        Router.navigate('picks');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    });

    document.getElementById('register-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      const errEl = document.getElementById('reg-error');
      btn.disabled = true;
      btn.textContent = 'Creating account…';
      errEl.classList.add('hidden');
      try {
        await Auth.register(
          document.getElementById('reg-email').value.trim(),
          document.getElementById('reg-name').value.trim(),
          document.getElementById('reg-pw').value
        );
        Router.navigate('picks');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Create Account';
      }
    });
  }
};
