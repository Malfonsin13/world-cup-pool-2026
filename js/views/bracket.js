// ── Knockout Bracket — predict-to-champion (real FIFA tree) ───────────────────
// R32 matchups auto-load from ESPN as they're decided (partial is fine — undecided
// matchups stay TBD/grayed). Players pick the winner of each set matchup; picks
// propagate up the real bracket tree to the champion. Locks at the first knockout
// kickoff. Scored by team advancement (server-side).

Router.register('bracket', async function (container) {
  const [picksData, fixturesData, configData] = await Promise.all([
    API.getAuth('getUserPicks'),
    API.get('getFixtures'),
    API.get('getConfig')
  ]);

  const offset = window.__clockOffset || 0;
  const lockMs = configData.bracket_lock ? new Date(configData.bracket_lock).getTime() : null;
  const bracketLocked = lockMs !== null && (Date.now() - offset) >= lockMs;
  const winners = configData.knockout_winners || {};
  const koDates = configData.knockout_dates || {};   // { R32:{slot:iso}, R16:{...}, ... }

  // Compact kickoff for a bracket card (e.g. "Jul 4, 1:00 PM EDT"), '' if no date.
  function kickoffShort(utc) {
    if (!utc) return '';
    const d = new Date(utc);
    if (isNaN(d)) return '';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  }

  // R32 matchups from our knockout fixtures (auto-loaded from ESPN, possibly partial)
  const r32 = {}; // match_index -> { home, away }
  (fixturesData.fixtures || [])
    .filter(f => f.phase === 'knockout' && f.round === 'R32')
    .forEach(f => { if (f.home && f.away) r32[f.match_index] = { home: f.home, away: f.away }; });
  const DEMO = Object.keys(r32).length === 0;   // open as soon as ANY R32 matchup is set

  // The player's picks: 'round_idx' -> team
  const picks = {};
  (picksData.bracket_picks || []).forEach(p => { if (p.team_picked) picks[`${p.round}_${p.match_index}`] = p.team_picked; });

  // Real FIFA bracket topology (from ESPN). Each later-round slot is fed by two specific
  // prior-round slots.
  const FEEDS = {
    R16: { 1:[['R32',1],['R32',3]], 2:[['R32',2],['R32',5]], 3:[['R32',4],['R32',6]], 4:[['R32',7],['R32',8]],
           5:[['R32',11],['R32',12]], 6:[['R32',9],['R32',10]], 7:[['R32',14],['R32',16]], 8:[['R32',13],['R32',15]] },
    QF:  { 1:[['R16',1],['R16',2]], 2:[['R16',5],['R16',6]], 3:[['R16',3],['R16',4]], 4:[['R16',7],['R16',8]] },
    SF:  { 1:[['QF',1],['QF',2]], 2:[['QF',3],['QF',4]] },
    Final: { 1:[['SF',1],['SF',2]] }
  };
  // Visual column order so the tree's consecutive-pair connectors line up with the real feeds.
  const VIS = {
    left:  { R32:[1,3,2,5,11,12,9,10], R16:[1,2,5,6], QF:[1,2], SF:[1] },
    right: { R32:[4,6,7,8,14,16,13,15], R16:[3,4,7,8], QF:[3,4], SF:[2] }
  };
  const SLOTS = { R16:[1,2,3,4,5,6,7,8], QF:[1,2,3,4], SF:[1,2], Final:[1] };
  const PTS = CONFIG.SCORING.bracket;

  function candidates(round, idx) {
    if (round === 'R32') { const m = r32[idx] || {}; return [m.home || null, m.away || null]; }
    const f = FEEDS[round][idx];
    return [picks[`${f[0][0]}_${f[0][1]}`] || null, picks[`${f[1][0]}_${f[1][1]}`] || null];
  }

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
  prune();

  function filledCount() {
    let n = Object.keys(r32).reduce((a, i) => a + (picks[`R32_${i}`] ? 1 : 0), 0);
    ['R16', 'QF', 'SF', 'Final'].forEach(r => SLOTS[r].forEach(i => { if (picks[`${r}_${i}`]) n++; }));
    return n;
  }

  function renderCard(round, idx) {
    const key = `${round}_${idx}`;
    const cands = candidates(round, idx);
    const myPick = picks[key];
    const roundWinners = winners[round] || null;
    const bothKnown = cands[0] && cands[1];

    // A card's matchup is "decided" once either shown team has won this round.
    const decided = cands.some(t => roundWinners && roundWinners[t]);

    function slot(team) {
      if (!team) return `<div class="bs bs-tbd">TBD</div>`;
      const picked  = myPick === team;
      const won     = !!(roundWinners && roundWinners[team]); // this team actually won its round
      const correct = picked && won;        // the ONLY case that earns you points
      const miss    = picked && !won && decided; // your pick lost this matchup
      const disabled = DEMO || bracketLocked || !bothKnown;
      const pts = (PTS[round] || 0) + (round === 'Final' ? CONFIG.SCORING.champion_bonus : 0);

      const cls = ['bs'];
      if (correct) cls.push('bs-correct');    // your correct pick (green, earns pts)
      else if (won) cls.push('bs-win');       // a winner you didn't pick (gold, no pts)
      else if (picked) cls.push('bs-pick');   // your pick, still undecided
      if (miss) cls.push('bs-miss');          // your pick that lost (dimmed)
      if (bracketLocked) cls.push('bs-lock');

      // Points badge appears ONLY on your correct picks. A winner you didn't pick just gets a
      // muted "winner" tag so results stay visible without implying you scored.
      const tag = correct ? `<span class="bs-pts">✓ ${pts} pts</span>`
                : (won ? `<span class="bs-won-tag">winner</span>` : '');
      return `
        <button class="${cls.join(' ')}"
                data-team="${team}" data-round="${round}" data-idx="${idx}" ${disabled ? 'disabled' : ''}>
          ${teamFlag(team)}<span class="bs-name">${team}</span>${tag}
        </button>`;
    }
    const when = kickoffShort(koDates[round] && koDates[round][idx]);
    const dateHTML = when ? `<div class="b-card-date">${when}</div>` : '';
    return `<div class="b-card" data-round="${round}" data-idx="${idx}">${dateHTML}${slot(cands[0])}${slot(cands[1])}</div>`;
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
          ${buildRoundCol('R32', VIS.left.R32, 'left')}
          ${buildRoundCol('R16', VIS.left.R16, 'left')}
          ${buildRoundCol('QF',  VIS.left.QF, 'left')}
          ${buildRoundCol('SF',  VIS.left.SF, 'left')}
        </div>
        ${buildFinalCol()}
        <div class="btree-half btree-right">
          ${buildRoundCol('SF',  VIS.right.SF, 'right')}
          ${buildRoundCol('QF',  VIS.right.QF, 'right')}
          ${buildRoundCol('R16', VIS.right.R16, 'right')}
          ${buildRoundCol('R32', VIS.right.R32, 'right')}
        </div>
      </div>`;
  }

  const banner = DEMO
    ? `<div class="banner banner-info">🏆 The bracket opens as the Round-of-32 matchups are decided. Come back as groups finish to pick winners; it all locks at the first knockout game, <strong>Sunday, June 28 at 3 PM ET</strong>.</div>`
    : bracketLocked
      ? `<div class="banner banner-warning">🔒 Bracket locked — the knockout stage has begun. Your picks are final.</div>`
      : `<div class="banner banner-info">Pick the winner of each matchup that's set — your picks carry up to the champion. Matchups still being decided stay <strong>TBD</strong>. <strong>Each pick saves automatically</strong> (no Save button). Complete your bracket before <strong>Sunday, June 28 at 3 PM ET</strong>, when it locks.</div>`;

  const user = Auth.getUser();
  function progressHTML() {
    if (DEMO) return '';
    const champ = picks['Final_1'];
    return `<p class="btree-demo-note">${filledCount()} picks made${champ ? ` · 🏆 Your champion: <strong>${champ}</strong>` : ''}</p>`;
  }

  container.innerHTML = `
    <div class="page-bracket">
      <div class="page-header">
        <h1>Knockout Bracket</h1>
        <span class="user-badge">${user.display_name}</span>
      </div>
      ${banner}
      <div class="btree-scroll-wrap" id="btree-wrap">${treeHTML()}</div>
      <div id="btree-progress">${progressHTML()}</div>
      <div id="bracket-toast" class="bracket-toast" style="display:none;"></div>
    </div>`;

  if (DEMO || bracketLocked) return;

  let toastTimer = null;
  function toast(msg, kind) {
    const el = document.getElementById('bracket-toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'bracket-toast toast-' + kind;
    el.style.display = 'block';
    clearTimeout(toastTimer);
    if (kind === 'saved') toastTimer = setTimeout(() => { el.style.display = 'none'; }, 1600);
  }

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
        const cleared = prune();
        rerender();
        toast('Saving…', 'saving');
        try {
          let res = await API.postAuth({ action: 'submitBracketPick', round, match_index: idx, team_picked: team });
          if (res.error) throw new Error(res.error);
          for (const c of cleared) {
            await API.postAuth({ action: 'submitBracketPick', round: c.round, match_index: c.idx, team_picked: '' });
          }
          API.invalidate('getUserPicks');
          toast('✓ Saved', 'saved');
        } catch (err) {
          toast('⚠️ Not saved — tap the pick again', 'error');
        }
      });
    });
  }
  bind();
});
