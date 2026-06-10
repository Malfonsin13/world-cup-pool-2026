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

  let groupsHTML = '';
  window.GROUPS.forEach(g => {
    const games = byGroup[g] || [];
    let rows = '';
    games.forEach(f => {
      const pick = existingPicks[f.id] || {};
      const homeVal = pick.home !== undefined ? pick.home : '';
      const awayVal = pick.away !== undefined ? pick.away : '';
      const ptsClass = pick.pts == 5 ? 'pts-exact' : pick.pts == 2 ? 'pts-result' : pick.pts == 0 ? 'pts-wrong' : '';
      const ptsLabel = pick.pts == 5 ? '✓ 5' : pick.pts == 2 ? '~ 2' : pick.pts == 0 ? '✗ 0' : '';
      const kickoff = formatKickoff(f.utc);
      const rowLocked = gameLocked(f) || globalFreeze;

      rows += `
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
      ${canEdit ? `<button id="save-all-btn" class="btn-primary save-btn">Save All Picks</button>` : ''}
      <div id="picks-status" class="status-msg hidden"></div>
      <div id="groups-container">${groupsHTML}</div>
      ${canEdit ? `<button id="save-all-btn-bottom" class="btn-primary save-btn">Save All Picks</button>` : ''}
    </div>
  `;

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
