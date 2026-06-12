// ── API wrapper ───────────────────────────────────────────────────────────────
// POST uses Content-Type: text/plain to avoid CORS preflight with Apps Script.
//
// GET responses are cached in-memory with a short per-action TTL so flipping between
// tabs doesn't re-hit the (~3 s) Apps Script backend every time. Static config caches
// for a couple minutes; everything that carries RESULTS (your points, scores, standings)
// caches only ~30 s so a scored game still shows up quickly. Writes bust the relevant
// caches via API.invalidate(action).

const _apiCache = {};
const _apiTTL = {
  getConfig:      120000,  // near-static (lock times, phase) — on every page
  getUserPicks:    30000,  // carries your per-game points
  getFixtures:     30000,  // carries scores
  getLeaderboard:  30000   // carries standings
};

window.API = {
  async get(action, params = {}) {
    const key = action + '|' + JSON.stringify(params);
    const ttl = _apiTTL[action] || 0;
    const hit = _apiCache[key];
    if (ttl && hit && (Date.now() - hit.ts) < ttl) return hit.data;

    const url = new URL(CONFIG.APPS_SCRIPT_URL);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    const data = await res.json();

    // Measure the client↔server clock offset ONCE from any getConfig, so views can rely on
    // a stable offset even when config is later served from cache (keeps lock/countdown accurate).
    if (action === 'getConfig' && data && data.server_time && window.__clockOffset === undefined) {
      window.__clockOffset = Date.now() - new Date(data.server_time).getTime();
    }

    if (ttl) _apiCache[key] = { ts: Date.now(), data };
    return data;
  },

  // Drop all cached entries for an action (call after a write that changes that data).
  invalidate(action) {
    Object.keys(_apiCache).forEach(k => { if (k.startsWith(action + '|')) delete _apiCache[k]; });
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
