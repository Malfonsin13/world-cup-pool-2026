// ── Boot ──────────────────────────────────────────────────────────────────────
// Loaded last (after all other scripts have executed in order) so Auth and
// Router are guaranteed to be defined and the DOM is parsed.

Auth.init();
document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());
Router.init();

// ── Site notice (rolling red banner) ──────────────────────────────────────────
// Server-driven: shows the `final_ribbon` from Config once the tournament is finalized
// (congratulates winners, pool size, payouts). Dismissible per-device. The dismiss key is
// derived from the message text, so a NEW announcement re-appears even for someone who
// dismissed a previous one.
(async function () {
  const banner = document.getElementById('notice-banner');
  if (!banner) return;
  let ribbon = '';
  try { ribbon = (await API.get('getConfig')).final_ribbon || ''; } catch (e) { /* non-fatal */ }
  if (!ribbon) return;

  const key = 'wcp_notice_' + ribbon.length + '_' + ribbon.slice(0, 24);
  if (localStorage.getItem(key) === '1') return;

  const track = document.getElementById('notice-track');
  // Duplicate the text so the marquee loops without a visible gap.
  track.textContent = ribbon + '          ' + ribbon + '          ';
  banner.style.display = 'block';
  document.getElementById('notice-dismiss').addEventListener('click', function () {
    banner.style.display = 'none';
    localStorage.setItem(key, '1');
  });
})();
