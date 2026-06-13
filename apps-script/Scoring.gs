// ──────────────────────────────────────────────────────────────────────────────
// Scoring & Auto-Fetch — runs on a 15-minute time-driven trigger
// ──────────────────────────────────────────────────────────────────────────────

var BRACKET_PTS = { R32: 3, R16: 5, QF: 8, SF: 12, Final: 18 };
var CHAMPION_BONUS = 25;
var MACRO_PTS = { runner_up: 15, third_place: 10, golden_ball: 10, golden_boot: 10, golden_glove: 10 };

// Normalize team names so our fixtures match the results-feed names.
// Maps a lowercased, trimmed name to our canonical fixture name.
var TEAM_NAME_ALIASES = {
  'united states': 'USA', 'usa': 'USA', 'us': 'USA',
  'korea republic': 'South Korea', 'south korea': 'South Korea', 'republic of korea': 'South Korea',
  'turkey': 'Türkiye', 'turkiye': 'Türkiye', 'türkiye': 'Türkiye',
  'ivory coast': 'Ivory Coast', "cote d'ivoire": 'Ivory Coast', "côte d'ivoire": 'Ivory Coast',
  'dr congo': 'DR Congo', 'congo dr': 'DR Congo', 'democratic republic of the congo': 'DR Congo',
  'czech republic': 'Czechia', 'czechia': 'Czechia',
  'bosnia and herzegovina': 'Bosnia-Herzegovina', 'bosnia-herzegovina': 'Bosnia-Herzegovina', 'bosnia': 'Bosnia-Herzegovina',
  'cape verde': 'Cape Verde', 'cabo verde': 'Cape Verde',
  'curacao': 'Curacao', 'curaçao': 'Curacao'
};

function canonTeam(name) {
  if (!name) return '';
  var key = String(name).trim().toLowerCase();
  return TEAM_NAME_ALIASES[key] || String(name).trim();
}

// ── Auto-fetch results from ESPN ──────────────────────────────────────────────
// ESPN's public scoreboard for the FIFA World Cup. No API key needed. One call with
// a full-tournament date range returns every match; we only act on games ESPN marks
// completed (status.type.completed === true / state === 'post'). Matched to our
// fixtures by team name, with a kickoff-time guard as a second safety net.

var ESPN_WC_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719';

function autoFetchResults() {
  try {
    var response = UrlFetchApp.fetch(ESPN_WC_URL, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
      Logger.log('Auto-fetch failed: HTTP ' + response.getResponseCode());
      return;
    }
    var data = JSON.parse(response.getContentText());
    var events = data && data.events;
    if (!Array.isArray(events)) {
      Logger.log('Auto-fetch: unexpected ESPN response format');
      return;
    }

    var updated = false;
    events.forEach(function(ev) {
      var type = ev.status && ev.status.type;
      var completed = type && (type.completed === true || type.state === 'post');
      if (!completed) return; // only score truly finished games

      var comp = ev.competitions && ev.competitions[0];
      if (!comp || !comp.competitors) return;
      var home = comp.competitors.find(function(c) { return c.homeAway === 'home'; });
      var away = comp.competitors.find(function(c) { return c.homeAway === 'away'; });
      if (!home || !away || !home.team || !away.team) return;

      var apiHome = canonTeam(home.team.displayName || home.team.name || home.team.shortDisplayName);
      var apiAway = canonTeam(away.team.displayName || away.team.name || away.team.shortDisplayName);
      var fixtureRow = findFixtureByTeams(apiHome, apiAway);
      if (!fixtureRow) return;
      if (fixtureRow.status === 'final') return; // already scored

      // Defensive: never accept a result for a game whose scheduled kickoff hasn't arrived yet.
      if (fixtureRow.utc_date) {
        var ko = new Date(fixtureRow.utc_date).getTime();
        if (!isNaN(ko) && ko > Date.now()) {
          Logger.log('Skip (kickoff in future): ' + apiHome + ' v ' + apiAway);
          return;
        }
      }

      var homeScore = parseInt(home.score, 10);
      var awayScore = parseInt(away.score, 10);
      if (isNaN(homeScore) || isNaN(awayScore)) return;

      updateFixtureResult(fixtureRow.id, homeScore, awayScore);
      updated = true;
    });

    if (updated) rebuildLeaderboard();
  } catch (err) {
    Logger.log('autoFetchResults error: ' + err.message);
  }
}

function findFixtureByTeams(home, away) {
  if (!home || !away) return null;
  var fixtures = sheetToObjects('Fixtures');
  return fixtures.find(function(f) {
    return canonTeam(f.home) === home && canonTeam(f.away) === away;
  }) || null;
}

// ── Result Update ─────────────────────────────────────────────────────────────

function updateFixtureResult(fixtureId, homeScore, awayScore) {
  var s = sheet('Fixtures');
  var data = s.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('id');

  var row = -1, fixture = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(fixtureId)) {
      row = i + 1;
      fixture = {};
      headers.forEach(function(h, j) { fixture[h] = data[i][j]; });
      break;
    }
  }
  if (row < 0) return { error: 'Fixture not found' };

  s.getRange(row, headers.indexOf('home_score') + 1).setValue(homeScore);
  s.getRange(row, headers.indexOf('away_score') + 1).setValue(awayScore);
  s.getRange(row, headers.indexOf('status') + 1).setValue('final');

  if (fixture.phase === 'knockout') {
    // Determine winner (knockout cannot draw — admin should enter the post-ET/PK score)
    var winner = homeScore > awayScore ? fixture.home
               : awayScore > homeScore ? fixture.away : null;
    if (winner) recalculateBracketScores(fixture.round, fixture.match_index, winner);
  } else {
    recalculateGroupScores(fixtureId, homeScore, awayScore);
  }

  rebuildLeaderboard();
  return { success: true };
}

// ── One-off correction ────────────────────────────────────────────────────────
// Revert a fixture that was wrongly marked final (e.g. a phantom result recorded
// before the game was played). Clears its score/status and the points it awarded on
// every prediction, then rebuilds the leaderboard. Run manually from the editor, e.g.
// unfinalizeFixture(19).
function unfinalizeFixture(fixtureId) {
  var s = sheet('Fixtures');
  var data = s.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('id');

  var row = -1, phase = 'group';
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(fixtureId)) {
      row = i + 1;
      phase = data[i][headers.indexOf('phase')];
      break;
    }
  }
  if (row < 0) { Logger.log('Fixture ' + fixtureId + ' not found'); return; }

  s.getRange(row, headers.indexOf('home_score') + 1).setValue('');
  s.getRange(row, headers.indexOf('away_score') + 1).setValue('');
  s.getRange(row, headers.indexOf('status') + 1).setValue('pending');

  if (phase === 'knockout') {
    var bp = sheet('BracketPredictions');
    var bdata = bp.getDataRange().getValues();
    var bh = bdata[0];
    var bIdx = bh.indexOf('match_index'), bRound = bh.indexOf('round');
    var bCor = bh.indexOf('is_correct'), bPts = bh.indexOf('pts_awarded');
    // Knockout predictions key off round+match_index; clear all of this fixture's round/match.
    var fRound = data[row - 1][headers.indexOf('round')];
    var fMatch = data[row - 1][headers.indexOf('match_index')];
    for (var k = 1; k < bdata.length; k++) {
      if (bdata[k][bRound] === fRound && String(bdata[k][bIdx]) === String(fMatch)) {
        bp.getRange(k + 1, bCor + 1).setValue('');
        bp.getRange(k + 1, bPts + 1).setValue(0);
      }
    }
  } else {
    var gp = sheet('GroupPredictions');
    var gdata = gp.getDataRange().getValues();
    var gh = gdata[0];
    var fcol = gh.indexOf('fixture_id'), pcol = gh.indexOf('pts_awarded');
    for (var j = 1; j < gdata.length; j++) {
      if (String(gdata[j][fcol]) === String(fixtureId)) gp.getRange(j + 1, pcol + 1).setValue('');
    }
  }

  rebuildLeaderboard();
  Logger.log('Unfinalized fixture ' + fixtureId + ' and rebuilt leaderboard.');
}

// One-click cleanup for the phantom USA–Paraguay (fixture 19): select this in the
// editor's function dropdown and press Run. Safe to delete after you've run it once.
function clearPhantomGame19() {
  unfinalizeFixture(19);
}

// ── Knockout fixture upsert ───────────────────────────────────────────────────
// Creates or updates a knockout matchup by round + match_index, optionally with
// a result. If scores are provided, marks final and scores bracket picks.

function upsertKnockoutFixture(round, matchIndex, home, away, homeScore, awayScore) {
  if (!round || !matchIndex || !home || !away) return { error: 'Missing round/match/teams' };

  var s = sheet('Fixtures');
  var data = s.getDataRange().getValues();
  var headers = data[0];
  var roundCol = headers.indexOf('round');
  var idxCol   = headers.indexOf('match_index');
  var phaseCol = headers.indexOf('phase');
  var idCol    = headers.indexOf('id');

  var hasResult = (homeScore !== '' && homeScore != null && awayScore !== '' && awayScore != null);

  // Find existing knockout fixture for this round + match_index
  var existingRow = -1, existingId = null;
  var maxId = 0;
  for (var i = 1; i < data.length; i++) {
    var rid = Number(data[i][idCol]); if (rid > maxId) maxId = rid;
    if (data[i][phaseCol] === 'knockout' &&
        data[i][roundCol] === round &&
        String(data[i][idxCol]) === String(matchIndex)) {
      existingRow = i + 1;
      existingId = data[i][idCol];
    }
  }

  if (existingRow > 0) {
    s.getRange(existingRow, headers.indexOf('home') + 1).setValue(home);
    s.getRange(existingRow, headers.indexOf('away') + 1).setValue(away);
    if (hasResult) {
      return updateFixtureResult(existingId, parseInt(homeScore, 10), parseInt(awayScore, 10));
    }
    return { success: true, id: existingId };
  }

  // Create a new knockout fixture row
  var newId = maxId + 1;
  var rowObj = {
    id: newId, api_id: '', phase: 'knockout', group: '', round: round,
    match_index: matchIndex, home: home, away: away, utc_date: '',
    home_score: hasResult ? parseInt(homeScore, 10) : '',
    away_score: hasResult ? parseInt(awayScore, 10) : '',
    status: hasResult ? 'final' : 'pending'
  };
  var newRow = headers.map(function(h) { return rowObj[h] !== undefined ? rowObj[h] : ''; });
  s.appendRow(newRow);

  if (hasResult) {
    return updateFixtureResult(newId, parseInt(homeScore, 10), parseInt(awayScore, 10));
  }
  return { success: true, id: newId };
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
// answers = { runner_up, third_place, golden_ball, golden_boot, golden_glove }
// Any provided field is scored; omitted/blank fields are left untouched.
// Team picks (runner_up, third_place) match exactly; player awards match
// case-insensitively and trimmed since they're free-text.

function norm(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

function scoreMacroPicks(answers) {
  var macros  = sheetToObjects('MacroPicks');
  var s       = sheet('MacroPicks');
  var headers = s.getDataRange().getValues()[0];

  var cols = {
    runner_up:    headers.indexOf('runner_up_pts') + 1,
    third_place:  headers.indexOf('third_place_pts') + 1,
    golden_ball:  headers.indexOf('golden_ball_pts') + 1,
    golden_boot:  headers.indexOf('golden_boot_pts') + 1,
    golden_glove: headers.indexOf('golden_glove_pts') + 1
  };

  var teamFields   = ['runner_up', 'third_place'];
  var playerFields = ['golden_ball', 'golden_boot', 'golden_glove'];

  macros.forEach(function(row, i) {
    var sheetRow = i + 2; // +1 header, +1 for 1-indexing
    teamFields.forEach(function(f) {
      if (!answers[f]) return;
      s.getRange(sheetRow, cols[f]).setValue(row[f] === answers[f] ? MACRO_PTS[f] : 0);
    });
    playerFields.forEach(function(f) {
      if (!answers[f]) return;
      s.getRange(sheetRow, cols[f]).setValue(norm(row[f]) === norm(answers[f]) ? MACRO_PTS[f] : 0);
    });
  });

  rebuildLeaderboard();
  return { success: true };
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
    var mpts  = mrow
      ? (Number(mrow.runner_up_pts)    || 0) +
        (Number(mrow.third_place_pts)  || 0) +
        (Number(mrow.golden_ball_pts)  || 0) +
        (Number(mrow.golden_boot_pts)  || 0) +
        (Number(mrow.golden_glove_pts) || 0)
      : 0;

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
