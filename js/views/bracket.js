// ── Knockout Bracket — predict-to-champion (March Madness tree) ───────────────
// Once the 16 Round-of-32 matchups are loaded (auto from ESPN), players pick the
// winner of every matchup; their picks PROPAGATE up the tree (your R32 winners
// become the R16 matchup, etc.) all the way to the champion. Locks at the first
// knockout kickoff. Scored by team advancement (server-side).

Router.register('bracket', async function (container) {
  const [picksData, fixturesData, configData] = await Promise.all([
    API.getAuth('getUserPicks'),
    API.get('getFixtures'),
    API.get('getConfig')
  ]);

  const offset = window.__clockOffset || 0;
  const lockMs = configData.bracket_lock ? new Date(configData.bracket_lock).getTime() : null;
  const bracketLocked = lockMs !== null && (Date.now() - offset) >= lockMs;
  const winners = configData.knockout_winners || {};   // { R32: { team: true }, ... }

  // R32 matchups from our knockout fixtures (auto-loaded once the group stage ends)
  const r32 = {}; // match_index -> { home, away }
  (fixturesData.fixtures || [])
    .filter(f => f.phase === 'knockout' && f.round === 'R32')
    .forEach(f => { r32[f.match_index] = { home: f.home, away: f.away }; });
  const r32Ready = Object.keys(r32).length === 16 &&
    [...Array(16)].every((_, i) => r32[i + 1] && r32[i + 1].home && r32[i + 1].away);
  const DEMO = !r32Ready;

  // The player's picks: 'round_idx' -> team
  const picks = {};
  (picksData.bracket_picks || []).forEach(p => { if (p.team_picked) picks[`${p.round}_${p.match_index}`] = p.team_picked; });

  const PREV = { R16: 'R32', QF: 'R16', SF: 'QF', Final: 'SF' };
  const SLOTS = { R32: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], R16: [1,2,3,4,5,6,7,8], QF: [1,2,3,4], SF: [1,2], Final: [1] };
  const PTS = CONFIG.SCORING.bracket;

  // The two candidate teams for a slot: R32 = the fixture's teams; later rounds = the
  // player's winners of the two feeding slots in the previous round.
  function candidates(round, idx) {
    if (round === 'R32') { const m = r32[idx] || {}; return [m.home || null, m.away || null]; }
    const prev = PREV[round];
    return [picks[`${prev}_${2 * idx - 1}`] || null, picks[`${prev}_${2 * idx}`] || null];
  }

  // Drop any downstream pick that is no longer a valid candidate (upstream winner changed).
  function prune() {
    const cleared = [];
    ['R16', 'QF', 'SF', 'Final'].forEach(round => {
      SLOTS[round].forEach(idx => {
        const key = `${round}_${idx}`;
        if (picks[key] && !candidates(round, idx).includes(picks[key])) { delete picks[key]; cleared.push({ round, idx }); }
      });
    });
    return cleared;
  }
  prune(); // tidy any stale loaded state for display

  function filledCount() {
    let n = 0;
    Object.keys(SLOTS).forEach(r => SLOTS[r].forEach(i => { if (picks[`${r}_${i}`]) n++; }));
    return n;
  }

  // ── Render one matchup card ───────────────────────────────────────────────
  function renderCard(round, idx) {
    const key = `${round}_${idx}`;
    const cands = candidates(round, idx);
    const myPick = picks[key];
    const roundWinners = winners[round] || null;
    const bothKnown = cands[0] && cands[1];

    function slot(team) {
      if (!team) return `<div class="bs bs-tbd">TBD</div>`;
      const picked = myPick === team;
      const won = roundWinners && roundWinners[team];
      const disabled = DEMO || bracketLocked || !bothKnown;
      const pts = (PTS[round] || 0) + (round === 'Final' ? CONFIG.SCORING.champion_bonus : 0);
      return `
        <button class="bs ${picked ? 'bs-pick' : ''} ${won ? 'bs-win' : ''} ${bracketLocked ? 'bs-lock' : ''}"
                data-team="${team}" data-round="${round}" data-idx="${idx}" ${disabled ? 'disabled' : ''}>
          ${teamFlag(team)}<span class="bs-name">${team}</span>${won ? `<span class="bs-pts">${pts}pts</span>` : ''}
        </button>`;
    }
    return `<div class="b-card" data-round="${round}" data-idx="${idx}">${slot(cands[0])}${slot(cands[1])}</div>`;
  }

  function buildRoundCol(round, slots, side) {
    const pts = PTS[round] || 0;
    const bonus = round === 'Final' ? ` +${CONFIG.SCORING.champion_bonus}` : '';
    const pairs = [];
    for (let i = 0; i < slots.length; i += 2) pairs.push(slots.slice(i, i + 2));
    const pairsHTML = pairs.map(pair =>
      `<div class="b-pair">${pair.map(idx => renderCard(round, idx)).join('')}</div>`).join('');
    return `
      <div class="b-col b-col-${side}" data-round="${round}">
        <div class="b-col-label">${round} <span class="b-col-pts">${pts}pts${bonus}</span></div>
        <div class="b-col-pairs">${pairsHTML}</div>
      </div>`;
  }

  function buildFinalCol() {
    return `
      <div class="b-col b-col-final">
        <div class="b-col-label">Final <span class="b-col-pts">${PTS.Final}pts +${CONFIG.SCORING.champion_bonus}</span></div>
        <div class="b-col-pairs"><div class="b-pair">${renderCard('Final', 1)}</div></div>
      </div>`;
  }

  function treeHTML() {
    return `
      <div class="btree" id="btree">
        <div class="btree-half btree-left">
          ${buildRoundCol('R32', [1,2,3,4,5,6,7,8], 'left')}
          ${buildRoundCol('R16', [1,2,3,4], 'left')}
          ${buildRoundCol('QF',  [1,2], 'left')}
          ${buildRoundCol('SF',  [1], 'left')}
        </div>
        ${buildFinalCol()}
        <div class="btree-half btree-right">
          ${buildRoundCol('SF',  [2], 'right')}
          ${buildRoundCol('QF',  [3,4], 'right')}
          ${buildRoundCol('R16', [5,6,7,8], 'right')}
          ${buildRoundCol('R32', [9,10,11,12,13,14,15,16], 'right')}
        </div>
      </div>`;
  }

  const banner = DEMO
    ? `<div class="banner banner-info">🏆 The bracket opens automatically once the group stage ends (Sun Jun 28) and the 32 teams are set. Come back then to fill out your <strong>whole bracket to the champion</strong> — it locks at the first knockout game, <strong>3 PM ET Jun 28</strong>.</div>`
    : bracketLocked
      ? `<div class="banner banner-warning">🔒 Bracket locked — the knockout stage has begun. Your picks are final.</div>`
      : `<div class="banner banner-info">Pick the winner of every matchup — your picks carry forward up the tree to the champion. Fill it all in before the first knockout game (<strong>3 PM ET Jun 28</strong>), when it locks.</div>`;

  const user = Auth.getUser();
  function progressHTML() {
    if (DEMO) return '';
    const champ = picks['Final_1'];
    return `<p class="btree-demo-note">${filledCount()}/31 picks made${champ ? ` · 🏆 Your champion: <strong>${champ}</strong>` : ''}</p>`;
  }

  container.innerHTML = `
    <div class="page-bracket">
      <div class="page-header">
        <h1>Knockout Bracket</h1>
        <span class="user-badge">${user.display_name}</span>
      </div>
      ${banner}
      <div id="bracket-status" class="status-msg hidden"></div>
      <div class="btree-scroll-wrap" id="btree-wrap">${treeHTML()}</div>
      <div id="btree-progress">${progressHTML()}</div>
    </div>`;

  if (DEMO || bracketLocked) return;

  // ── Reactive picking ──────────────────────────────────────────────────────
  function rerender() {
    document.getElementById('btree-wrap').innerHTML = treeHTML();
    document.getElementById('btree-progress').innerHTML = progressHTML();
    bind();
  }

  function bind() {
    document.querySelectorAll('#btree-wrap .bs:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async () => {
        const round = btn.dataset.round, idx = parseInt(btn.dataset.idx), team = btn.dataset.team;
        if (picks[`${round}_${idx}`] === team) return;
        picks[`${round}_${idx}`] = team;
        const cleared = prune();   // drop now-invalid downstream picks
        rerender();                // reflect propagation immediately
        const statusEl = document.getElementById('bracket-status');
        try {
          let res = await API.postAuth({ action: 'submitBracketPick', round, match_index: idx, team_picked: team });
          if (res.error) throw new Error(res.error);
          for (const c of cleared) {
            await API.postAuth({ action: 'submitBracketPick', round: c.round, match_index: c.idx, team_picked: '' });
          }
          API.invalidate('getUserPicks');
          statusEl.className = 'status-msg hidden';
        } catch (err) {
          statusEl.textContent = 'Error saving pick: ' + err.message;
          statusEl.className = 'status-msg error';
        }
      });
    });
  }
  bind();
});
