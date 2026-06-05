// ── Knockout Bracket ─────────────────────────────────────────────────────────
// Round-by-round: each round opens when admin switches phase.
// Users pick winners from actual qualified teams.

Router.register('bracket', async function(container) {
  const [picksData, fixturesData, configData] = await Promise.all([
    API.getAuth('getUserPicks'),
    API.get('getFixtures'),
    API.get('getConfig')
  ]);

  const phase = configData.tournament_status || 'pre';
  const bracketPicks = picksData.bracket_picks || [];

  // Build a lookup: round+matchIndex → team_picked
  const myPicks = {};
  bracketPicks.forEach(p => {
    myPicks[`${p.round}_${p.match_index}`] = { team: p.team_picked, pts: p.pts_awarded, correct: p.is_correct };
  });

  const knockoutFixtures = (fixturesData.fixtures || []).filter(f => f.phase === 'knockout');

  // Group knockout fixtures by round
  const byRound = {};
  knockoutFixtures.forEach(f => {
    if (!byRound[f.round]) byRound[f.round] = [];
    byRound[f.round].push(f);
  });

  const ROUNDS = CONFIG.ROUNDS;
  const roundLabels = { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarterfinals', SF: 'Semifinals', Final: 'Final' };
  const BRACKET_PTS = CONFIG.SCORING.bracket;

  function renderRound(roundName) {
    const games = byRound[roundName] || [];
    const roundPts = BRACKET_PTS[roundName] || 0;
    const bonusTxt = roundName === 'Final' ? ` + ${CONFIG.SCORING.champion_bonus} bonus for champion` : '';

    if (games.length === 0) {
      return `
        <div class="bracket-round bracket-locked">
          <h2>${roundLabels[roundName]} <span class="pts-badge">${roundPts} pts${bonusTxt}</span></h2>
          <p class="bracket-pending">Matchups will be revealed once the previous round concludes.</p>
        </div>`;
    }

    let gameCards = '';
    games.forEach((f, i) => {
      const key = `${roundName}_${f.match_index || (i + 1)}`;
      const myPick = myPicks[key];
      const isComplete = f.status === 'final';
      const winner = isComplete ? (f.home_score > f.away_score ? f.home : f.home_score < f.away_score ? f.away : null) : null;

      let pickUI = '';
      if (isComplete) {
        const scored = myPick && winner;
        const correct = scored && myPick.team === winner;
        const scoreStr = `${f.home_score}–${f.away_score}`;
        pickUI = `
          <div class="pick-result ${correct ? 'pick-correct' : myPick ? 'pick-wrong' : 'pick-none'}">
            <span class="result-score">${scoreStr}</span>
            <span class="result-winner">Winner: ${winner ? teamWithFlag(winner) : 'TBD (ET/PKs)'}</span>
            ${myPick ? `<span class="result-pick">Your pick: ${teamWithFlag(myPick.team)} ${correct ? '✓' : '✗'} ${myPick.pts || 0} pts</span>` : '<span class="result-pick">No pick submitted</span>'}
          </div>`;
      } else if (f.home && f.away) {
        const picked = myPick ? myPick.team : '';
        pickUI = `
          <div class="pick-input" data-round="${roundName}" data-idx="${f.match_index || (i + 1)}">
            <button class="team-btn ${picked === f.home ? 'selected' : ''}" data-team="${f.home}">${teamWithFlag(f.home)}</button>
            <span class="vs-sep">vs</span>
            <button class="team-btn ${picked === f.away ? 'selected' : ''}" data-team="${f.away}">${teamWithFlag(f.away)}</button>
            ${picked ? `<span class="saved-pick">✓ Picked: ${teamWithFlag(picked)}</span>` : ''}
          </div>`;
      } else {
        pickUI = `<div class="pick-tbd">Teams TBD</div>`;
      }

      gameCards += `
        <div class="bracket-card">
          <div class="bracket-teams">
            <span class="b-home">${f.home ? teamWithFlag(f.home) : '?'}</span>
            <span class="b-vs">vs</span>
            <span class="b-away">${f.away ? teamWithFlag(f.away) : '?'}</span>
          </div>
          ${pickUI}
        </div>`;
    });

    return `
      <div class="bracket-round">
        <h2>${roundLabels[roundName]} <span class="pts-badge">${roundPts} pts${bonusTxt}</span></h2>
        <div class="bracket-cards">${gameCards}</div>
      </div>`;
  }

  const roundsHTML = phase === 'pre' || phase === 'group'
    ? `<div class="banner banner-info">Bracket picks open after the group stage ends (June 27). Come back then to fill out each round as teams advance.</div>`
    : ROUNDS.map(r => renderRound(r)).join('');

  const user = Auth.getUser();
  container.innerHTML = `
    <div class="page-bracket">
      <div class="page-header">
        <h1>Knockout Bracket</h1>
        <span class="user-badge">${user.display_name}</span>
      </div>
      <div class="bracket-scoring-note">Pick before each round locks. ${Object.entries(BRACKET_PTS).map(([r,p]) => `${r}=${p}pts`).join(' · ')} + ${CONFIG.SCORING.champion_bonus} champion bonus</div>
      <div id="bracket-status" class="status-msg hidden"></div>
      <div id="rounds-container">${roundsHTML}</div>
    </div>
  `;

  if (phase === 'pre' || phase === 'group') return;

  // Bind team button clicks
  container.querySelectorAll('.pick-input').forEach(el => {
    el.querySelectorAll('.team-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const round = el.dataset.round;
        const idx   = el.dataset.idx;
        const team  = btn.dataset.team;
        const statusEl = document.getElementById('bracket-status');

        // Visual feedback
        el.querySelectorAll('.team-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        try {
          const res = await API.postAuth({
            action: 'submitBracketPick',
            round,
            match_index: parseInt(idx),
            team_picked: team
          });
          if (res.error) throw new Error(res.error);
          const savedEl = el.querySelector('.saved-pick');
          if (savedEl) savedEl.textContent = `✓ Picked: ${team}`;
          else el.insertAdjacentHTML('beforeend', `<span class="saved-pick">✓ Picked: ${team}</span>`);
          statusEl.className = 'status-msg hidden';
        } catch (err) {
          statusEl.textContent = 'Error saving pick: ' + err.message;
          statusEl.className = 'status-msg error';
        }
      });
    });
  });
});
