// ── Boot ──────────────────────────────────────────────────────────────────────
// Loaded last (after all other scripts have executed in order) so Auth and
// Router are guaranteed to be defined and the DOM is parsed.

Auth.init();
document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());
Router.init();

// ── Temporary site notice (rolling red banner) ────────────────────────────────
// Shows until NOTICE_UNTIL (24h window), unless the user dismisses it.
(function () {
  const NOTICE_UNTIL = 1781895030171; // 2026-06-19T18:50Z
  const NOTICE_TEXT = '📢 Leaderboard corrected: a few games had duplicate entries that double-counted points. We’ve fixed it — the standings shown now are accurate. Thanks for your patience! ⚽';
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
