// ── Admin Panel ───────────────────────────────────────────────────────────────

Router.register('admin', async function(container) {
  const user = Auth.getUser();
  let adminPw = sessionStorage.getItem('wcp_admin_pw') || '';

  function renderPasswordGate() {
    container.innerHTML = `
      <div class="page-admin">
        <div class="page-header"><h1>Admin Panel</h1></div>
        <div class="admin-card">
          <h2>Admin Login</h2>
          <form id="admin-auth-form">
            <div class="field">
              <label>Admin Password</label>
              <input type="password" id="admin-pw-input" required>
            </div>
            <button type="submit" class="btn-primary">Unlock</button>
            <p id="admin-auth-err" class="error-msg hidden"></p>
          </form>
          <p class="admin-hint">If no password is set yet, use the <strong>setAdminPassword</strong> endpoint to create one.</p>
        </div>
      </div>`;

    document.getElementById('admin-auth-form').addEventListener('submit', async e => {
      e.preventDefault();
      const pw = document.getElementById('admin-pw-input').value;
      const errEl = document.getElementById('admin-auth-err');
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Checking…';
      // Verify by fetching user list (admin endpoint)
      const res = await API.post({ action: 'adminGetUsers', admin_password: pw });
      if (res.error) {
        errEl.textContent = 'Wrong password.';
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Unlock';
        return;
      }
      adminPw = pw;
      sessionStorage.setItem('wcp_admin_pw', pw);
      renderAdminPanel(res.users || []);
    });
  }

  async function renderAdminPanel(users) {
    const [fixturesData, configData] = await Promise.all([
      API.get('getFixtures'),
      API.get('getConfig')
    ]);

    const fixtures    = fixturesData.fixtures || [];
    const phase       = configData.tournament_status || 'pre';
    const pendingFix  = fixtures.filter(f => f.status !== 'final');
    const paidCount   = users.filter(u => u.has_paid === true || u.has_paid === 'TRUE').length;

    const fixtureOptions = pendingFix.map(f =>
      `<option value="${f.id}">${f.group ? 'Group ' + f.group + ' · ' : ''}${f.home} vs ${f.away} (${f.utc_date ? f.utc_date.slice(0,10) : ''})</option>`
    ).join('');

    const userRows = users.map(u => `
      <tr>
        <td>${u.display_name}</td>
        <td class="email-col">${u.email}</td>
        <td>
          <button class="btn-paid ${u.has_paid === true || u.has_paid === 'TRUE' ? 'paid' : 'unpaid'}"
                  data-uid="${u.id}" data-paid="${u.has_paid === true || u.has_paid === 'TRUE' ? 'true' : 'false'}">
            ${u.has_paid === true || u.has_paid === 'TRUE' ? '✓ Paid' : '✗ Unpaid'}
          </button>
        </td>
      </tr>`).join('');

    const phaseOptions = ['pre','group','knockout','done'].map(p =>
      `<option value="${p}" ${p === phase ? 'selected' : ''}>${p}</option>`).join('');

    container.innerHTML = `
      <div class="page-admin">
        <div class="page-header">
          <h1>Admin Panel</h1>
          <button id="admin-logout" class="btn-ghost">Lock</button>
        </div>

        <!-- Auto-fetch -->
        <div class="admin-card">
          <h2>Results Auto-Fetch</h2>
          <p>Results are fetched automatically every 15 minutes. Use this to trigger an immediate update.</p>
          <button id="fetch-now-btn" class="btn-primary">Fetch Results Now</button>
          <p id="fetch-status" class="status-msg hidden"></p>
        </div>

        <!-- Manual result override -->
        <div class="admin-card">
          <h2>Manual Result Override</h2>
          <p>Use if the auto-fetch missed a result.</p>
          ${pendingFix.length === 0
            ? '<p class="muted">All fixtures are finalised.</p>'
            : `<form id="override-form">
                <div class="field">
                  <label>Fixture</label>
                  <select id="override-fixture">${fixtureOptions}</select>
                </div>
                <div class="score-row">
                  <div class="field">
                    <label>Home Score</label>
                    <input type="number" id="override-home" min="0" max="20" required>
                  </div>
                  <span class="score-sep-admin">:</span>
                  <div class="field">
                    <label>Away Score</label>
                    <input type="number" id="override-away" min="0" max="20" required>
                  </div>
                </div>
                <button type="submit" class="btn-primary">Submit Result</button>
                <p id="override-status" class="status-msg hidden"></p>
              </form>`
          }
        </div>

        <!-- Tournament phase -->
        <div class="admin-card">
          <h2>Tournament Phase</h2>
          <p>Current: <strong>${phase}</strong>. Switching to "group" locks all pre-tournament picks.</p>
          <select id="phase-select">${phaseOptions}</select>
          <button id="phase-btn" class="btn-secondary">Update Phase</button>
          <p id="phase-status" class="status-msg hidden"></p>
        </div>

        <!-- Payment management -->
        <div class="admin-card">
          <h2>Payment Status</h2>
          <p>${paidCount} of ${users.length} paid · Pool: $${paidCount * CONFIG.BUY_IN}</p>
          <table class="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Status</th></tr></thead>
            <tbody id="users-tbody">${userRows}</tbody>
          </table>
          <p id="pay-status" class="status-msg hidden"></p>
        </div>

        <!-- Change admin password -->
        <div class="admin-card">
          <h2>Change Admin Password</h2>
          <form id="pw-change-form">
            <div class="field">
              <label>New Password</label>
              <input type="password" id="new-admin-pw" required minlength="6">
            </div>
            <button type="submit" class="btn-secondary">Update Password</button>
            <p id="pw-status" class="status-msg hidden"></p>
          </form>
        </div>
      </div>`;

    // Lock admin session
    document.getElementById('admin-logout').addEventListener('click', () => {
      sessionStorage.removeItem('wcp_admin_pw');
      adminPw = '';
      renderPasswordGate();
    });

    // Fetch now
    document.getElementById('fetch-now-btn').addEventListener('click', async () => {
      const btn = document.getElementById('fetch-now-btn');
      const st  = document.getElementById('fetch-status');
      btn.disabled = true;
      btn.textContent = 'Fetching…';
      const res = await API.post({ action: 'triggerFetch', admin_password: adminPw });
      st.textContent = res.error ? 'Error: ' + res.error : '✓ Fetch triggered — leaderboard will update shortly.';
      st.className = 'status-msg ' + (res.error ? 'error' : 'success');
      btn.disabled = false;
      btn.textContent = 'Fetch Results Now';
    });

    // Manual override
    const overrideForm = document.getElementById('override-form');
    if (overrideForm) {
      overrideForm.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type=submit]');
        const st  = document.getElementById('override-status');
        btn.disabled = true;
        btn.textContent = 'Submitting…';
        const res = await API.post({
          action: 'overrideResult',
          fixture_id: document.getElementById('override-fixture').value,
          home_score: parseInt(document.getElementById('override-home').value),
          away_score: parseInt(document.getElementById('override-away').value),
          admin_password: adminPw
        });
        st.textContent = res.error ? 'Error: ' + res.error : '✓ Result saved and scores updated.';
        st.className = 'status-msg ' + (res.error ? 'error' : 'success');
        btn.disabled = false;
        btn.textContent = 'Submit Result';
        if (!res.error) setTimeout(() => renderAdminPanel(users), 1500);
      });
    }

    // Phase switch
    document.getElementById('phase-btn').addEventListener('click', async () => {
      const btn = document.getElementById('phase-btn');
      const st  = document.getElementById('phase-status');
      const phase = document.getElementById('phase-select').value;
      btn.disabled = true;
      const res = await API.post({ action: 'setPhase', phase, admin_password: adminPw });
      st.textContent = res.error ? 'Error: ' + res.error : `✓ Phase set to "${phase}"`;
      st.className = 'status-msg ' + (res.error ? 'error' : 'success');
      btn.disabled = false;
    });

    // Payment toggles
    document.getElementById('users-tbody').addEventListener('click', async e => {
      const btn = e.target.closest('.btn-paid');
      if (!btn) return;
      const uid     = btn.dataset.uid;
      const isPaid  = btn.dataset.paid === 'true';
      const newPaid = !isPaid;
      const st      = document.getElementById('pay-status');
      btn.disabled  = true;
      const res = await API.post({ action: 'setPaid', user_id: uid, paid: newPaid, admin_password: adminPw });
      if (res.error) {
        st.textContent = 'Error: ' + res.error;
        st.className = 'status-msg error';
        btn.disabled = false;
        return;
      }
      btn.dataset.paid = newPaid ? 'true' : 'false';
      btn.className = 'btn-paid ' + (newPaid ? 'paid' : 'unpaid');
      btn.textContent = newPaid ? '✓ Paid' : '✗ Unpaid';
      btn.disabled = false;
      st.textContent = `✓ ${users.find(u=>u.id===uid)?.display_name || 'User'} marked as ${newPaid ? 'paid' : 'unpaid'}`;
      st.className = 'status-msg success';
    });

    // Change admin password
    document.getElementById('pw-change-form').addEventListener('submit', async e => {
      e.preventDefault();
      const newPw = document.getElementById('new-admin-pw').value;
      const st    = document.getElementById('pw-status');
      const btn   = e.target.querySelector('button');
      btn.disabled = true;
      const res = await API.post({ action: 'setAdminPassword', new_password: newPw, old_password: adminPw });
      if (!res.error) {
        adminPw = newPw;
        sessionStorage.setItem('wcp_admin_pw', newPw);
      }
      st.textContent = res.error ? 'Error: ' + res.error : '✓ Password updated.';
      st.className = 'status-msg ' + (res.error ? 'error' : 'success');
      btn.disabled = false;
    });
  }

  if (!adminPw) {
    renderPasswordGate();
  } else {
    const res = await API.post({ action: 'adminGetUsers', admin_password: adminPw });
    if (res.error) {
      sessionStorage.removeItem('wcp_admin_pw');
      adminPw = '';
      renderPasswordGate();
    } else {
      renderAdminPanel(res.users || []);
    }
  }
});
