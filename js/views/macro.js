// ── Macro Picks ───────────────────────────────────────────────────────────────
// Runner-up + 3rd place = team dropdowns. Golden Ball/Boot/Glove = free-text player names.

Router.register('macro', async function(container) {
  const [picksData, configData] = await Promise.all([
    API.getAuth('getUserPicks'),
    API.get('getConfig')
  ]);

  const existing = picksData.macro_picks || {};
  // Macro picks lock for everyone at the first game's kickoff (server-clock driven).
  const offset  = configData.server_time ? (Date.now() - new Date(configData.server_time).getTime()) : 0;
  const startMs = configData.tournament_start ? new Date(configData.tournament_start).getTime() : null;
  const locked  = configData.picks_locked || (startMs !== null && (Date.now() - offset) >= startMs);
  const teams    = window.ALL_TEAMS;
  const PTS       = CONFIG.SCORING.macro;

  function teamSelect(id, value) {
    const opts = `<option value="">-- Pick a team --</option>` +
      teams.map(t => `<option value="${t}" ${value === t ? 'selected' : ''}>${teamFlag(t)} ${t}</option>`).join('');
    return `<select id="${id}">${opts}</select>`;
  }

  function scoreBadge(pts) {
    if (pts === undefined || pts === '' || pts === null) return '';
    return Number(pts) > 0
      ? `<span class="pts-exact">✓ ${pts} pts</span>`
      : `<span class="pts-wrong">✗ 0 pts</span>`;
  }

  // Build one row. type: 'team' | 'player'
  function row(id, icon, label, ptsValue, value, type, points) {
    let control;
    if (locked) {
      const shown = type === 'team' ? (value ? teamWithFlag(value) : '—') : (value || '—');
      control = `<span class="macro-locked-val">${shown}</span>`;
    } else if (type === 'team') {
      control = teamSelect(id, value);
    } else {
      control = `<input type="text" id="${id}" value="${value ? String(value).replace(/"/g,'&quot;') : ''}" placeholder="Player name" autocomplete="off">`;
    }
    return `
      <div class="macro-row">
        <label for="${id}">${icon} ${label} <span class="macro-pts">${points} pts</span></label>
        ${control}
        ${scoreBadge(ptsValue)}
      </div>`;
  }

  const lockBanner = locked
    ? `<div class="banner banner-warning">⏰ Macro picks are locked — the tournament has started.</div>`
    : `<div class="banner banner-info">Pick once — locks when the tournament starts (first kickoff). Champion isn't here because it's already rewarded in the bracket.</div>`;

  const user = Auth.getUser();
  container.innerHTML = `
    <div class="page-macro">
      <div class="page-header">
        <h1>Macro Picks</h1>
        <span class="user-badge">${user.display_name}</span>
      </div>
      ${lockBanner}
      <div class="macro-card">
        <div class="scoring-legend">
          <span>🥈 Runner-up = ${PTS.runner_up}</span>
          <span>🥉 3rd Place = ${PTS.third_place}</span>
          <span>⚽ Golden Ball = ${PTS.golden_ball}</span>
          <span>👟 Golden Boot = ${PTS.golden_boot}</span>
          <span>🧤 Golden Glove = ${PTS.golden_glove}</span>
        </div>
        <form id="macro-form">
          ${row('m-runner-up',   '🥈', 'Runner-up',    existing.runner_up_pts,    existing.runner_up,    'team',   PTS.runner_up)}
          ${row('m-third',       '🥉', 'Third Place',  existing.third_place_pts,  existing.third_place,  'team',   PTS.third_place)}
          ${row('m-ball',        '⚽', 'Golden Ball (Best Player)',  existing.golden_ball_pts,  existing.golden_ball,  'player', PTS.golden_ball)}
          ${row('m-boot',        '👟', 'Golden Boot (Top Scorer)',   existing.golden_boot_pts,  existing.golden_boot,  'player', PTS.golden_boot)}
          ${row('m-glove',       '🧤', 'Golden Glove (Best Keeper)', existing.golden_glove_pts, existing.golden_glove, 'player', PTS.golden_glove)}
          ${!locked ? `
            <button type="submit" class="btn-primary">Save Macro Picks</button>
            <p id="macro-status" class="status-msg hidden"></p>
          ` : ''}
        </form>
      </div>
    </div>
  `;

  if (locked) return;

  document.getElementById('macro-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const statusEl = document.getElementById('macro-status');

    const picks = {
      runner_up:    document.getElementById('m-runner-up').value,
      third_place:  document.getElementById('m-third').value,
      golden_ball:  document.getElementById('m-ball').value.trim(),
      golden_boot:  document.getElementById('m-boot').value.trim(),
      golden_glove: document.getElementById('m-glove').value.trim()
    };

    if (Object.values(picks).some(v => !v)) {
      statusEl.textContent = 'Please fill in all five picks.';
      statusEl.className = 'status-msg error';
      return;
    }
    if (picks.runner_up === picks.third_place) {
      statusEl.textContent = 'Runner-up and 3rd place must be different teams.';
      statusEl.className = 'status-msg error';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving…';
    statusEl.className = 'status-msg hidden';
    try {
      const res = await API.postAuth({ action: 'submitMacroPicks', picks });
      if (res.error) throw new Error(res.error);
      statusEl.textContent = '✓ Macro picks saved!';
      statusEl.className = 'status-msg success';
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.className = 'status-msg error';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Macro Picks';
    }
  });
});
