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

  const locked = configData.picks_locked || configData.tournament_status !== 'pre';
  const fixtures = window.FIXTURES;

  // Group by group letter
  const byGroup = {};
  fixtures.forEach(f => {
    if (!byGroup[f.group]) byGroup[f.group] = [];
    byGroup[f.group].push(f);
  });

  const lockBanner = locked
    ? `<div class="banner banner-warning">⏰ Predictions are locked — the tournament has started.</div>`
    : `<div class="banner banner-info">Submit your score predictions for all 72 group stage games before June 11. 5 pts for exact score, 2 pts for correct result.</div>`;

  let groupsHTML = '';
  window.GROUPS.forEach(g => {
    const games = byGroup[g] || [];
    let rows = '';
    games.forEach(f => {
      const pick = existingPicks[f.id] || {};
      const homeVal = pick.home !== undefined ? pick.home : '';
      const awayVal = pick.away !== undefined ? pick.away : '';
      const hasResult = pick.pts !== undefined && pick.pts !== '';
      const ptsClass = pick.pts == 5 ? 'pts-exact' : pick.pts == 2 ? 'pts-result' : pick.pts == 0 ? 'pts-wrong' : '';
      const ptsLabel = pick.pts == 5 ? '✓ 5' : pick.pts == 2 ? '~ 2' : pick.pts == 0 ? '✗ 0' : '';
      const kickoff = new Date(f.utc).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', timeZoneName:'short' });

      rows += `
        <tr data-id="${f.id}">
          <td class="fixture-date">${kickoff}</td>
          <td class="team-home">${f.home}</td>
          <td class="score-input">
            ${locked
              ? `<span class="score-static">${homeVal !== '' ? homeVal : '—'}</span>`
              : `<input type="number" class="score-home" min="0" max="20" value="${homeVal}" placeholder="-">`
            }
            <span class="score-sep">:</span>
            ${locked
              ? `<span class="score-static">${awayVal !== '' ? awayVal : '—'}</span>`
              : `<input type="number" class="score-away" min="0" max="20" value="${awayVal}" placeholder="-">`
            }
          </td>
          <td class="team-away">${f.away}</td>
          <td class="pts-cell ${ptsClass}">${ptsLabel}</td>
        </tr>`;
    });

    groupsHTML += `
      <section class="group-section">
        <h2 class="group-title">Group ${g}</h2>
        <table class="fixtures-table">
          <tbody>${rows}</tbody>
        </table>
      </section>`;
  });

  const user = Auth.getUser();
  container.innerHTML = `
    <div class="page-picks">
      <div class="page-header">
        <h1>Group Stage Picks</h1>
        <span class="user-badge">${user.display_name}</span>
      </div>
      ${lockBanner}
      ${!locked ? `<button id="save-all-btn" class="btn-primary save-btn">Save All Picks</button>` : ''}
      <div id="picks-status" class="status-msg hidden"></div>
      <div id="groups-container">${groupsHTML}</div>
      ${!locked ? `<button id="save-all-btn-bottom" class="btn-primary save-btn">Save All Picks</button>` : ''}
    </div>
  `;

  if (locked) return;

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
      statusEl.textContent = `✓ ${res.saved} picks saved!`;
      statusEl.className = 'status-msg success';
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
