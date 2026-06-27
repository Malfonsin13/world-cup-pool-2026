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

var KO_ROUND = { 'round-of-32': 'R32', 'round-of-16': 'R16', 'quarterfinals': 'QF', 'semifinals': 'SF', 'final': 'Final' };

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

    // 1. Open the bracket once ESPN has all 16 R32 matchups with real teams.
    autoFetchKnockoutBracket(events);

    // 2. Record completed GROUP results into our fixtures.
    events.forEach(function(ev) {
      var type = ev.status && ev.status.type;
      if (!(type && (type.completed === true || type.state === 'post'))) return;

      var comp = ev.competitions && ev.competitions[0];
      if (!comp || !comp.competitors) return;
      var home = comp.competitors.find(function(c) { return c.homeAway === 'home'; });
      var away = comp.competitors.find(function(c) { return c.homeAway === 'away'; });
      if (!home || !away || !home.team || !away.team) return;

      var apiHome = canonTeam(home.team.displayName || home.team.name || home.team.shortDisplayName);
      var apiAway = canonTeam(away.team.displayName || away.team.name || away.team.shortDisplayName);
      var fixtureRow = findFixtureByTeams(apiHome, apiAway);
      if (!fixtureRow || fixtureRow.phase !== 'group') return; // group results only here
      if (fixtureRow.status === 'final') return;

      if (fixtureRow.utc_date) {
        var ko = new Date(fixtureRow.utc_date).getTime();
        if (!isNaN(ko) && ko > Date.now()) { Logger.log('Skip (kickoff future): ' + apiHome + ' v ' + apiAway); return; }
      }

      var homeScore = parseInt(home.score, 10);
      var awayScore = parseInt(away.score, 10);
      if (isNaN(homeScore) || isNaN(awayScore)) return;

      updateFixtureResult(fixtureRow.id, homeScore, awayScore);
    });

    // 3. Score the knockout bracket by team advancement (ESPN round winners), and cache the
    //    winners so the frontend can mark each pick won/lost without its own ESPN call.
    var winners = getKnockoutWinnersByRound(events);
    setConfig('knockout_winners', JSON.stringify(winners));
    scoreBracketByAdvancement(winners);

    rebuildLeaderboard();
  } catch (err) {
    Logger.log('autoFetchResults error: ' + err.message);
  }
}

// Load Round-of-32 matchups from ESPN as they get decided (partial is fine — a slot whose
// teams aren't set yet stays TBD). match_index = position in the date-sorted 16-game list
// (stable, matches ESPN's "Round of 32 N" bracket numbering). Sets bracket_lock to the first
// R32 kickoff. Idempotent.
function autoFetchKnockoutBracket(events) {
  function real(n) { return n && !/Winner|Place|Round of/i.test(n); }
  function side(e, ha) { var c = e.competitions && e.competitions[0]; return c && c.competitors.find(function(x) { return x.homeAway === ha; }); }

  var r32 = events.filter(function(e) { return (e.season && e.season.slug) === 'round-of-32'; })
                  .sort(function(a, b) { return (new Date(a.date) - new Date(b.date)) || String(a.id).localeCompare(String(b.id)); });
  if (r32.length !== 16) return false;

  var firstKick = null;
  r32.forEach(function(e, i) {
    var ko = new Date(e.date).getTime();
    if (!isNaN(ko) && (firstKick === null || ko < firstKick)) firstKick = ko;
    var h = side(e, 'home'), a = side(e, 'away');
    if (!h || !a || !h.team || !a.team) return;
    if (!real(h.team.displayName) || !real(a.team.displayName)) return; // not decided yet — leave TBD
    upsertKnockoutFixture('R32', i + 1, canonTeam(h.team.displayName), canonTeam(a.team.displayName), '', '', e.date);
  });
  if (firstKick !== null) setConfig('bracket_lock', new Date(firstKick).toISOString());
  return true;
}

// Set of teams that WON their game in each knockout round, from ESPN. { R32:{team:true}, ... }
function getKnockoutWinnersByRound(events) {
  if (!events) {
    try {
      var resp = UrlFetchApp.fetch(ESPN_WC_URL, { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) return {};
      events = (JSON.parse(resp.getContentText()) || {}).events || [];
    } catch (e) { return {}; }
  }
  var winners = {};
  events.forEach(function(e) {
    var r = KO_ROUND[e.season && e.season.slug];
    if (!r) return; // skip group + 3rd-place-match
    var type = e.status && e.status.type;
    if (!(type && (type.completed === true || type.state === 'post'))) return;
    var c = e.competitions && e.competitions[0];
    if (!c || !c.competitors) return;
    var h = c.competitors.find(function(x) { return x.homeAway === 'home'; });
    var a = c.competitors.find(function(x) { return x.homeAway === 'away'; });
    if (!h || !a || !h.team || !a.team) return;
    var hs = parseInt(h.score, 10), as = parseInt(a.score, 10);
    if (isNaN(hs) || isNaN(as)) return;
    var w = hs > as ? h.team.displayName : as > hs ? a.team.displayName : null;
    if (!w) return;
    (winners[r] = winners[r] || {})[canonTeam(w)] = true;
  });
  return winners;
}

// Score every bracket pick: points if the team you picked actually won its game that round.
function scoreBracketByAdvancement(winners) {
  winners = winners || getKnockoutWinnersByRound();
  var s = sheet('BracketPredictions');
  var data = s.getDataRange().getValues();
  if (data.length < 2) return;
  var headers = data[0];
  var roundCol = headers.indexOf('round');
  var pickCol  = headers.indexOf('team_picked');
  var corCol   = headers.indexOf('is_correct');
  var ptsCol   = headers.indexOf('pts_awarded');
  for (var i = 1; i < data.length; i++) {
    var r = data[i][roundCol];
    var won = winners[r] && winners[r][canonTeam(data[i][pickCol])];
    var pts = won ? ((BRACKET_PTS[r] || 0) + (r === 'Final' ? CHAMPION_BONUS : 0)) : 0;
    s.getRange(i + 1, corCol + 1).setValue(!!won);
    s.getRange(i + 1, ptsCol + 1).setValue(pts);
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
    // Bracket is scored by team advancement (scoreBracketByAdvancement), driven off ESPN
    // round results — re-score the whole bracket so this win counts wherever it was picked.
    scoreBracketByAdvancement();
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

function upsertKnockoutFixture(round, matchIndex, home, away, homeScore, awayScore, utc) {
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
    if (utc) s.getRange(existingRow, headers.indexOf('utc_date') + 1).setValue(utc);
    if (hasResult) {
      return updateFixtureResult(existingId, parseInt(homeScore, 10), parseInt(awayScore, 10));
    }
    return { success: true, id: existingId };
  }

  // Create a new knockout fixture row
  var newId = maxId + 1;
  var rowObj = {
    id: newId, api_id: '', phase: 'knockout', group: '', round: round,
    match_index: matchIndex, home: home, away: away, utc_date: utc || '',
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

// Re-run group scoring for every finished group game (kept-row points stay correct after a dedup).
function rescoreAllFinalGroupGames() {
  sheetToObjects('Fixtures').forEach(function(f) {
    if (f.phase === 'group' && f.status === 'final') {
      recalculateGroupScores(f.id, Number(f.home_score), Number(f.away_score));
    }
  });
  rebuildLeaderboard();
}

// ── One-off cleanup: remove duplicate group predictions ───────────────────────
// Some users have >1 row per game (an old save path created duplicates instead of
// updating), which double-counts in the leaderboard. For each (user, fixture) this
// KEEPS the player's latest pick and deletes the rest — preferring the latest pick
// made BEFORE kickoff for games already played, so nobody benefits from a post-result
// row. Then it rescores finished games and rebuilds the leaderboard. Run ONCE.
function dedupeGroupPredictions() {
  var s = sheet('GroupPredictions');
  var data = s.getDataRange().getValues();
  var headers = data[0];
  var userCol = headers.indexOf('user_id');
  var fixCol  = headers.indexOf('fixture_id');
  var updCol  = headers.indexOf('updated_at');

  var kickoff = {};
  sheetToObjects('Fixtures').forEach(function(f) {
    kickoff[String(f.id)] = f.utc_date ? new Date(f.utc_date).getTime() : null;
  });

  // Group row indices (0-based into `data`) by user|fixture
  var groups = {};
  for (var i = 1; i < data.length; i++) {
    var k = String(data[i][userCol]) + '|' + String(data[i][fixCol]);
    (groups[k] = groups[k] || []).push(i);
  }

  var toDelete = [];
  Object.keys(groups).forEach(function(k) {
    var idxs = groups[k];
    if (idxs.length < 2) return;
    var ko = kickoff[k.split('|')[1]];
    idxs.sort(function(a, b) {
      var ta = new Date(data[a][updCol]).getTime() || 0;
      var tb = new Date(data[b][updCol]).getTime() || 0;
      if (ko) { // prefer rows saved before kickoff
        var va = ta <= ko, vb = tb <= ko;
        if (va !== vb) return va ? -1 : 1;
      }
      return tb - ta; // then latest first
    });
    idxs.slice(1).forEach(function(ix) { toDelete.push(ix); }); // keep idxs[0]
  });

  // Delete bottom-up so earlier indices stay valid (sheet row = data index + 1)
  toDelete.sort(function(a, b) { return b - a; }).forEach(function(ix) { s.deleteRow(ix + 1); });
  Logger.log('Deleted ' + toDelete.length + ' duplicate prediction rows.');

  rescoreAllFinalGroupGames();
  Logger.log('Rescored finished games and rebuilt the leaderboard.');
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
