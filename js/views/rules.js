// ── Rules & Payouts ───────────────────────────────────────────────────────────

Router.register('rules', async function(container) {
  container.innerHTML = '<div class="loading">Loading…</div>';

  // Fetch live pool data (non-fatal — show percentages if unavailable)
  let poolTotal = 0, prize1 = 0, prize2 = 0, prizeGrp = 0, playerCount = 0, paidCount = 0, complete = false;
  try {
    const data = await API.get('getLeaderboard');
    poolTotal   = data.pool    || 0;
    prize1      = data.prize_1st  || 0;
    prize2      = data.prize_2nd  || 0;
    prizeGrp    = data.prize_group || 0;
    playerCount = data.player_count != null ? data.player_count : (data.paid_count || 0);
    paidCount   = data.paid_count != null ? data.paid_count : playerCount;
    complete    = data.tournament_status === 'complete';
  } catch (e) { /* non-fatal */ }

  const buyIn = CONFIG.BUY_IN;

  // Cash App buy-in link. The /amount segment pre-fills the dollar amount.
  const cashtag  = CONFIG.CASHAPP_CASHTAG || '';
  const cashLink = cashtag ? `https://cash.app/$${cashtag}/${buyIn}` : '';
  const venmo    = CONFIG.VENMO_USER || '';
  const venmoLink = venmo ? `https://venmo.com/?txn=pay&recipients=${venmo}&amount=${buyIn}&note=WorldCupPool2026` : '';
  const zelle    = CONFIG.ZELLE_HANDLE || '';

  const cashCard = cashtag ? `
        <div class="pay-card">
          <div class="pay-info">
            <p class="pay-lead">Cash App — send <strong>$${buyIn}</strong> to <span class="cashtag">$${cashtag}</span>.</p>
            <a class="btn-cashapp" href="${cashLink}" target="_blank" rel="noopener noreferrer">
              Pay $${buyIn} on Cash App →
            </a>
            <p class="pay-note">Tapping the button (or scanning the code) opens Cash App with the $${buyIn} amount pre-filled.</p>
          </div>
          <div class="pay-qr">
            <img src="assets/cashapp-qr.png?v=${window.APP_VERSION || ''}" alt="Cash App QR code for $${cashtag}" width="160" height="160" loading="lazy">
            <span class="pay-qr-label">Scan to pay</span>
          </div>
        </div>` : '';

  const venmoCard = venmo ? `
        <div class="pay-card pay-card-venmo">
          <div class="pay-info">
            <p class="pay-lead">Venmo — send <strong>$${buyIn}</strong> to <span class="venmo-handle">@${venmo}</span>.</p>
            <a class="btn-venmo" href="${venmoLink}" target="_blank" rel="noopener noreferrer">
              Pay $${buyIn} on Venmo →
            </a>
            <p class="pay-note">Tapping the button (or scanning the code) opens Venmo with the $${buyIn} amount pre-filled.</p>
          </div>
          <div class="pay-qr">
            <img src="assets/venmo-qr.png?v=${window.APP_VERSION || ''}" alt="Venmo QR code for @${venmo}" width="160" height="160" loading="lazy">
            <span class="pay-qr-label">Scan to pay</span>
          </div>
        </div>` : '';

  const zelleCard = zelle ? `
        <div class="pay-card pay-card-zelle">
          <div class="pay-info">
            <p class="pay-lead">Zelle — send <strong>$${buyIn}</strong> to <span class="zelle-handle">${zelle}</span>.</p>
            <p class="pay-note">Open your bank app → Zelle → send $${buyIn} to the address above. Zelle has no pay link, so enter it manually.</p>
          </div>
        </div>` : '';

  const paySection = (cashtag || venmo || zelle) ? `
      <section class="rules-section">
        <h2 class="rules-section-title">💵 Pay Your $${buyIn} Buy-In</h2>
        <div class="pay-cards">${cashCard}${venmoCard}${zelleCard}</div>
        <p class="pay-note" style="margin-top:.6rem;">After you send it, the admin marks you as paid — your ✓ shows up on the Leaderboard.</p>
      </section>` : '';

  const prizeSection = poolTotal > 0 ? `
    <div class="prize-boxes">
      <div class="prize-box gold">
        <div class="prize-label">🥇 1st Place</div>
        <div class="prize-amount">$${prize1}</div>
        <div class="prize-pct">60% of pool</div>
      </div>
      <div class="prize-box silver">
        <div class="prize-label">🥈 2nd Place</div>
        <div class="prize-amount">$${prize2}</div>
        <div class="prize-pct">25% of pool</div>
      </div>
      <div class="prize-box bronze">
        <div class="prize-label">📊 Best Group Stage</div>
        <div class="prize-amount">$${prizeGrp}</div>
        <div class="prize-pct">15% of pool</div>
      </div>
    </div>
    <p class="pool-summary">${complete
      ? `Final pool: <strong>$${poolTotal}</strong> — ${paidCount} of ${playerCount} players paid × $${buyIn}. 🏆 Tournament complete!`
      : `Projected pool: <strong>$${poolTotal}</strong> — ${playerCount} player${playerCount !== 1 ? 's' : ''} in × $${buyIn}. Grows as more join!`}</p>
  ` : `
    <div class="prize-boxes">
      <div class="prize-box gold">
        <div class="prize-label">🥇 1st Place</div>
        <div class="prize-amount">60%</div>
        <div class="prize-pct">of total pool</div>
      </div>
      <div class="prize-box silver">
        <div class="prize-label">🥈 2nd Place</div>
        <div class="prize-amount">25%</div>
        <div class="prize-pct">of total pool</div>
      </div>
      <div class="prize-box bronze">
        <div class="prize-label">📊 Best Group Stage</div>
        <div class="prize-amount">15%</div>
        <div class="prize-pct">of total pool</div>
      </div>
    </div>
    <p class="pool-summary">$${buyIn}/person buy-in · Prize amounts update as players confirm payment</p>
  `;

  container.innerHTML = `
    <div class="page-rules">
      <div class="page-header">
        <h1>Rules &amp; Payouts</h1>
      </div>

      <!-- Prize Pool -->
      <section class="rules-section">
        <h2 class="rules-section-title">💰 Prize Pool</h2>
        ${prizeSection}
      </section>

      <!-- Pay buy-in (Cash App) -->
      ${paySection}

      <!-- Scoring breakdown -->
      <section class="rules-section">
        <h2 class="rules-section-title">📋 How Scoring Works</h2>
        <div class="rules-cards">

          <div class="rules-card">
            <div class="rules-card-header hdr-green">
              <span class="rules-card-icon">⚽</span>
              <div>
                <div class="rules-card-title">Group Stage</div>
                <div class="rules-card-sub">72 games · predict every scoreline</div>
              </div>
            </div>
            <table class="pts-table">
              <tr>
                <td>Exact score <em>(e.g. 2-1 and you picked 2-1)</em></td>
                <td class="pts-val pts-green">5 pts</td>
              </tr>
              <tr>
                <td>Correct result <em>(win/draw/loss right, score off)</em></td>
                <td class="pts-val pts-gold">2 pts</td>
              </tr>
              <tr>
                <td>Wrong result</td>
                <td class="pts-val pts-muted">0 pts</td>
              </tr>
            </table>
            <p class="rules-note">Picks lock when the first group game kicks off (June 12).</p>
          </div>

          <div class="rules-card">
            <div class="rules-card-header hdr-blue">
              <span class="rules-card-icon">🏆</span>
              <div>
                <div class="rules-card-title">Knockout Bracket</div>
                <div class="rules-card-sub">Pick the winner of every matchup</div>
              </div>
            </div>
            <table class="pts-table">
              <tr><td>Round of 32</td>   <td class="pts-val pts-green">3 pts</td></tr>
              <tr><td>Round of 16</td>   <td class="pts-val pts-green">5 pts</td></tr>
              <tr><td>Quarterfinals</td> <td class="pts-val pts-green">8 pts</td></tr>
              <tr><td>Semifinals</td>    <td class="pts-val pts-green">12 pts</td></tr>
              <tr><td>Final</td>         <td class="pts-val pts-green">18 pts</td></tr>
              <tr class="pts-highlight-row">
                <td>🏆 Champion bonus</td>
                <td class="pts-val pts-green">+25 pts</td>
              </tr>
            </table>
            <p class="rules-note">Fill the full bracket before the knockout phase starts.</p>
          </div>

          <div class="rules-card">
            <div class="rules-card-header hdr-purple">
              <span class="rules-card-icon">🌟</span>
              <div>
                <div class="rules-card-title">Macro Picks</div>
                <div class="rules-card-sub">5 pre-tournament predictions</div>
              </div>
            </div>
            <table class="pts-table">
              <tr><td>🥈 Runner-up <em>(team)</em></td>            <td class="pts-val pts-green">15 pts</td></tr>
              <tr><td>🥉 Third Place <em>(team)</em></td>          <td class="pts-val pts-green">10 pts</td></tr>
              <tr><td>⚽ Golden Ball <em>(best player)</em></td>   <td class="pts-val pts-green">10 pts</td></tr>
              <tr><td>👟 Golden Boot <em>(top scorer)</em></td>    <td class="pts-val pts-green">10 pts</td></tr>
              <tr><td>🧤 Golden Glove <em>(best keeper)</em></td>  <td class="pts-val pts-green">10 pts</td></tr>
              <tr class="pts-highlight-row">
                <td>Max total</td>
                <td class="pts-val pts-green">55 pts</td>
              </tr>
            </table>
            <p class="rules-note">Champion isn't here — it's already in the bracket with a 25-pt bonus.</p>
          </div>

        </div>
      </section>

      <!-- When Picks Lock -->
      <section class="rules-section">
        <h2 class="rules-section-title">⏰ When Picks Lock</h2>
        <div class="rules-howto">
          <div class="howto-item">
            <span class="howto-icon">⚽</span>
            <div>
              <strong>Group games</strong> — each game's pick locks at <strong>kickoff</strong>. You can add or change a pick any time until that game starts. Games already played are locked and grayed out.
            </div>
          </div>
          <div class="howto-item">
            <span class="howto-icon">🏆</span>
            <div>
              <strong>Bracket</strong> — fill out your <strong>whole bracket</strong> in the window after the group stage ends. It locks all at once when the knockout stage begins (first bracket game) and can't be changed after that.
            </div>
          </div>
          <div class="howto-item">
            <span class="howto-icon">🌟</span>
            <div>
              <strong>Macro picks</strong> — lock for everyone at the <strong>first game's kickoff</strong> (tournament start). Joining late? You can still pick any group game that hasn't started yet — you just miss the points from games already played.
            </div>
          </div>
          <div class="howto-item">
            <span class="howto-icon">🕐</span>
            <div>All kickoff times on the site are shown in your local U.S. time zone (ET / CT / MT / PT).</div>
          </div>
        </div>
      </section>

      <!-- How to Win -->
      <section class="rules-section">
        <h2 class="rules-section-title">🎯 How to Win</h2>
        <div class="rules-howto">
          <div class="howto-item">
            <span class="howto-num">1</span>
            <div>
              <strong>Overall 1st &amp; 2nd</strong> — highest combined score across all three sections wins 60% and 25% of the pool.
            </div>
          </div>
          <div class="howto-item">
            <span class="howto-num">2</span>
            <div>
              <strong>Best Group Stage</strong> — the player with the most group stage points wins 15%, even if they're not on top overall. Group grinders get rewarded.
            </div>
          </div>
          <div class="howto-item">
            <span class="howto-num">3</span>
            <div>
              <strong>Tip</strong> — group stage has 72 games, so it carries a ton of weight. A lucky champion pick (25 pts) doesn't automatically beat someone who got 40+ group stage points right.
            </div>
          </div>
        </div>
      </section>

      <!-- Tiebreakers -->
      <section class="rules-section">
        <h2 class="rules-section-title">🤝 Tiebreakers</h2>
        <div class="rules-howto">
          <div class="howto-item">
            <span class="howto-num">1</span>
            <div><strong>Most exact scores</strong> — whoever nailed more games on the dot (5-pointers).</div>
          </div>
          <div class="howto-item">
            <span class="howto-num">2</span>
            <div><strong>Best group-stage points</strong> — the higher group-stage total breaks it next.</div>
          </div>
          <div class="howto-item">
            <span class="howto-num">3</span>
            <div><strong>Earliest to submit picks</strong> — if still tied, whoever locked in their predictions first ranks higher.</div>
          </div>
        </div>
        <p class="rules-note">Applied in order whenever two players have the same total points. The "Exact" column on the Leaderboard shows everyone's exact-score count.</p>
      </section>

    </div>
  `;
});
