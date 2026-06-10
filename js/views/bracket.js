// ── Knockout Bracket — March Madness tree layout ──────────────────────────────

Router.register('bracket', async function(container) {
  const [picksData, fixturesData, configData] = await Promise.all([
    API.getAuth('getUserPicks'),
    API.get('getFixtures'),
    API.get('getConfig')
  ]);

  const phase       = configData.tournament_status || 'pre';
  const bracketPicks = picksData.bracket_picks || [];
  const myPicks = {};
  bracketPicks.forEach(p => { myPicks[`${p.round}_${p.match_index}`] = p; });

  const DEMO_MODE = phase === 'pre' || phase === 'group';

  // The whole bracket freezes at the first knockout kickoff (server-clock driven).
  const offset = configData.server_time ? (Date.now() - new Date(configData.server_time).getTime()) : 0;
  const lockMs = configData.bracket_lock ? new Date(configData.bracket_lock).getTime() : null;
  const bracketLocked = lockMs !== null && (Date.now() - offset) >= lockMs;

  // Real knockout fixtures indexed by round + match_index
  const kFixtures = (fixturesData.fixtures || []).filter(f => f.phase === 'knockout');
  const byRound = {};
  kFixtures.forEach(f => {
    if (!byRound[f.round]) byRound[f.round] = {};
    byRound[f.round][f.match_index] = f;
  });

  // Demo teams — plausible-looking fictional bracket for preview
  const DEMO_R32 = [
    // Left side (slots 1-8)
    ['Argentina','Mexico'], ['France','Morocco'],
    ['Brazil','USA'],       ['England','Senegal'],
    ['Germany','Japan'],    ['Spain','Colombia'],
    ['Portugal','Norway'],  ['Netherlands','Ecuador'],
    // Right side (slots 9-16)
    ['Belgium','South Korea'],  ['Uruguay','Switzerland'],
    ['Ivory Coast','Sweden'],   ['Croatia','Tunisia'],
    ['Austria','Ghana'],        ['Saudi Arabia','Canada'],
    ['Algeria','New Zealand'],  ['DR Congo','Panama'],
  ];

  // ── Render one matchup card ────────────────────────────────────────────────
  function renderCard(round, matchIndex, home, away, isDemoLocked) {
    const pick    = myPicks[`${round}_${matchIndex}`];
    const fixture = byRound[round] && byRound[round][matchIndex];
    const done    = fixture && fixture.status === 'final';
    const winner  = done
      ? (fixture.home_score > fixture.away_score ? fixture.home
       : fixture.home_score < fixture.away_score ? fixture.away : null)
      : null;

    function slot(team) {
      if (!team || team === '?') {
        return `<div class="bs bs-tbd">TBD</div>`;
      }
      const won      = winner === team;
      const myPicked = pick && pick.team_picked === team;
      const locked   = done || isDemoLocked || bracketLocked;
      return `
        <button class="bs ${won ? 'bs-win' : ''} ${myPicked ? 'bs-pick' : ''} ${locked ? 'bs-lock' : ''}"
                data-team="${team}" data-round="${round}" data-idx="${matchIndex}"
                ${locked || !home || !away ? 'disabled' : ''}>
          ${teamFlag(team)}<span class="bs-name">${team}</span>${won ? `<span class="bs-pts">${CONFIG.SCORING.bracket[round] || 0}pts</span>` : ''}
        </button>`;
    }

    return `<div class="b-card" data-round="${round}" data-idx="${matchIndex}">${slot(home)}${slot(away)}</div>`;
  }

  // ── Build one round column ─────────────────────────────────────────────────
  // side: 'left' | 'right'
  // slots: which match_index values live in this column on this side
  function buildRoundCol(round, slots, side) {
    const pts = CONFIG.SCORING.bracket[round] || 0;
    const bonus = round === 'Final' ? ` +${CONFIG.SCORING.champion_bonus} bonus` : '';

    // Group slots into pairs (each pair feeds one matchup in the next round)
    const pairs = [];
    for (let i = 0; i < slots.length; i += 2) {
      pairs.push(slots.slice(i, i + 2));
    }

    const pairsHTML = pairs.map(pair => {
      const cardsHTML = pair.map(idx => {
        if (DEMO_MODE) {
          const d = DEMO_R32[idx - 1] || ['?', '?'];
          // Only R32 shows demo teams; later rounds show TBD
          const [h, a] = round === 'R32' ? d : ['?', '?'];
          return renderCard(round, idx, h, a, true);
        }
        const f = byRound[round] && byRound[round][idx];
        return renderCard(round, idx, f ? f.home : null, f ? f.away : null, false);
      }).join('');
      return `<div class="b-pair">${cardsHTML}</div>`;
    }).join('');

    return `
      <div class="b-col b-col-${side}" data-round="${round}">
        <div class="b-col-label">${round} <span class="b-col-pts">${pts}pts${bonus}</span></div>
        <div class="b-col-pairs">${pairsHTML}</div>
      </div>`;
  }

  // ── Final (center column) ─────────────────────────────────────────────────
  function buildFinalCol() {
    const f = byRound['Final'] && byRound['Final'][1];
    const [h, a] = DEMO_MODE ? ['?', '?'] : [f ? f.home : null, f ? f.away : null];
    return `
      <div class="b-col b-col-final">
        <div class="b-col-label">Final <span class="b-col-pts">${CONFIG.SCORING.bracket.Final}pts +${CONFIG.SCORING.champion_bonus}</span></div>
        <div class="b-col-pairs">
          <div class="b-pair">
            ${renderCard('Final', 1, h, a, DEMO_MODE)}
          </div>
        </div>
      </div>`;
  }

  // ── Assemble the full tree ────────────────────────────────────────────────
  // Left side:  R32 slots 1-8, R16 slots 1-4, QF slots 1-2, SF slot 1
  // Right side: R32 slots 9-16, R16 slots 5-8, QF slots 3-4, SF slot 2

  const bracketTree = `
    <div class="btree" id="btree">
      <div class="btree-half btree-left">
        ${buildRoundCol('R32', [1,2,3,4,5,6,7,8], 'left')}
        ${buildRoundCol('R16', [1,2,3,4],          'left')}
        ${buildRoundCol('QF',  [1,2],               'left')}
        ${buildRoundCol('SF',  [1],                 'left')}
      </div>
      ${buildFinalCol()}
      <div class="btree-half btree-right">
        ${buildRoundCol('SF',  [2],                  'right')}
        ${buildRoundCol('QF',  [3,4],                'right')}
        ${buildRoundCol('R16', [5,6,7,8],            'right')}
        ${buildRoundCol('R32', [9,10,11,12,13,14,15,16], 'right')}
      </div>
    </div>`;

  const statusBanner = DEMO_MODE
    ? `<div class="banner banner-info">
        The bracket opens once the group stage ends and the Round of 32 is set. Below is a preview with example teams. You'll fill out your <strong>whole bracket</strong> in one go — it locks when the knockout stage begins.
       </div>`
    : bracketLocked
      ? `<div class="banner banner-warning">🔒 Bracket locked — the knockout stage has begun. Your picks are final.</div>`
      : `<div class="banner banner-info">Fill out your <strong>entire bracket</strong> now — pick a winner for every matchup. It locks the moment the first knockout game kicks off, so get them all in before then.</div>`;

  const user = Auth.getUser();
  container.innerHTML = `
    <div class="page-bracket">
      <div class="page-header">
        <h1>Knockout Bracket</h1>
        <span class="user-badge">${user.display_name}</span>
      </div>
      ${statusBanner}
      <div id="bracket-status" class="status-msg hidden"></div>
      <div class="btree-scroll-wrap">${bracketTree}</div>
      ${DEMO_MODE ? '<p class="btree-demo-note">Demo layout — teams TBD after group stage</p>' : ''}
    </div>`;

  if (DEMO_MODE || bracketLocked) return;

  // ── Live pick binding ─────────────────────────────────────────────────────
  container.querySelectorAll('.bs:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card     = btn.closest('.b-card');
      const round    = card.dataset.round;
      const idx      = card.dataset.idx;
      const team     = btn.dataset.team;
      const statusEl = document.getElementById('bracket-status');

      // Optimistic UI
      card.querySelectorAll('.bs').forEach(b => b.classList.remove('bs-pick'));
      btn.classList.add('bs-pick');

      try {
        const res = await API.postAuth({
          action: 'submitBracketPick',
          round,
          match_index: parseInt(idx),
          team_picked: team
        });
        if (res.error) throw new Error(res.error);
        statusEl.className = 'status-msg hidden';
      } catch (err) {
        btn.classList.remove('bs-pick');
        statusEl.textContent = 'Error saving pick: ' + err.message;
        statusEl.className = 'status-msg error';
      }
    });
  });
});
