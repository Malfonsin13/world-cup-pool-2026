// ── Leaderboard ───────────────────────────────────────────────────────────────

Router.register('leaderboard', async function(container) {
  container.innerHTML = '<div class="loading">Loading standings…</div>';
  const data = await API.get('getLeaderboard');
  const lb = data.leaderboard || [];
  const currentUser = Auth.getUser();

  const poolTotal   = data.pool || 0;
  const prize1      = data.prize_1st || 0;
  const prize2      = data.prize_2nd || 0;
  const prizeGrp    = data.prize_group || 0;
  const playerCount = data.player_count != null ? data.player_count : lb.length;
  const buyIn       = CONFIG.BUY_IN;

  const phaseLabel = {
    pre: 'Pre-tournament',
    group: 'Group Stage',
    knockout: 'Knockout Round',
    done: 'Final'
  }[data.tournament_status || 'pre'];

  const prizeBoxes = poolTotal > 0 ? `
    <div class="prize-boxes">
      <div class="prize-box gold">
        <div class="prize-label">🥇 1st Place</div>
        <div class="prize-amount">$${prize1}</div>
        <div class="prize-pct">60%</div>
      </div>
      <div class="prize-box silver">
        <div class="prize-label">🥈 2nd Place</div>
        <div class="prize-amount">$${prize2}</div>
        <div class="prize-pct">25%</div>
      </div>
      <div class="prize-box bronze">
        <div class="prize-label">📊 Best Group Stage</div>
        <div class="prize-amount">$${prizeGrp}</div>
        <div class="prize-pct">15%</div>
      </div>
    </div>
    <p class="pool-summary">Projected pool: <strong>$${poolTotal}</strong> — ${playerCount} player${playerCount === 1 ? '' : 's'} in × $${buyIn}. Grows as more join!</p>
  ` : `<p class="pool-summary no-pool">Buy-in: $${buyIn}/person · Be the first to join!</p>`;

  // Find best group stage scorer separately
  let bestGroupUserId = null;
  if (lb.length > 0) {
    const sorted = [...lb].sort((a, b) => (b.group_pts || 0) - (a.group_pts || 0));
    bestGroupUserId = sorted[0].user_id;
  }

  const rows = lb.length === 0
    ? `<tr><td colspan="7" class="empty-state">No players yet — be the first to join!</td></tr>`
    : lb.map((row, i) => {
        const isMe = row.user_id === currentUser.id;
        const rank = row.rank || (i + 1);
        const hasPoints = (row.total || 0) > 0;
        // Everyone at 0 shows a neutral dash — no fake leader before points are earned.
        const medal = !hasPoints ? '–' : rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
        const isBestGroup = row.user_id === bestGroupUserId && lb.some(r => r.group_pts > 0);
        return `
          <tr class="${isMe ? 'my-row' : ''} ${isBestGroup ? 'best-group-row' : ''}">
            <td class="rank-cell">${medal}</td>
            <td class="name-cell">${row.display_name}${isMe ? ' <span class="you-badge">you</span>' : ''}${isBestGroup ? ' <span class="grp-badge">📊</span>' : ''}</td>
            <td class="pts-cell">${row.group_pts || 0}</td>
            <td class="pts-cell exact-col">${row.exact || 0}</td>
            <td class="pts-cell">${row.bracket_pts || 0}</td>
            <td class="pts-cell">${row.macro_pts || 0}</td>
            <td class="pts-cell total-col"><strong>${row.total || 0}</strong></td>
          </tr>`;
      }).join('');

  container.innerHTML = `
    <div class="page-leaderboard">
      <div class="page-header">
        <h1>Leaderboard</h1>
        <span class="phase-badge">${phaseLabel}</span>
      </div>
      ${prizeBoxes}
      <div class="table-wrapper">
        <table class="lb-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th title="Group Stage Points">Group</th>
              <th title="Exact scores (tiebreaker)">Exact</th>
              <th title="Bracket Points">Bracket</th>
              <th title="Macro Pick Points">Macro</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="lb-note">Scores update automatically every 15 minutes during matches.</p>
      <p class="lb-note">Ties broken by: most exact scores → best group-stage points → earliest to submit picks.</p>
    </div>
  `;
});
