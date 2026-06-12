// ── Admin Panel ───────────────────────────────────────────────────────────────

Router.register('admin', async function(container) {
  const user = Auth.getUser();
  let adminPw = sessionStorage.getItem('wcp_admin_pw') || '';

  async function renderPasswordGate() {
    // Only show the first-time setup card when no admin password exists yet.
    // On error, default to hidden (safer than re-showing setup for a configured pool).
    let pwSet = true;
    try { pwSet = !!(await API.get('getConfig')).admin_password_set; } catch (e) {}

    const setupCard = pwSet ? '' : `
        <div class="admin-card" style="margin-top:1rem;">
          <h2>First Time Setup</h2>
          <p style="font-size:.85rem;color:var(--muted);margin-bottom:.75rem;">
            No password set yet? Create one here. This only works if the admin password field in your Google Sheet's Config tab is empty.
          </p>
          <form id="first-time-form">
            <div class="field">
              <label>Choose Admin Password</label>
              <input type="password" id="first-time-pw" required minlength="6" placeholder="min 6 characters">
            </div>
            <button type="submit" class="btn-secondary">Set Admin Password</button>
            <p id="first-time-err" class="error-msg hidden"></p>
          </form>
        </div>`;

    container.innerHTML = `
      <div class="page-admin">
        <div class="page-header"><h1>Admin Panel</h1></div>
        <div class="admin-card">
          <h2>Admin Login</h2>
          <p style="font-size:.85rem;color:var(--muted);margin-bottom:.75rem;">This password is separate from your player account. Only you know it.</p>
          <form id="admin-auth-form">
            <div class="field">
              <label>Admin Password</label>
              <input type="password" id="admin-pw-input" required>
            </div>
            <button type="submit" class="btn-primary">Unlock</button>
            <p id="admin-auth-err" class="error-msg hidden"></p>
          </form>
        </div>
        ${setupCard}
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

    const firstTimeForm = document.getElementById('first-time-form');
    if (firstTimeForm) firstTimeForm.addEventListener('submit', async e => {
      e.preventDefault();
      const newPw = document.getElementById('first-time-pw').value;
      const errEl = document.getElementById('first-time-err');
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Setting…';
      const res = await API.post({ action: 'setAdminPassword', new_password: newPw, old_password: '' });
      if (res.error) {
        errEl.textContent = 'Failed — a password may already be set. Use the login form above.';
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Set Admin Password';
        return;
      }
      adminPw = newPw;
      sessionStorage.setItem('wcp_admin_pw', newPw);
      const usersRes = await API.post({ action: 'adminGetUsers', admin_password: newPw });
      renderAdminPanel(usersRes.users || []);
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

    const teamOpts = '<option value="">-- team --</option>' +
      (window.ALL_TEAMS || []).map(t => `<option value="${t}">${t}</option>`).join('');
    const roundOpts = CONFIG.ROUNDS.map(r => `<option value="${r}">${r}</option>`).join('');

    // Bracket lock time: prefill the datetime-local in local time + show a friendly label
    const blIso = configData.bracket_lock || '';
    const pad = n => String(n).padStart(2, '0');
    const bracketLockLocal = blIso
      ? (() => { const d = new Date(blIso); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; })()
      : '';
    const bracketLockDisplay = blIso
      ? new Date(blIso).toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' })
      : 'not set';

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

        <!-- Knockout result entry -->
        <div class="admin-card">
          <h2>Knockout Bracket Results</h2>
          <p>Used from June 28. Set the two teams, the round, and the match number (left-to-right, top-to-bottom on the bracket), then enter the result. Use the score <em>after</em> extra-time/penalties so there's a clear winner. This scores everyone's bracket picks for that slot.</p>
          <form id="knockout-form">
            <div class="score-row">
              <div class="field">
                <label>Round</label>
                <select id="ko-round">${roundOpts}</select>
              </div>
              <div class="field">
                <label>Match # (slot)</label>
                <input type="number" id="ko-idx" min="1" max="16" value="1" required>
              </div>
            </div>
            <div class="score-row">
              <div class="field">
                <label>Home Team</label>
                <select id="ko-home">${teamOpts}</select>
              </div>
              <div class="field">
                <label>Away Team</label>
                <select id="ko-away">${teamOpts}</select>
              </div>
            </div>
            <div class="score-row">
              <div class="field">
                <label>Home Score</label>
                <input type="number" id="ko-home-score" min="0" max="30">
              </div>
              <span class="score-sep-admin">:</span>
              <div class="field">
                <label>Away Score</label>
                <input type="number" id="ko-away-score" min="0" max="30">
              </div>
            </div>
            <button type="submit" class="btn-primary">Save Knockout Result</button>
            <p class="admin-hint">Leave scores blank to just set the matchup (so players can pick before kickoff). Fill scores to record the final.</p>
            <p id="ko-status" class="status-msg hidden"></p>
          </form>
        </div>

        <!-- Macro answers -->
        <div class="admin-card">
          <h2>Macro Pick Answers</h2>
          <p>Enter at tournament end to score macro picks. Fill only the ones that are decided — each saves independently. Player names match case-insensitively, but spell them as players entered them.</p>
          <form id="macro-answers-form">
            <div class="field">
              <label>🥈 Runner-up (team)</label>
              <select id="ma-runner-up">${teamOpts}</select>
            </div>
            <div class="field">
              <label>🥉 Third Place (team)</label>
              <select id="ma-third">${teamOpts}</select>
            </div>
            <div class="field">
              <label>⚽ Golden Ball (player)</label>
              <input type="text" id="ma-ball" placeholder="Player name">
            </div>
            <div class="field">
              <label>👟 Golden Boot (player)</label>
              <input type="text" id="ma-boot" placeholder="Player name">
            </div>
            <div class="field">
              <label>🧤 Golden Glove (player)</label>
              <input type="text" id="ma-glove" placeholder="Player name">
            </div>
            <button type="submit" class="btn-primary">Score Macro Picks</button>
            <p id="macro-answers-status" class="status-msg hidden"></p>
          </form>
        </div>

        <!-- Tournament phase -->
        <div class="admin-card">
          <h2>Tournament Phase</h2>
          <p>Current: <strong>${phase}</strong>. Set to "knockout" once the Round of 32 is built so players can fill their brackets. (Group/macro locking is automatic by kickoff time — phase no longer freezes picks.)</p>
          <select id="phase-select">${phaseOptions}</select>
          <button id="phase-btn" class="btn-secondary">Update Phase</button>
          <p id="phase-status" class="status-msg hidden"></p>
        </div>

        <!-- Bracket lock time -->
        <div class="admin-card">
          <h2>Bracket Lock Time</h2>
          <p>The whole bracket freezes at this moment — set it to the <strong>first knockout game's kickoff</strong>. Enter it in your local time.</p>
          <input type="datetime-local" id="bracket-lock-input" value="${bracketLockLocal}">
          <button id="bracket-lock-btn" class="btn-secondary">Save Bracket Lock</button>
          <p class="admin-hint">Currently locks at: ${bracketLockDisplay}</p>
          <p id="bracket-lock-status" class="status-msg hidden"></p>
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
      if (!res.error) { API.invalidate('getFixtures'); API.invalidate('getLeaderboard'); API.invalidate('getUserPicks'); }
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
        if (!res.error) { API.invalidate('getFixtures'); API.invalidate('getLeaderboard'); API.invalidate('getUserPicks'); }
        st.textContent = res.error ? 'Error: ' + res.error : '✓ Result saved and scores updated.';
        st.className = 'status-msg ' + (res.error ? 'error' : 'success');
        btn.disabled = false;
        btn.textContent = 'Submit Result';
        if (!res.error) setTimeout(() => renderAdminPanel(users), 1500);
      });
    }

    // Knockout result entry
    document.getElementById('knockout-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      const st  = document.getElementById('ko-status');
      const home = document.getElementById('ko-home').value;
      const away = document.getElementById('ko-away').value;
      const hs   = document.getElementById('ko-home-score').value;
      const as   = document.getElementById('ko-away-score').value;

      if (!home || !away) {
        st.textContent = 'Pick both teams.';
        st.className = 'status-msg error';
        return;
      }
      if (home === away) {
        st.textContent = 'Home and away must be different teams.';
        st.className = 'status-msg error';
        return;
      }
      const hasScore = hs !== '' && as !== '';
      if (hasScore && parseInt(hs) === parseInt(as)) {
        st.textContent = 'Knockout games need a winner — enter the score after ET/penalties.';
        st.className = 'status-msg error';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Saving…';
      const res = await API.post({
        action: 'upsertKnockout',
        round: document.getElementById('ko-round').value,
        match_index: parseInt(document.getElementById('ko-idx').value),
        home, away,
        home_score: hasScore ? parseInt(hs) : '',
        away_score: hasScore ? parseInt(as) : '',
        admin_password: adminPw
      });
      if (!res.error) { API.invalidate('getFixtures'); API.invalidate('getLeaderboard'); API.invalidate('getUserPicks'); }
      st.textContent = res.error ? 'Error: ' + res.error
        : (hasScore ? '✓ Result saved — bracket picks scored.' : '✓ Matchup set.');
      st.className = 'status-msg ' + (res.error ? 'error' : 'success');
      btn.disabled = false;
      btn.textContent = 'Save Knockout Result';
    });

    // Macro answers
    document.getElementById('macro-answers-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      const st  = document.getElementById('macro-answers-status');
      const answers = {};
      const ru = document.getElementById('ma-runner-up').value;
      const tp = document.getElementById('ma-third').value;
      const gb = document.getElementById('ma-ball').value.trim();
      const gbo = document.getElementById('ma-boot').value.trim();
      const gg = document.getElementById('ma-glove').value.trim();
      if (ru)  answers.runner_up   = ru;
      if (tp)  answers.third_place  = tp;
      if (gb)  answers.golden_ball  = gb;
      if (gbo) answers.golden_boot  = gbo;
      if (gg)  answers.golden_glove = gg;

      if (Object.keys(answers).length === 0) {
        st.textContent = 'Fill at least one answer.';
        st.className = 'status-msg error';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Scoring…';
      const res = await API.post({ action: 'enterMacroAnswers', answers, admin_password: adminPw });
      if (!res.error) { API.invalidate('getLeaderboard'); API.invalidate('getUserPicks'); }
      st.textContent = res.error ? 'Error: ' + res.error : '✓ Macro picks scored — leaderboard updated.';
      st.className = 'status-msg ' + (res.error ? 'error' : 'success');
      btn.disabled = false;
      btn.textContent = 'Score Macro Picks';
    });

    // Phase switch
    document.getElementById('phase-btn').addEventListener('click', async () => {
      const btn = document.getElementById('phase-btn');
      const st  = document.getElementById('phase-status');
      const phase = document.getElementById('phase-select').value;
      btn.disabled = true;
      const res = await API.post({ action: 'setPhase', phase, admin_password: adminPw });
      if (!res.error) API.invalidate('getConfig');
      st.textContent = res.error ? 'Error: ' + res.error : `✓ Phase set to "${phase}"`;
      st.className = 'status-msg ' + (res.error ? 'error' : 'success');
      btn.disabled = false;
    });

    // Bracket lock time
    document.getElementById('bracket-lock-btn').addEventListener('click', async () => {
      const btn = document.getElementById('bracket-lock-btn');
      const st  = document.getElementById('bracket-lock-status');
      const val = document.getElementById('bracket-lock-input').value; // local datetime
      if (!val) {
        st.textContent = 'Pick a date and time first.';
        st.className = 'status-msg error';
        return;
      }
      btn.disabled = true;
      // Convert the admin's local datetime to an ISO (UTC) instant
      const iso = new Date(val).toISOString();
      const res = await API.post({ action: 'setBracketLock', value: iso, admin_password: adminPw });
      if (!res.error) API.invalidate('getConfig');
      st.textContent = res.error ? 'Error: ' + res.error : '✓ Bracket lock time saved.';
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
