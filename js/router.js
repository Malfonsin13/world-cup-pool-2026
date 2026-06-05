// ── Router ────────────────────────────────────────────────────────────────────

window.Router = {
  _routes: {},

  register(name, fn) {
    this._routes[name] = fn;
  },

  navigate(name, params = {}) {
    if (!Auth.isLoggedIn() && name !== 'login') {
      window.location.hash = '#/login';
      return;
    }
    if (Auth.isLoggedIn() && name === 'login') {
      window.location.hash = '#/picks';
      return;
    }
    window.location.hash = '#/' + name;
  },

  async render(hash) {
    const name = (hash || '').replace('#/', '') || 'picks';

    if (!Auth.isLoggedIn() && name !== 'login') {
      this._renderView('login');
      return;
    }
    if (Auth.isLoggedIn() && name === 'login') {
      this._renderView('picks');
      return;
    }
    this._renderView(name);
  },

  async _renderView(name) {
    const main = document.getElementById('main');
    if (!main) return;

    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.route === name);
    });

    // Show/hide nav
    const nav = document.getElementById('nav');
    if (nav) nav.style.display = name === 'login' ? 'none' : 'flex';

    if (name === 'login') {
      main.innerHTML = Auth.renderLoginPage();
      Auth.bindLoginEvents();
      return;
    }

    const handler = this._routes[name];
    if (!handler) {
      main.innerHTML = '<div class="page-error">Page not found.</div>';
      return;
    }

    main.innerHTML = '<div class="loading">Loading…</div>';
    try {
      await handler(main);
    } catch (err) {
      main.innerHTML = `<div class="page-error">Error loading page: ${err.message}</div>`;
      console.error(err);
    }
  },

  init() {
    const onHash = () => this.render(window.location.hash);
    window.addEventListener('hashchange', onHash);
    onHash();
  }
};
