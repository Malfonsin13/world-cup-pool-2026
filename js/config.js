// ── Configuration ─────────────────────────────────────────────────────────────
// Replace APPS_SCRIPT_URL after deploying your Apps Script Web App.

window.CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxve1C3mK2NkAMqPADz0s8jicKZO0f3EpAGsgg1RShBDg1zDEYcp2Q_TBWBsBE3RlXZhA/exec',

  SCORING: {
    group: { exact: 5, result: 2, wrong: 0 },
    bracket: { R32: 3, R16: 5, QF: 8, SF: 12, Final: 18 },
    champion_bonus: 25,
    macro: { runner_up: 15, third_place: 10, golden_ball: 10, golden_boot: 10, golden_glove: 10 }
  },

  PRIZE_SPLIT: { first: 0.60, second: 0.25, group: 0.15 },
  BUY_IN: 20,

  // Cash App buy-in. CASHTAG without the leading $. The /20 in the link pre-fills the amount.
  CASHAPP_CASHTAG: 'MarceloAlfonsin',

  PHASES: ['pre', 'group', 'knockout', 'done'],
  ROUNDS: ['R32', 'R16', 'QF', 'SF', 'Final']
};
