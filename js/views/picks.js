// ── Group Stage Picks ─────────────────────────────────────────────────────────

Router.register('picks', async function(container) {
  const [picksData, configData] = await Promise.all([
    API.getAuth('getUserPicks'),
    API.get('getConfig')
  ]);

  const existingPicks = {};
  if (picksData.group_picks) {
    picksData.group_picks.forEach(p => {
      existingPicks[p.fixture_id] = { home: p.home_pred, away: p.away_pred, pts: p.pts_awarded };
    });
  }

  const fixtures = window.FIXTURES;

  // Per-game locking driven by the server clock (so a wrong local clock can't cheat the display).
  const offset = configData.server_time ? (Date.now() - new Date(configData.server_time).getTime()) : 0;
  const nowMs = () => Date.now() - offset;                 // server-aligned "now"
  const gameLocked = f => new Date(f.utc).getTime() <= nowMs();
  const anyOpen = fixtures.some(f => !gameLocked(f));
  const globalFreeze = !!configData.picks_locked;          // optional admin "freeze everything"
  const canEdit = anyOpen && !globalFreeze;

  const startMs = configData.tournament_start ? new Date(configData.tournament_start).getTime() : null;
  const beforeStart = startMs !== null && nowMs() < startMs;

  function fmtCountdown(ms) {
    if (ms <= 0) return '0s';
    let s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600);  s -= h * 3600;
    const m = Math.floor(s / 60);    s -= m * 60;
    const parts = [];
    if (d) parts.push(d + 'd');
    if (d || h) parts.push(h + 'h');
    parts.push(m + 'm');
    parts.push(s + 's');
    return parts.join(' ');
  }

  const countdownsHTML = `
    <div class="countdowns" id="countdown-wrap">
      ${beforeStart ? `
      <div class="cd-card cd-tournament" id="cd-tournament">
        <div class="cd-label">⏱️ Tournament starts in</div>
        <div class="cd-time" id="cd-tournament-val">—</div>
      </div>` : ''}
      <div class="cd-card cd-next" id="cd-next">
        <div class="cd-label">⚽ Next game</div>
        <div class="cd-next-teams" id="cd-next-teams"></div>
        <div class="cd-time" id="cd-next-val">—</div>
      </div>
    </div>`;

  // Group by group letter
  const byGroup = {};
  fixtures.forEach(f => {
    if (!byGroup[f.group]) byGroup[f.group] = [];
    byGroup[f.group].push(f);
  });

  const lockBanner = globalFreeze
    ? `<div class="banner banner-warning">⏰ Predictions are locked.</div>`
    : canEdit
      ? `<div class="banner banner-info">Each game locks at <strong>kickoff</strong> — edit any pick until that game starts. 5 pts exact score, 2 pts correct result. Times shown in your local U.S. time zone.</div>`
      : `<div class="banner banner-warning">⏰ All games have started — group picks are closed.</div>`;

  // Order mode: 'group' (by group letter) or 'day' (by calendar date, viewer's local time)
  const ORDER_KEY = 'wcp_picks_order';
  let orderMode = localStorage.getItem(ORDER_KEY) === 'day' ? 'day' : 'group';

  function renderRow(f, values) {
    const pick = values[f.id] || {};
    const homeVal = pick.home !== undefined && pick.home !== null ? pick.home : '';
    const awayVal = pick.away !== undefined && pick.away !== null ? pick.away : '';
    const ptsClass = pick.pts == 5 ? 'pts-exact' : pick.pts == 2 ? 'pts-result' : pick.pts == 0 ? 'pts-wrong' : '';
    const ptsLabel = pick.pts == 5 ? '✓ 5' : pick.pts == 2 ? '~ 2' : pick.pts == 0 ? '✗ 0' : '';
    const kickoff = formatKickoff(f.utc);
    const rowLocked = gameLocked(f) || globalFreeze;
    return `
        <tr data-id="${f.id}" class="${rowLocked ? 'locked-row' : ''}">
          <td class="fixture-date">${rowLocked ? '🔒 ' : ''}${kickoff}</td>
          <td class="match-cell">
            <div class="match-row">
              <span class="t-home">${teamWithFlag(f.home, 'left')}</span>
              <div class="score-input">
                ${rowLocked
                  ? `<span class="score-static">${homeVal !== '' ? homeVal : '—'}</span>`
                  : `<input type="number" class="score-home" min="0" max="20" value="${homeVal}" placeholder="-">`
                }
                <span class="score-sep">:</span>
                ${rowLocked
                  ? `<span class="score-static">${awayVal !== '' ? awayVal : '—'}</span>`
                  : `<input type="number" class="score-away" min="0" max="20" value="${awayVal}" placeholder="-">`
                }
              </div>
              <span class="t-away">${teamWithFlag(f.away, 'right')}</span>
            </div>
          </td>
          <td class="pts-cell ${ptsClass}">${ptsLabel}</td>
        </tr>`;
  }

  function section(title, games, values) {
    const rows = games.map(f => renderRow(f, values)).join('');
    return `
      <section class="group-section">
        <h2 class="group-title">${title}</h2>
        <table class="fixtures-table"><tbody>${rows}</tbody></table>
      </section>`;
  }

  function buildByGroup(values) {
    return window.GROUPS.map(g => section('Group ' + g, byGroup[g] || [], values)).join('');
  }

  function buildByDay(values) {
    const byDay = {};
    fixtures.forEach(f => {
      const key = new Date(f.utc).toLocaleDateString('en-CA'); // YYYY-MM-DD in local zone (sortable)
      (byDay[key] = byDay[key] || []).push(f);
    });
    return Object.keys(byDay).sort().map(key => {
      const games = byDay[key].slice().sort((a, b) => new Date(a.utc).getTime() - new Date(b.utc).getTime());
      const label = new Date(games[0].utc).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      return section(label, games, values);
    }).join('');
  }

  function renderGroups(values) {
    return orderMode === 'day' ? buildByDay(values) : buildByGroup(values);
  }

  // Snapshot current scores from the DOM (preserve unsaved edits) merged over saved picks,
  // so toggling the order doesn't wipe what someone just typed.
  function snapshotValues() {
    const vals = {};
    Object.keys(existingPicks).forEach(id => { vals[id] = Object.assign({}, existingPicks[id]); });
    document.querySelectorAll('tr[data-id]').forEach(row => {
      const id = row.dataset.id;
      const h = row.querySelector('.score-home');
      const a = row.querySelector('.score-away');
      if (h || a) {
        vals[id] = vals[id] || {};
        if (h) vals[id].home = h.value;
        if (a) vals[id].away = a.value;
      }
    });
    return vals;
  }

  const user = Auth.getUser();
  container.innerHTML = `
    <div class="page-picks">
      <div class="page-header">
        <h1>Group Stage Picks</h1>
        <span class="user-badge">${user.display_name}</span>
      </div>
      ${countdownsHTML}
      ${lockBanner}
      <div class="view-toggle">
        <span class="vt-label">Order by</span>
        <div class="vt-group" id="view-toggle">
          <button class="vt-btn ${orderMode === 'group' ? 'active' : ''}" data-mode="group">Group</button>
          <button class="vt-btn ${orderMode === 'day' ? 'active' : ''}" data-mode="day">Day</button>
        </div>
      </div>
      ${canEdit ? `<button id="save-all-btn" class="btn-primary save-btn">Save All Picks</button>` : ''}
      <div id="picks-status" class="status-msg hidden"></div>
      <div id="groups-container">${renderGroups(existingPicks)}</div>
      ${canEdit ? `<button id="save-all-btn-bottom" class="btn-primary save-btn">Save All Picks</button>` : ''}
    </div>
  `;

  // ── Live countdowns (tournament start + next game) ─────────────────────────
  if (window.__pickCD) { clearInterval(window.__pickCD); window.__pickCD = null; }
  let lastNextId = null;
  function renderCountdowns() {
    const wrap = document.getElementById('countdown-wrap');
    if (!wrap) { clearInterval(window.__pickCD); window.__pickCD = null; return; } // navigated away
    const now = Date.now() - offset;

    const tEl = document.getElementById('cd-tournament-val');
    if (tEl && startMs !== null) {
      const left = startMs - now;
      if (left > 0) tEl.textContent = fmtCountdown(left);
      else { const c = document.getElementById('cd-tournament'); if (c) c.remove(); }
    }

    const nextCard = document.getElementById('cd-next');
    if (!nextCard) return;
    const upcoming = fixtures
      .filter(f => new Date(f.utc).getTime() > now)
      .sort((a, b) => new Date(a.utc).getTime() - new Date(b.utc).getTime());
    if (!upcoming.length) {
      if (lastNextId !== 'none') {
        nextCard.innerHTML = `<div class="cd-label">⚽ Next game</div><div class="cd-time cd-done">All group games have kicked off</div>`;
        lastNextId = 'none';
      }
      return;
    }
    const ng = upcoming[0];
    if (ng.id !== lastNextId) {   // only rebuild teams when the next game changes
      const teamsEl = document.getElementById('cd-next-teams');
      if (teamsEl) teamsEl.innerHTML = `${teamWithFlag(ng.home, 'left')} <span class="cd-vs">vs</span> ${teamWithFlag(ng.away, 'right')}`;
      lastNextId = ng.id;
    }
    const valEl = document.getElementById('cd-next-val');
    if (valEl) valEl.textContent = fmtCountdown(new Date(ng.utc).getTime() - now);
  }
  renderCountdowns();
  window.__pickCD = setInterval(renderCountdowns, 1000);

  // ── Order toggle (by group / by day) — works whether or not picks are open ─
  document.getElementById('view-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.vt-btn');
    if (!btn || btn.dataset.mode === orderMode) return;
    const values = snapshotValues();   // keep unsaved edits across the re-order
    orderMode = btn.dataset.mode;
    localStorage.setItem(ORDER_KEY, orderMode);
    document.querySelectorAll('#view-toggle .vt-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === orderMode));
    document.getElementById('groups-container').innerHTML = renderGroups(values);
  });

  if (!canEdit) return;

  function collectAndSave() {
    const picks = [];
    document.querySelectorAll('tr[data-id]').forEach(row => {
      const id = parseInt(row.dataset.id);
      const homeInput = row.querySelector('.score-home');
      const awayInput = row.querySelector('.score-away');
      if (!homeInput || !awayInput) return;
      const h = homeInput.value.trim();
      const a = awayInput.value.trim();
      if (h === '' || a === '') return;
      picks.push({ fixture_id: id, home_pred: parseInt(h), away_pred: parseInt(a) });
    });
    return picks;
  }

  async function savePicks(btn) {
    const picks = collectAndSave();
    const statusEl = document.getElementById('picks-status');
    if (picks.length === 0) {
      statusEl.textContent = 'No picks to save — fill in some scores first.';
      statusEl.className = 'status-msg error';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving…';
    statusEl.className = 'status-msg hidden';

    try {
      const res = await API.postAuth({ action: 'submitGroupPicks', picks });
      if (res.error) throw new Error(res.error);
      let msg = `✓ ${res.saved} pick${res.saved === 1 ? '' : 's'} saved!`;
      const rej = (res.rejected || []).length;
      if (rej) msg += ` ${rej} game${rej === 1 ? '' : 's'} had already started and ${rej === 1 ? 'was' : 'were'} not saved.`;
      statusEl.textContent = msg;
      statusEl.className = 'status-msg ' + (rej ? 'warning' : 'success');
      // Re-render so any games that locked since page load now show as closed.
      if (rej) setTimeout(() => Router.render('#/picks'), 1800);
    } catch (err) {
      statusEl.textContent = 'Error saving: ' + err.message;
      statusEl.className = 'status-msg error';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save All Picks';
    }
  }

  document.getElementById('save-all-btn').addEventListener('click', e => savePicks(e.target));
  document.getElementById('save-all-btn-bottom').addEventListener('click', e => savePicks(e.target));
});
