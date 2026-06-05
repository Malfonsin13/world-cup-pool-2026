// ── Configuration ─────────────────────────────────────────────────────────────
// Replace APPS_SCRIPT_URL after deploying your Apps Script Web App.

window.CONFIG = {
  APPS_SCRIPT_URL: 'YOUR_APPS_SCRIPT_URL_HERE',

  SCORING: {
    group: { exact: 5, result: 2, wrong: 0 },
    bracket: { R32: 3, R16: 5, QF: 8, SF: 12, Final: 18 },
    champion_bonus: 25,
    macro: { champion: 20, runner_up: 15, top_scorer: 10 }
  },

  PRIZE_SPLIT: { first: 0.60, second: 0.25, group: 0.15 },
  BUY_IN: 20,

  PHASES: ['pre', 'group', 'knockout', 'done'],
  ROUNDS: ['R32', 'R16', 'QF', 'SF', 'Final']
};
