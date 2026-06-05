// ── Macro Picks ───────────────────────────────────────────────────────────────

Router.register('macro', async function(container) {
  const [picksData, configData] = await Promise.all([
    API.getAuth('getUserPicks'),
    API.get('getConfig')
  ]);

  const existing = picksData.macro_picks || {};
  const locked = configData.picks_locked || configData.tournament_status !== 'pre';
  const teams = window.ALL_TEAMS;

  function teamOption(name, selected) {
    return `<option value="${name}" ${selected === name ? 'selected' : ''}>${name}</option>`;
  }

  const allOptions = `<option value="">-- Pick a team --</option>` + teams.map(t => teamOption(t, '')).join('');

  const lockBanner = locked
    ? `<div class="banner banner-warning">⏰ Macro picks are locked for this tournament.</div>`
    : `<div class="banner banner-info">Pick once. Locked when the tournament starts. Champion=20 pts, Runner-up=15 pts, Top Scorer=10 pts.</div>`;

  function scoreDisplay(pts, label) {
    if (pts === undefined || pts === '') return '';
    return pts > 0
      ? `<span class="pts-exact">✓ ${pts} pts</span>`
      : `<span class="pts-wrong">✗ 0 pts</span>`;
  }

  const champPts = existing.champion_pts;
  const ruPts    = existing.runner_up_pts;
  const tsPts    = existing.top_scorer_pts;

  function buildSelect(id, label, value, pts) {
    const opts = `<option value="">-- Pick a team --</option>` + teams.map(t => teamOption(t, value)).join('');
    return `
      <div class="macro-row">
        <label for="${id}">${label}</label>
        ${locked
          ? `<span class="macro-locked-val">${value || '—'}</span>`
          : `<select id="${id}">${opts}</select>`
        }
        ${scoreDisplay(pts, label)}
      </div>`;
  }

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
          <span>🏆 Champion = 20 pts</span>
          <span>🥈 Runner-up = 15 pts</span>
          <span>👟 Top Scorer = 10 pts</span>
        </div>
        <form id="macro-form">
          ${buildSelect('macro-champion', '🏆 Champion', existing.champion, champPts)}
          ${buildSelect('macro-runner-up', '🥈 Runner-up', existing.runner_up, ruPts)}
          ${buildSelect('macro-top-scorer', '👟 Top Scorer (Golden Boot)', existing.top_scorer, tsPts)}
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
    const champion   = document.getElementById('macro-champion').value;
    const runner_up  = document.getElementById('macro-runner-up').value;
    const top_scorer = document.getElementById('macro-top-scorer').value;

    if (!champion || !runner_up || !top_scorer) {
      statusEl.textContent = 'Please fill in all three picks.';
      statusEl.className = 'status-msg error';
      return;
    }
    if (champion === runner_up) {
      statusEl.textContent = 'Champion and Runner-up must be different teams.';
      statusEl.className = 'status-msg error';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving…';
    statusEl.className = 'status-msg hidden';
    try {
      const res = await API.postAuth({ action: 'submitMacroPicks', picks: { champion, runner_up, top_scorer } });
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
