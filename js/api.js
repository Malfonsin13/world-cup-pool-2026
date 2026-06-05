// ── API wrapper ───────────────────────────────────────────────────────────────
// POST uses Content-Type: text/plain to avoid CORS preflight with Apps Script.

window.API = {
  async get(action, params = {}) {
    const url = new URL(CONFIG.APPS_SCRIPT_URL);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    return res.json();
  },

  async post(data) {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  // Authenticated GET — attaches token automatically
  async getAuth(action, extra = {}) {
    const token = Auth.getToken();
    if (!token) throw new Error('Not logged in');
    return this.get(action, { token, ...extra });
  },

  // Authenticated POST
  async postAuth(data) {
    const token = Auth.getToken();
    if (!token) throw new Error('Not logged in');
    return this.post({ ...data, token });
  }
};
