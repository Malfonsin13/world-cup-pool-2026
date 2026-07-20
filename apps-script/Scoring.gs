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
var ESPN_STANDINGS_URL = 'https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings';

var KO_ROUND = { 'round-of-32': 'R32', 'round-of-16': 'R16', 'quarterfinals': 'QF', 'semifinals': 'SF', 'final': 'Final' };

// Official 2026 FIFA bracket structure (fixed — independent of which teams qualify).
// Each Round-of-32 slot ("Round of 32 N", which the R16+ feeds reference) is identified by the
// GROUP WINNER in it; the four runner-up-vs-runner-up ties are identified by their group pair.
// This is why seeding can't be inferred from kickoff date or ESPN id — it's set by group position.
var R32_WINNER_SLOT = { E: 2, F: 3, C: 4, I: 5, A: 7, L: 8, D: 9, G: 10, H: 12, B: 13, J: 14, K: 15 };
var R32_RUPAIR_SLOT = { 'A,B': 1, 'E,I': 6, 'K,L': 11, 'D,G': 16 };

// Which prior-round slots feed each later-round slot (mirrors FEEDS in js/views/bracket.js).
// Used only to attach kickoff dates to later-round cards.
var BRACKET_FEEDS = {
  R16: { 1: [1, 3], 2: [2, 5], 3: [4, 6], 4: [7, 8], 5: [11, 12], 6: [9, 10], 7: [14, 16], 8: [13, 15] },
  QF:  { 1: [1, 2], 2: [5, 6], 3: [3, 4], 4: [7, 8] },
  SF:  { 1: [1, 2], 2: [3, 4] },
  Final: { 1: [1, 2] }
};

// team (canonical) -> { group:'A'..'L', rank:1..4 } from ESPN's group standings. null on failure.
function fetchGroupStandings() {
  try {
    var resp = UrlFetchApp.fetch(ESPN_STANDINGS_URL, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return null;
    var groups = (JSON.parse(resp.getContentText()) || {}).children;
    if (!Array.isArray(groups)) return null;
    var info = {};
    groups.forEach(function(g) {
      var letter = String(g.name || '').replace('Group ', '').trim();
      var entries = (g.standings && g.standings.entries) || [];
      entries.forEach(function(e) {
        var rk = (e.stats || []).find(function(s) { return s.name === 'rank' || s.type === 'rank'; });
        var nm = e.team && (e.team.displayName || e.team.name);
        if (nm) info[canonTeam(nm)] = { group: letter, rank: rk ? Number(rk.value) : null };
      });
    });
    return Object.keys(info).length ? info : null;
  } catch (e) { return null; }
}

// Official R32 slot (1..16) for a matchup, derived from each team's group + finishing rank.
// Returns null if either team is unknown (standings not final yet).
function r32SlotForTeams(homeCanon, awayCanon, info) {
  var hi = info[homeCanon], ai = info[awayCanon];
  if (!hi || !ai) return null;
  if (hi.rank === 1) return R32_WINNER_SLOT[hi.group] || null;
  if (ai.rank === 1) return R32_WINNER_SLOT[ai.group] || null;
  return R32_RUPAIR_SLOT[[hi.group, ai.group].sort().join(',')] || null; // runner-up vs runner-up
}

// Kickoff date per knockout slot for the bracket UI: { R32:{slot:iso}, R16:{...}, QF, SF, Final }.
// R32 slots map by group position; later rounds map via each game's "Round of X N Winner"
// placeholder. Merges onto the cached map so an already-resolved slot never loses its date.
function buildKnockoutDates(events, info) {
  var dates;
  try { dates = JSON.parse(getConfig('knockout_dates') || '{}'); } catch (e) { dates = {}; }
  ['R32', 'R16', 'QF', 'SF', 'Final'].forEach(function(r) { if (!dates[r]) dates[r] = {}; });

  var slugRound = { 'round-of-16': 'R16', 'quarterfinals': 'QF', 'semifinals': 'SF', 'final': 'Final' };
  function side(e, ha) { var c = e.competitions && e.competitions[0]; return c && c.competitors.find(function(x) { return x.homeAway === ha; }); }
  function refNum(c) { var nm = (c && c.team && (c.team.displayName || c.team.name)) || ''; var m = String(nm).match(/(\d+)\s*Winner/i); return m ? Number(m[1]) : null; }
  function feedSlot(round, a, b) {
    var f = BRACKET_FEEDS[round]; if (!f) return null;
    for (var k in f) { if ((f[k][0] === a && f[k][1] === b) || (f[k][0] === b && f[k][1] === a)) return Number(k); }
    return null;
  }

  events.forEach(function(e) {
    var slug = e.season && e.season.slug;
    if (slug === 'round-of-32') {
      var h = side(e, 'home'), a = side(e, 'away');
      if (!h || !a || !h.team || !a.team) return;
      var slot = r32SlotForTeams(canonTeam(h.team.displayName), canonTeam(a.team.displayName), info);
      if (slot) dates.R32[slot] = e.date;
      return;
    }
    var round = slugRound[slug];
    if (!round) return;
    if (round === 'Final') { dates.Final[1] = e.date; return; }
    var an = refNum(side(e, 'home')), bn = refNum(side(e, 'away'));
    if (an && bn) { var s = feedSlot(round, an, bn); if (s) dates[round][s] = e.date; }
  });
  return dates;
}

function autoFetchResults() {
  try {
    // Once the tournament is finalized, results (incl. the manually-corrected SF/Final and
    // penalty-decided games) are locked — don't let a late ESPN poll overwrite them.
    if (getConfig('tournament_status') === 'complete') { Logger.log('autoFetchResults: tournament complete — skipping'); return; }
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
// teams aren't set yet stays TBD). match_index = the official "Round of 32 N" slot, derived
// from group position (group winner / runner-up pair) via ESPN standings — NOT kickoff order,
// which doesn't match FIFA's numbering. Sets bracket_lock to the first R32 kickoff. Idempotent.
function autoFetchKnockoutBracket(events) {
  function real(n) { return n && !/Winner|Place|Round of/i.test(n); }
  function side(e, ha) { var c = e.competitions && e.competitions[0]; return c && c.competitors.find(function(x) { return x.homeAway === ha; }); }

  var r32 = events.filter(function(e) { return (e.season && e.season.slug) === 'round-of-32'; });
  if (r32.length !== 16) return false;

  var info = fetchGroupStandings();      // need group finishes to seed the slots correctly
  if (!info) return false;

  var firstKick = null;
  r32.forEach(function(e) {
    var ko = new Date(e.date).getTime();
    if (!isNaN(ko) && (firstKick === null || ko < firstKick)) firstKick = ko;
    var h = side(e, 'home'), a = side(e, 'away');
    if (!h || !a || !h.team || !a.team) return;
    if (!real(h.team.displayName) || !real(a.team.displayName)) return; // not decided yet — leave TBD
    var hc = canonTeam(h.team.displayName), ac = canonTeam(a.team.displayName);
    var slot = r32SlotForTeams(hc, ac, info);
    if (!slot) return; // can't seed this game yet
    upsertKnockoutFixture('R32', slot, hc, ac, '', '', e.date);
  });
  if (firstKick !== null) setConfig('bracket_lock', new Date(firstKick).toISOString());
  setConfig('knockout_dates', JSON.stringify(buildKnockoutDates(events, info)));
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

// Tolerant match for free-text award picks: accent- and case-insensitive, punctuation-stripped,
// and matches when one name's words are all contained in the other (so "Mbappe", "Kylian Mbappe",
// and "Mbappé" all match, and "Simon" matches "Unai Simon"). Team picks stay exact.
function nameMatch(a, b) {
  function base(s) {
    var d = String(s == null ? '' : s).normalize('NFD');
    var out = '';
    for (var i = 0; i < d.length; i++) { var c = d.charCodeAt(i); if (c < 0x300 || c > 0x36f) out += d[i]; }
    return out.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  var A = base(a), B = base(b);
  if (!A || !B) return false;
  if (A === B) return true;
  var ta = A.split(' '), tb = B.split(' ');
  var short = ta.length <= tb.length ? ta : tb, long = ta.length <= tb.length ? tb : ta;
  return short.every(function(t) { return long.indexOf(t) >= 0; });
}

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
      s.getRange(sheetRow, cols[f]).setValue(nameMatch(row[f], answers[f]) ? MACRO_PTS[f] : 0);
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

// ── One-off correction: re-seed the knockout bracket ──────────────────────────
// The bracket was first loaded with R32 slots in kickoff order, but FIFA's "Round of 32 N"
// numbering is set by group position — so the R16+ matchups were wrong. This rebuilds the R32
// fixtures at their correct slots, MIGRATES each player's R32 pick to the slot now holding its
// team (so their R32 picks are honored), DELETES every R16/QF/SF/Final pick (they were made
// against the wrong seeding), then re-scores. Players re-fill the later rounds. Run ONCE.
function fixBracketSeeding() { reseedKnockoutBracket(); }

function reseedKnockoutBracket() {
  var events;
  try {
    var resp = UrlFetchApp.fetch(ESPN_WC_URL, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) { Logger.log('reseed: ESPN HTTP ' + resp.getResponseCode()); return; }
    events = (JSON.parse(resp.getContentText()) || {}).events || [];
  } catch (e) { Logger.log('reseed: ESPN fetch failed — ' + e.message); return; }

  var info = fetchGroupStandings();
  if (!info) { Logger.log('reseed: standings unavailable — aborting'); return; }

  function real(n) { return n && !/Winner|Place|Round of/i.test(n); }
  function side(e, ha) { var c = e.competitions && e.competitions[0]; return c && c.competitors.find(function(x) { return x.homeAway === ha; }); }

  // 1. Correct R32 matchups by slot, and a team -> slot map for migrating picks.
  var slotGames = {}, teamSlot = {};
  events.filter(function(e) { return (e.season && e.season.slug) === 'round-of-32'; }).forEach(function(e) {
    var h = side(e, 'home'), a = side(e, 'away');
    if (!h || !a || !h.team || !a.team) return;
    if (!real(h.team.displayName) || !real(a.team.displayName)) return;
    var hc = canonTeam(h.team.displayName), ac = canonTeam(a.team.displayName);
    var slot = r32SlotForTeams(hc, ac, info);
    if (!slot) return;
    slotGames[slot] = { home: hc, away: ac, utc: e.date };
    teamSlot[hc] = slot; teamSlot[ac] = slot;
  });
  if (Object.keys(slotGames).length !== 16) {
    Logger.log('reseed: only ' + Object.keys(slotGames).length + '/16 R32 slots resolved — aborting to avoid a partial reseed');
    return;
  }

  // 2. Delete every existing knockout fixture (wrong date-order R32 + any later rounds).
  var fs = sheet('Fixtures');
  var fdata = fs.getDataRange().getValues();
  var phaseCol = fdata[0].indexOf('phase');
  var delRows = [];
  for (var i = 1; i < fdata.length; i++) { if (fdata[i][phaseCol] === 'knockout') delRows.push(i + 1); }
  delRows.sort(function(a, b) { return b - a; }).forEach(function(r) { fs.deleteRow(r); });
  Logger.log('reseed: deleted ' + delRows.length + ' knockout fixtures');

  // 3. Re-create the 16 R32 fixtures at the correct slots.
  Object.keys(slotGames).map(Number).sort(function(a, b) { return a - b; }).forEach(function(slot) {
    var g = slotGames[slot];
    upsertKnockoutFixture('R32', slot, g.home, g.away, '', '', g.utc);
  });

  // 4. Migrate R32 picks to the slot now holding their team; delete all R16/QF/SF/Final picks.
  var bp = sheet('BracketPredictions');
  var bdata = bp.getDataRange().getValues();
  var bh = bdata[0];
  var bRound = bh.indexOf('round'), bIdx = bh.indexOf('match_index'), bPick = bh.indexOf('team_picked');
  var migrated = 0, deletePicks = [];
  for (var k = 1; k < bdata.length; k++) {
    var round = bdata[k][bRound];
    if (round === 'R32') {
      var newSlot = teamSlot[canonTeam(bdata[k][bPick])];
      if (newSlot && String(bdata[k][bIdx]) !== String(newSlot)) { bp.getRange(k + 1, bIdx + 1).setValue(newSlot); migrated++; }
    } else if (round === 'R16' || round === 'QF' || round === 'SF' || round === 'Final') {
      deletePicks.push(k + 1);
    }
  }
  deletePicks.sort(function(a, b) { return b - a; }).forEach(function(r) { bp.deleteRow(r); });
  Logger.log('reseed: migrated ' + migrated + ' R32 picks, deleted ' + deletePicks.length + ' R16+ picks');

  // 5. Cache dates + lock, re-score by advancement, rebuild leaderboard.
  setConfig('knockout_dates', JSON.stringify(buildKnockoutDates(events, info)));
  var firstKick = null;
  Object.keys(slotGames).forEach(function(s) { var t = new Date(slotGames[s].utc).getTime(); if (!isNaN(t) && (firstKick === null || t < firstKick)) firstKick = t; });
  if (firstKick !== null) setConfig('bracket_lock', new Date(firstKick).toISOString());

  var winners = getKnockoutWinnersByRound(events);
  setConfig('knockout_winners', JSON.stringify(winners));
  scoreBracketByAdvancement(winners);
  rebuildLeaderboard();
  Logger.log('reseed: done — bracket re-seeded, R32 picks migrated, leaderboard rebuilt');
}

// ── One-off correction: restore bracket picks that failed to save ─────────────
// Some users' bracket picks never saved before the lock. This writes them directly (bypassing
// the lock — authorized admin correction). Scoring is by team advancement, so match_index only
// affects display; picks map each named team to its unique slot via the FEEDS topology.
//
// THE BIG BUSH was already corrected separately — he is NOT touched here.
// Susana provided screenshots → we restore her FULL bracket verbatim.
// Flowers21 gave only his later-round winners (no screenshots) → those are only valid if his
// ALREADY-RECORDED R32 picks actually put those teams through. We VALIDATE each claimed R16
// winner against his stored R32 pick and refuse to write if anything conflicts (e.g. he says
// Morocco wins the R16 but his R32 slot-3 pick was Netherlands).
//
// Run `fixMissingBracketPicks` to apply. Run `checkFlowersBracket` first if you just want the
// read-only consistency report for Flowers21 without writing anything. Idempotent.

// Upsert a list of {round, match_index, team_picked} for the first user whose display_name
// contains nameSubstr (case-insensitive). No scoring/rebuild here — the caller does it once.
function _applyBracketPicks(target, picks) {
  Logger.log('_applyBracketPicks: ' + target.display_name + ' (id=' + target.id + ') — ' + picks.length + ' picks');
  var s = sheet('BracketPredictions');
  var data = s.getDataRange().getValues();
  var headers = data[0];
  var userCol  = headers.indexOf('user_id');
  var roundCol = headers.indexOf('round');
  var idxCol   = headers.indexOf('match_index');
  var pickCol  = headers.indexOf('team_picked');
  var ptsCol   = headers.indexOf('pts_awarded');
  var updCol   = headers.indexOf('updated_at');
  var now = new Date().toISOString();

  picks.forEach(function(p) {
    var existingRow = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][userCol]) === String(target.id) &&
          data[i][roundCol] === p.round &&
          String(data[i][idxCol]) === String(p.match_index)) { existingRow = i + 1; break; }
    }
    if (existingRow > 0) {
      s.getRange(existingRow, pickCol + 1).setValue(p.team_picked);
      s.getRange(existingRow, ptsCol + 1).setValue(0);
      s.getRange(existingRow, updCol + 1).setValue(now);
      Logger.log('  updated ' + p.round + '_' + p.match_index + ' → ' + p.team_picked);
    } else {
      s.appendRow([target.id, p.round, p.match_index, p.team_picked, '', 0, now]);
      Logger.log('  inserted ' + p.round + '_' + p.match_index + ' → ' + p.team_picked);
    }
  });
}

// First user whose display_name contains nameSubstr (case-insensitive), or null.
function _findUser(nameSubstr) {
  var key = String(nameSubstr).toUpperCase();
  var matches = sheetToObjects('Users').filter(function(u) {
    return String(u.display_name || '').toUpperCase().indexOf(key) >= 0;
  });
  if (!matches.length) { Logger.log('no user matching "' + nameSubstr + '"'); return null; }
  if (matches.length > 1) {
    Logger.log('WARNING multiple users match "' + nameSubstr + '": ' +
      matches.map(function(m) { return m.display_name; }).join(', ') + ' — using the first');
  }
  return matches[0];
}

// canonTeam -> R32 match_index, read from the (reseeded) knockout fixtures. Each team is in one game.
function _r32SlotByTeam() {
  var map = {};
  sheetToObjects('Fixtures').forEach(function(f) {
    if (f.phase === 'knockout' && f.round === 'R32') {
      if (f.home) map[canonTeam(f.home)] = Number(f.match_index);
      if (f.away) map[canonTeam(f.away)] = Number(f.match_index);
    }
  });
  return map;
}

// A user's recorded picks for one round, as { match_index -> team }.
function _userRoundPicks(userId, round) {
  var out = {};
  sheetToObjects('BracketPredictions').forEach(function(r) {
    if (String(r.user_id) === String(userId) && r.round === round) out[Number(r.match_index)] = r.team_picked;
  });
  return out;
}

// Flowers21's stated winners (no screenshots — validated against his recorded R32 before writing).
//   R16: Morocco(1) France(2) Brazil(3) Mexico(4) Spain(5) USA(6) Argentina(7) Colombia(8)
//   QF: France(1) USA(2) Mexico(3) Argentina(4) · SF: France(1) Mexico(2) · Final: France
function _flowersPicks() {
  return [
    { round: 'R16', match_index: 1, team_picked: 'Morocco' },
    { round: 'R16', match_index: 2, team_picked: 'France' },
    { round: 'R16', match_index: 3, team_picked: 'Brazil' },
    { round: 'R16', match_index: 4, team_picked: 'Mexico' },
    { round: 'R16', match_index: 5, team_picked: 'Spain' },
    { round: 'R16', match_index: 6, team_picked: 'USA' },
    { round: 'R16', match_index: 7, team_picked: 'Argentina' },
    { round: 'R16', match_index: 8, team_picked: 'Colombia' },
    { round: 'QF', match_index: 1, team_picked: 'France' },
    { round: 'QF', match_index: 2, team_picked: 'USA' },
    { round: 'QF', match_index: 3, team_picked: 'Mexico' },
    { round: 'QF', match_index: 4, team_picked: 'Argentina' },
    { round: 'SF', match_index: 1, team_picked: 'France' },
    { round: 'SF', match_index: 2, team_picked: 'Mexico' },
    { round: 'Final', match_index: 1, team_picked: 'France' }
  ];
}

// Checks each claimed R16 winner against Flowers21's ALREADY-RECORDED R32 pick: for team T to win
// its R16, his R32 pick in T's game must be T. Returns { ok, mismatches[], user }. Logs the report.
function _validateFlowersR32() {
  var user = _findUser('Flowers21');
  if (!user) return { ok: false, mismatches: ['user not found'], user: null };

  var slotByTeam = _r32SlotByTeam();
  var hisR32 = _userRoundPicks(user.id, 'R32'); // slot -> his recorded winner
  var mismatches = [];

  _flowersPicks().filter(function(p) { return p.round === 'R16'; }).forEach(function(p) {
    var team = p.team_picked;
    var slot = slotByTeam[canonTeam(team)];
    var his = slot ? hisR32[slot] : undefined;
    var okSlot = slot && canonTeam(his || '') === canonTeam(team);
    Logger.log('  R16 ' + p.match_index + ' claims ' + team + ' → needs R32 slot ' + slot + ' = ' + team +
      '; recorded R32 slot ' + slot + ' = "' + (his || '(none)') + '"  ' + (okSlot ? 'OK' : '✗ CONFLICT'));
    if (!okSlot) {
      mismatches.push('R16 ' + p.match_index + ': ' + team + ' can\'t advance — his R32 slot ' + slot +
        ' pick is "' + (his || '(none)') + '", not ' + team);
    }
  });
  return { ok: mismatches.length === 0, mismatches: mismatches, user: user };
}

// READ-ONLY: report whether Flowers21's recorded R32 picks support his claimed R16 winners.
function checkFlowersBracket() {
  Logger.log('Checking Flowers21 R16 claims against his recorded R32 picks…');
  var v = _validateFlowersR32();
  if (!v.user) { Logger.log('Flowers21 not found.'); return; }
  if (v.ok) Logger.log('RESULT: ✓ consistent — safe to write his later-round picks.');
  else {
    Logger.log('RESULT: ✗ ' + v.mismatches.length + ' conflict(s) — do NOT write; go back to Flowers21:');
    v.mismatches.forEach(function(m) { Logger.log('   - ' + m); });
  }
}

// Susana — full bracket (none of her picks saved). Decoded from her screenshots; every R16 card's
// two teams confirm the feeding R32 winners, and each later round's winner comes from its feeds.
//   R32: 1 Canada 2 Germany 3 Netherlands 4 Brazil 5 France 6 Norway 7 Mexico 8 England
//        9 USA 10 Belgium 11 Portugal 12 Spain 13 Switzerland 14 Argentina 15 Colombia 16 Australia
//   R16: 1 Netherlands 2 France 3 Brazil 4 Mexico 5 Portugal 6 USA 7 Argentina 8 Colombia
//   QF: 1 France 2 Portugal 3 Brazil 4 Argentina · SF: 1 France 2 Argentina · Final: France
function _susanaPicks() {
  var r32 = ['Canada','Germany','Netherlands','Brazil','France','Norway','Mexico','England',
             'USA','Belgium','Portugal','Spain','Switzerland','Argentina','Colombia','Australia'];
  var out = r32.map(function(t, i) { return { round: 'R32', match_index: i + 1, team_picked: t }; });
  var r16 = ['Netherlands','France','Brazil','Mexico','Portugal','USA','Argentina','Colombia'];
  r16.forEach(function(t, i) { out.push({ round: 'R16', match_index: i + 1, team_picked: t }); });
  ['France','Portugal','Brazil','Argentina'].forEach(function(t, i) { out.push({ round: 'QF', match_index: i + 1, team_picked: t }); });
  ['France','Argentina'].forEach(function(t, i) { out.push({ round: 'SF', match_index: i + 1, team_picked: t }); });
  out.push({ round: 'Final', match_index: 1, team_picked: 'France' });
  return out;
}

// Run this ONE function from the editor. Restores Susana's full bracket, and Flowers21's later
// rounds ONLY IF his recorded R32 picks support them (otherwise it skips him and logs the conflict).
function fixMissingBracketPicks() {
  // Susana — full bracket from screenshots.
  var susana = _findUser('Susana');
  if (susana) _applyBracketPicks(susana, _susanaPicks());

  // Flowers21 — validate against his recorded R32 first.
  var v = _validateFlowersR32();
  if (v.user && v.ok) {
    _applyBracketPicks(v.user, _flowersPicks());
  } else if (v.user) {
    Logger.log('Flowers21 SKIPPED — his R16 claims conflict with his recorded R32 picks:');
    v.mismatches.forEach(function(m) { Logger.log('   - ' + m); });
  }

  scoreBracketByAdvancement();
  rebuildLeaderboard();
  Logger.log('fixMissingBracketPicks: done' +
    (v.user && !v.ok ? ' — NOTE: Flowers21 was skipped (see conflicts above); reconcile his R32 picks with him.' : ''));
}

// ── Tournament finalization ───────────────────────────────────────────────────
// ESPN's feed stopped at the QF and reported 4 penalty-decided games as draws, so the auto-scorer
// never credited the SF/Final/champion or those penalty advancers. These are the COMPLETE, correct
// knockout results (teams that ADVANCED each round), reconstructed from ESPN's bracket + the final
// standings (champion Spain, runner-up Argentina, 3rd England).
function finalKnockoutWinners() {
  var W = {
    R32: ['Canada','Paraguay','Morocco','Brazil','France','Norway','Mexico','England',
          'USA','Belgium','Portugal','Spain','Switzerland','Argentina','Colombia','Egypt'],
    R16: ['Morocco','France','Norway','England','Spain','Belgium','Argentina','Switzerland'],
    QF:  ['France','Spain','England','Argentina'],
    SF:  ['Spain','Argentina'],
    Final: ['Spain']
  };
  var out = {};
  Object.keys(W).forEach(function(r) { out[r] = {}; W[r].forEach(function(t) { out[r][canonTeam(t)] = true; }); });
  return out;
}

function _finalMacroAnswers() {
  return { runner_up: 'Argentina', third_place: 'England',
           golden_ball: 'Rodri', golden_boot: 'Kylian Mbappe', golden_glove: 'Unai Simon' };
}

var PRIZE_SPLIT = { first: 0.60, second: 0.25, group: 0.15 };

// Compute the whole final picture IN MEMORY (no writes): every user's corrected bracket/macro/group
// points, the ranked board (same tiebreakers as handleGetLeaderboard), the paid-only prize winners,
// the pool/prizes, and a ready-to-use ribbon string. Used by both preview and commit.
function _computeFinalStandings() {
  var winners = finalKnockoutWinners();
  var answers = _finalMacroAnswers();
  var buyIn = Number(getConfig('buy_in')) || 20;

  var users = sheetToObjects('Users');
  var isPaid = function(u) { return u.has_paid === true || u.has_paid === 'TRUE' || u.has_paid === 'true'; };

  // Group points, exact-score count, earliest submit — from raw GroupPredictions.
  var gp = {}, exact = {}, earliest = {};
  sheetToObjects('GroupPredictions').forEach(function(p) {
    var uid = String(p.user_id), pts = Number(p.pts_awarded);
    if (!isNaN(pts) && p.pts_awarded !== '') gp[uid] = (gp[uid] || 0) + pts;
    if (pts === 5) exact[uid] = (exact[uid] || 0) + 1;
    if (p.updated_at) { var t = new Date(p.updated_at).getTime(); if (!isNaN(t) && (earliest[uid] === undefined || t < earliest[uid])) earliest[uid] = t; }
  });

  // Bracket points from picks + the corrected winners (advancement scoring).
  var bp = {};
  sheetToObjects('BracketPredictions').forEach(function(r) {
    if (!r.team_picked) return;
    var uid = String(r.user_id), rd = r.round;
    if (winners[rd] && winners[rd][canonTeam(r.team_picked)]) {
      bp[uid] = (bp[uid] || 0) + (BRACKET_PTS[rd] || 0) + (rd === 'Final' ? CHAMPION_BONUS : 0);
    }
  });

  // Macro points + a per-user log of what matched (for review).
  var mp = {}, macroLog = [];
  var teamF = ['runner_up', 'third_place'], playF = ['golden_ball', 'golden_boot', 'golden_glove'];
  sheetToObjects('MacroPicks').forEach(function(row) {
    var uid = String(row.user_id), total = 0, detail = [];
    teamF.forEach(function(f) { var ok = row[f] && row[f] === answers[f]; if (ok) total += MACRO_PTS[f]; if (row[f]) detail.push(f + '="' + row[f] + '"' + (ok ? ' ✓+' + MACRO_PTS[f] : ' ✗')); });
    playF.forEach(function(f) { var ok = nameMatch(row[f], answers[f]); if (ok) total += MACRO_PTS[f]; if (row[f]) detail.push(f + '="' + row[f] + '"' + (ok ? ' ✓+' + MACRO_PTS[f] : ' ✗')); });
    mp[uid] = total;
    macroLog.push({ uid: uid, detail: detail });
  });

  var board = users.map(function(u) {
    var uid = String(u.id);
    var g = gp[uid] || 0, b = bp[uid] || 0, m = mp[uid] || 0;
    return { id: u.id, name: u.display_name, paid: isPaid(u),
             group: g, bracket: b, macro: m, total: g + b + m,
             exact: exact[uid] || 0, earliest: earliest[uid] === undefined ? Infinity : earliest[uid] };
  });

  // Overall order: total → most exact → group pts → earliest submit → name.
  function cmpOverall(a, b) {
    return (b.total - a.total) || (b.exact - a.exact) || (b.group - a.group)
        || (a.earliest - b.earliest) || String(a.name).localeCompare(String(b.name));
  }
  board.sort(cmpOverall);

  // Prize winners — PAID players only (skip unpaid to the next paid finisher).
  var paidOverall = board.filter(function(r) { return r.paid; });
  var first = paidOverall[0] || null;
  var second = paidOverall[1] || null;
  // Best group stage: highest group pts among paid, tiebreak exact → earliest → name.
  var bestGroup = paidOverall.slice().sort(function(a, b) {
    return (b.group - a.group) || (b.exact - a.exact) || (a.earliest - b.earliest) || String(a.name).localeCompare(String(b.name));
  })[0] || null;

  var paidCount = board.filter(function(r) { return r.paid; }).length;
  var playerCount = board.length;
  var pool = paidCount * buyIn;
  var prize2 = Math.floor(pool * PRIZE_SPLIT.second);
  var prizeG = Math.floor(pool * PRIZE_SPLIT.group);
  var prize1 = pool - prize2 - prizeG; // remainder to 1st so the whole pool is distributed
  var pct = playerCount ? Math.round(paidCount / playerCount * 100) : 0;

  var ribbon = '🏆 That’s a wrap — Spain are World Champions! Final results are in. ' +
    (first ? '🥇 1st: ' + first.name + ' ($' + prize1 + ') · ' : '') +
    (second ? '🥈 2nd: ' + second.name + ' ($' + prize2 + ') · ' : '') +
    (bestGroup ? '📊 Best Group Stage: ' + bestGroup.name + ' ($' + prizeG + '). ' : '') +
    'Pool: $' + pool + ' from ' + paidCount + ' of ' + playerCount + ' players paid (' + pct + '%). ' +
    'Congrats winners — thanks for playing! ⚽';

  return { board: board, pool: pool, prize1: prize1, prize2: prize2, prizeG: prizeG,
           first: first, second: second, bestGroup: bestGroup,
           paidCount: paidCount, playerCount: playerCount, pct: pct, macroLog: macroLog, ribbon: ribbon };
}

// DRY RUN — logs the full final picture and writes NOTHING. Review this before finalizing.
function previewFinalize() {
  var S = _computeFinalStandings();
  Logger.log('===== FINAL STANDINGS PREVIEW (no data written) =====');
  S.board.forEach(function(r, i) {
    Logger.log((i + 1) + '. ' + (r.paid ? '' : '(UNPAID) ') + r.name +
      ' — total ' + r.total + '  [group ' + r.group + ' / bracket ' + r.bracket + ' / macro ' + r.macro + ', exact ' + r.exact + ']');
  });
  Logger.log('----- macro pick matches -----');
  var byId = {}; S.board.forEach(function(r) { byId[String(r.id)] = r.name; });
  S.macroLog.forEach(function(m) { if (m.detail.length) Logger.log('  ' + (byId[m.uid] || m.uid) + ': ' + m.detail.join('  |  ')); });
  Logger.log('----- prizes (paid players only) -----');
  Logger.log('  Pool $' + S.pool + '  (' + S.paidCount + '/' + S.playerCount + ' paid, ' + S.pct + '%)');
  Logger.log('  🥇 1st ($' + S.prize1 + '): ' + (S.first ? S.first.name : '—'));
  Logger.log('  🥈 2nd ($' + S.prize2 + '): ' + (S.second ? S.second.name : '—'));
  Logger.log('  📊 Best Group ($' + S.prizeG + '): ' + (S.bestGroup ? S.bestGroup.name + ' (' + S.bestGroup.group + ' group pts)' : '—'));
  if (S.first && S.bestGroup && S.first.id === S.bestGroup.id) Logger.log('  NOTE: 1st place also has the best group stage (wins both).');
  Logger.log('----- ribbon -----');
  Logger.log('  ' + S.ribbon);
  Logger.log('Run fixNothing? This was a preview only. Run finalizeTournament to commit.');
}

// COMMIT — records the corrected knockout winners, rescoring the bracket, scores macros, rebuilds
// the leaderboard, publishes the ribbon, marks the tournament complete, and stops the auto-fetch
// trigger so nothing overwrites the finalized results. Run previewFinalize first.
function finalizeTournament() {
  var winners = finalKnockoutWinners();
  setConfig('knockout_winners', JSON.stringify(winners));
  scoreBracketByAdvancement(winners);   // bracket + champion bonus, using the corrected winners
  scoreMacroPicks(_finalMacroAnswers()); // scores macros (tolerant matching) + rebuilds leaderboard

  var S = _computeFinalStandings();
  setConfig('final_results', JSON.stringify({
    champion: 'Spain', pool: S.pool, paid_count: S.paidCount, player_count: S.playerCount, pct_paid: S.pct,
    first: S.first && { name: S.first.name, amount: S.prize1 },
    second: S.second && { name: S.second.name, amount: S.prize2 },
    best_group: S.bestGroup && { name: S.bestGroup.name, amount: S.prizeG }
  }));
  setConfig('final_ribbon', S.ribbon);
  setConfig('tournament_status', 'complete');

  // Stop the 15-minute auto-fetch so a late ESPN poll can't revert the finalized scores.
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'autoFetchResults') ScriptApp.deleteTrigger(t);
  });

  rebuildLeaderboard();
  Logger.log('finalizeTournament: done. Champion Spain. Pool $' + S.pool + ' (' + S.paidCount + '/' + S.playerCount + ' paid).');
  Logger.log('  🥇 ' + (S.first && S.first.name) + ' $' + S.prize1 + '  🥈 ' + (S.second && S.second.name) + ' $' + S.prize2 + '  📊 ' + (S.bestGroup && S.bestGroup.name) + ' $' + S.prizeG);
  Logger.log('  Ribbon is live: ' + S.ribbon);
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
