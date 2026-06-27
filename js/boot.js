// ── Boot ──────────────────────────────────────────────────────────────────────
// Loaded last (after all other scripts have executed in order) so Auth and
// Router are guaranteed to be defined and the DOM is parsed.

Auth.init();
document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());
Router.init();

// ── Temporary site notice (rolling red banner) ────────────────────────────────
// Shows until NOTICE_UNTIL (24h window), unless the user dismisses it.
(function () {
  const NOTICE_UNTIL = new Date('2026-06-28T19:00:00Z').getTime(); // first knockout kickoff (3 PM ET)
  const NOTICE_TEXT = '🏆 Knockout bracket opens Sun Jun 28 once the group stage ends — the 32 teams load automatically. Fill out your FULL bracket to the champion before the first game at 3 PM ET, when it locks. Don’t miss it! ⚽';
  const banner = document.getElementById('notice-banner');
  if (!banner) return;
  if (Date.now() >= NOTICE_UNTIL || localStorage.getItem('wcp_notice_dismissed') === String(NOTICE_UNTIL)) return;

  const track = document.getElementById('notice-track');
  // Duplicate the text so the marquee loops without a visible gap.
  track.textContent = NOTICE_TEXT + '     ' + NOTICE_TEXT + '     ';
  banner.style.display = 'block';
  document.getElementById('notice-dismiss').addEventListener('click', function () {
    banner.style.display = 'none';
    localStorage.setItem('wcp_notice_dismissed', String(NOTICE_UNTIL));
  });
})();
