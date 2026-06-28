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
  const NOTICE_TEXT = '⚠️ The bracket seeding was off — it’s now fixed. Your Round-of-32 picks are intact, but Round-of-16 and onward were reset — please re-pick them. Deadline is TODAY, Sunday June 28 at 3 PM ET, when the bracket locks. ⚽';
  // Bumped key so this corrected notice re-appears even for anyone who dismissed the previous one.
  const NOTICE_KEY = 'wcp_notice_reseed_20260628';
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
