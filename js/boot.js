// ── Boot ──────────────────────────────────────────────────────────────────────
// Loaded last (after all other scripts have executed in order) so Auth and
// Router are guaranteed to be defined and the DOM is parsed.

Auth.init();
document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());
Router.init();

// ── Temporary site notice (rolling red banner) ────────────────────────────────
// Shows until NOTICE_UNTIL (24h window), unless the user dismisses it.
(function () {
  const NOTICE_UNTIL = new Date('2026-06-30T14:00:00Z').getTime(); // 24h from deploy
  const NOTICE_TEXT = '👋 Friendly reminder: if you haven’t paid your buy-in yet, head to the Rules tab for payment options (Cash App / Venmo / Zelle), or reach out to Ben or Marcelo. We need everyone in to pay out the full pot once the World Cup wraps up! 💰';
  // Bumped key so this notice re-appears even for anyone who dismissed the previous one.
  const NOTICE_KEY = 'wcp_notice_payment_20260629';
  const banner = document.getElementById('notice-banner');
  if (!banner) return;
  if (Date.now() >= NOTICE_UNTIL || localStorage.getItem(NOTICE_KEY) === String(NOTICE_UNTIL)) return;

  const track = document.getElementById('notice-track');
  // Duplicate the text so the marquee loops without a visible gap.
  track.textContent = NOTICE_TEXT + '     ' + NOTICE_TEXT + '     ';
  banner.style.display = 'block';
  document.getElementById('notice-dismiss').addEventListener('click', function () {
    banner.style.display = 'none';
    localStorage.setItem(NOTICE_KEY, String(NOTICE_UNTIL));
  });
})();
