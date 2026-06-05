// ──────────────────────────────────────────────────────────────────────────────
// Scoring & Auto-Fetch — runs on a 15-minute time-driven trigger
// ──────────────────────────────────────────────────────────────────────────────

var BRACKET_PTS = { R32: 3, R16: 5, QF: 8, SF: 12, Final: 18 };
var CHAMPION_BONUS = 25;
var MACRO_PTS = { champion: 20, runner_up: 15, top_scorer: 10 };

// ── Auto-fetch results from worldcup26.ir ─────────────────────────────────────

function autoFetchResults() {
  try {
    var response = UrlFetchApp.fetch('https://worldcup26.ir/get/games', {
      muteHttpExceptions: true,
      headers: { 'Accept': 'application/json' }
    });
    if (response.getResponseCode() !== 200) {
      Logger.log('Auto-fetch failed: HTTP ' + response.getResponseCode());
      return;
    }
    var games = JSON.parse(response.getContentText());
    if (!Array.isArray(games)) {
      Logger.log('Auto-fetch: unexpected response format');
      return;
    }

    var updated = false;
    games.forEach(function(game) {
      // Accept either 'finished' or 'completed' or 'FT' depending on API
      var finished = game.status === 'finished' || game.status === 'completed' ||
                     game.status === 'FT' || game.finished === true;
      if (!finished) return;

      var fixtureRow = findFixtureByApiId(game.id || game.match_id);
      if (!fixtureRow) return;
      if (fixtureRow.status === 'final') return; // already scored

      var homeScore = parseInt(game.home_score || game.goals_home || game.score_home, 10);
      var awayScore = parseInt(game.away_score || game.goals_away || game.score_away, 10);
      if (isNaN(homeScore) || isNaN(awayScore)) return;

      updateFixtureResult(fixtureRow.id, homeScore, awayScore);
      updated = true;
    });

    if (updated) rebuildLeaderboard();
  } catch (err) {
    Logger.log('autoFetchResults error: ' + err.message);
  }
}

function findFixtureByApiId(apiId) {
  if (!apiId) return null;
  var fixtures = sheetToObjects('Fixtures');
  return fixtures.find(function(f) { return String(f.api_id) === String(apiId); }) || null;
}

// ── Result Update ─────────────────────────────────────────────────────────────

function updateFixtureResult(fixtureId, homeScore, awayScore) {
  var s = sheet('Fixtures');
  var row = findRow('Fixtures', 'id', fixtureId);
  if (row < 0) return { error: 'Fixture not found' };

  var headers = s.getDataRange().getValues()[0];
  s.getRange(row, headers.indexOf('home_score') + 1).setValue(homeScore);
  s.getRange(row, headers.indexOf('away_score') + 1).setValue(awayScore);
  s.getRange(row, headers.indexOf('status') + 1).setValue('final');

  recalculateGroupScores(fixtureId, homeScore, awayScore);
  rebuildLeaderboard();
  return { success: true };
}

// ── Group Stage Scoring ───────────────────────────────────────────────────────

function scoreGroupGame(homePred, awayPred, homeResult, awayResult) {
  if (homePred === homeResult && awayPred === awayResult) return 5;
  var predSign = Math.sign(homePred - awayPred);
  var resSign  = Math.sign(homeResult - awayResult);
  return predSign === resSign ? 2 : 0;
}

function recalculateGroupScores(fixtureId, homeScore, awayScore) {
  var s = sheet('GroupPredictions');
  var data = s.getDataRange().getValues();
  if (data.length < 2) return;
  var headers = data[0];
  var fixCol  = headers.indexOf('fixture_id');
  var homeCol = headers.indexOf('home_pred');
  var awayCol = headers.indexOf('away_pred');
  var ptsCol  = headers.indexOf('pts_awarded');

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][fixCol]) !== String(fixtureId)) continue;
    var hp = parseInt(data[i][homeCol], 10);
    var ap = parseInt(data[i][awayCol], 10);
    if (isNaN(hp) || isNaN(ap)) continue;
    var pts = scoreGroupGame(hp, ap, homeScore, awayScore);
    s.getRange(i + 1, ptsCol + 1).setValue(pts);
  }
}

// ── Bracket Scoring ───────────────────────────────────────────────────────────

function scoreBracketPick(teamPicked, actualWinner, round) {
  if (!teamPicked || !actualWinner) return 0;
  var pts = BRACKET_PTS[round] || 0;
  var isChampion = round === 'Final' && teamPicked === actualWinner;
  return teamPicked === actualWinner ? pts + (isChampion ? CHAMPION_BONUS : 0) : 0;
}

// Call this after entering a knockout result (winner = team that won)
function recalculateBracketScores(round, matchIndex, winner) {
  var s = sheet('BracketPredictions');
  var data = s.getDataRange().getValues();
  if (data.length < 2) return;
  var headers = data[0];
  var roundCol = headers.indexOf('round');
  var idxCol   = headers.indexOf('match_index');
  var pickCol  = headers.indexOf('team_picked');
  var corCol   = headers.indexOf('is_correct');
  var ptsCol   = headers.indexOf('pts_awarded');

  for (var i = 1; i < data.length; i++) {
    if (data[i][roundCol] !== round || String(data[i][idxCol]) !== String(matchIndex)) continue;
    var picked = data[i][pickCol];
    var correct = picked === winner;
    var pts = correct ? ((BRACKET_PTS[round] || 0) + (round === 'Final' ? CHAMPION_BONUS : 0)) : 0;
    s.getRange(i + 1, corCol + 1).setValue(correct);
    s.getRange(i + 1, ptsCol + 1).setValue(pts);
  }
}

// ── Macro Scoring ─────────────────────────────────────────────────────────────

function scoreMacroPicks(champion, runnerUp, topScorer) {
  var macros = sheetToObjects('MacroPicks');
  var s = sheet('MacroPicks');
  var headers = s.getDataRange().getValues()[0];
  var champPtsCol = headers.indexOf('champion_pts') + 1;
  var ruPtsCol    = headers.indexOf('runner_up_pts') + 1;
  var tsPtsCol    = headers.indexOf('top_scorer_pts') + 1;

  macros.forEach(function(row, i) {
    var sheetRow = i + 2; // +1 header +1 1-indexed
    if (champion)  s.getRange(sheetRow, champPtsCol).setValue(row.champion  === champion  ? MACRO_PTS.champion  : 0);
    if (runnerUp)  s.getRange(sheetRow, ruPtsCol).setValue(row.runner_up   === runnerUp   ? MACRO_PTS.runner_up  : 0);
    if (topScorer) s.getRange(sheetRow, tsPtsCol).setValue(row.top_scorer  === topScorer  ? MACRO_PTS.top_scorer : 0);
  });
}

// ── Leaderboard Rebuild ───────────────────────────────────────────────────────

function rebuildLeaderboard() {
  var users      = sheetToObjects('Users');
  var groupPicks = sheetToObjects('GroupPredictions');
  var bracketPks = sheetToObjects('BracketPredictions');
  var macroPicks = sheetToObjects('MacroPicks');

  var scores = users.map(function(u) {
    var gpts = groupPicks
      .filter(function(r) { return r.user_id === u.id && r.pts_awarded !== ''; })
      .reduce(function(sum, r) { return sum + (Number(r.pts_awarded) || 0); }, 0);

    var bpts = bracketPks
      .filter(function(r) { return r.user_id === u.id; })
      .reduce(function(sum, r) { return sum + (Number(r.pts_awarded) || 0); }, 0);

    var mrow  = macroPicks.find(function(r) { return r.user_id === u.id; });
    var mpts  = mrow ? (Number(mrow.champion_pts) || 0) + (Number(mrow.runner_up_pts) || 0) + (Number(mrow.top_scorer_pts) || 0) : 0;

    return {
      user_id:      u.id,
      display_name: u.display_name,
      group_pts:    gpts,
      bracket_pts:  bpts,
      macro_pts:    mpts,
      total:        gpts + bpts + mpts
    };
  });

  scores.sort(function(a, b) { return b.total - a.total; });
  scores.forEach(function(s, i) { s.rank = i + 1; });

  var lbSheet = sheet('Leaderboard');
  lbSheet.clearContents();
  lbSheet.appendRow(['user_id', 'display_name', 'group_pts', 'bracket_pts', 'macro_pts', 'total', 'rank']);
  scores.forEach(function(s) {
    lbSheet.appendRow([s.user_id, s.display_name, s.group_pts, s.bracket_pts, s.macro_pts, s.total, s.rank]);
  });
}

// ── Time Trigger Setup ────────────────────────────────────────────────────────
// Run this function ONCE manually in the Apps Script editor to set up the trigger.

function setupTrigger() {
  // Remove existing autoFetch triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'autoFetchResults') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('autoFetchResults')
    .timeBased()
    .everyMinutes(15)
    .create();
  Logger.log('15-minute trigger created for autoFetchResults');
}
