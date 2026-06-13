// ──────────────────────────────────────────────────────────────────────────────
// One-time setup — run initialSetup() once after creating the spreadsheet.
// ──────────────────────────────────────────────────────────────────────────────

function initialSetup() {
  createSheets();
  populateConfig();
  populateFixtures();
  setupTrigger();
  Logger.log('Setup complete. Open the site and set your admin password via the admin panel.');
}

function createSheets() {
  var required = ['Config','Users','Fixtures','GroupPredictions','BracketPredictions','MacroPicks','Leaderboard'];
  var existing = SS.getSheets().map(function(s) { return s.getName(); });

  required.forEach(function(name) {
    if (!existing.includes(name)) {
      SS.insertSheet(name);
    }
  });

  // Set headers
  var headers = {
    Config: [['key','value']],
    Users:  [['id','email','display_name','password_hash','session_token','has_paid','joined_at']],
    Fixtures: [['id','api_id','phase','group','round','match_index','home','away','utc_date','home_score','away_score','status']],
    GroupPredictions: [['user_id','fixture_id','home_pred','away_pred','pts_awarded','updated_at']],
    BracketPredictions: [['user_id','round','match_index','team_picked','is_correct','pts_awarded','updated_at']],
    MacroPicks: [['user_id','runner_up','third_place','golden_ball','golden_boot','golden_glove','runner_up_pts','third_place_pts','golden_ball_pts','golden_boot_pts','golden_glove_pts']],
    Leaderboard: [['user_id','display_name','group_pts','bracket_pts','macro_pts','total','rank']]
  };

  Object.keys(headers).forEach(function(name) {
    var s = SS.getSheetByName(name);
    if (s.getLastRow() === 0) {
      s.getRange(1, 1, 1, headers[name][0].length).setValues(headers[name]);
    }
  });

  // Delete the default "Sheet1" if present
  var defaultSheet = SS.getSheetByName('Sheet1');
  if (defaultSheet && SS.getSheets().length > required.length) {
    SS.deleteSheet(defaultSheet);
  }

  Logger.log('Sheets created');
}

function populateConfig() {
  var defaults = [
    ['buy_in', '20'],
    ['prize_split_1st', '0.60'],
    ['prize_split_2nd', '0.25'],
    ['prize_split_group', '0.15'],
    ['tournament_status', 'pre'],
    ['picks_locked', 'false'],
    ['bracket_lock', '2026-06-28T16:00:00Z'],
    ['admin_password_hash', '']
  ];

  var s = SS.getSheetByName('Config');
  if (s.getLastRow() <= 1) {
    defaults.forEach(function(row) { s.appendRow(row); });
  }
  Logger.log('Config populated');
}

function populateFixtures() {
  var s = SS.getSheetByName('Fixtures');
  if (s.getLastRow() > 1) {
    Logger.log('Fixtures already populated, skipping');
    return;
  }

  // id, api_id, phase, group, round, home, away, utc_date, home_score, away_score, status
  var fixtures = [
    [1, '',  'group','A',1,'Mexico','South Africa','2026-06-11T19:00:00Z','','','pending'],
    [2, '',  'group','A',1,'South Korea','Czechia','2026-06-12T02:00:00Z','','','pending'],
    [3, '',  'group','A',2,'Czechia','South Africa','2026-06-18T16:00:00Z','','','pending'],
    [4, '',  'group','A',2,'Mexico','South Korea','2026-06-19T01:00:00Z','','','pending'],
    [5, '',  'group','A',3,'Czechia','Mexico','2026-06-25T01:00:00Z','','','pending'],
    [6, '',  'group','A',3,'South Africa','South Korea','2026-06-25T01:00:00Z','','','pending'],
    [7, '',  'group','B',1,'Canada','Bosnia-Herzegovina','2026-06-12T19:00:00Z','','','pending'],
    [8, '',  'group','B',1,'Qatar','Switzerland','2026-06-13T19:00:00Z','','','pending'],
    [9, '',  'group','B',2,'Switzerland','Bosnia-Herzegovina','2026-06-18T19:00:00Z','','','pending'],
    [10,'',  'group','B',2,'Canada','Qatar','2026-06-18T22:00:00Z','','','pending'],
    [11,'',  'group','B',3,'Switzerland','Canada','2026-06-24T19:00:00Z','','','pending'],
    [12,'',  'group','B',3,'Bosnia-Herzegovina','Qatar','2026-06-24T19:00:00Z','','','pending'],
    [13,'',  'group','C',1,'Brazil','Morocco','2026-06-13T22:00:00Z','','','pending'],
    [14,'',  'group','C',1,'Haiti','Scotland','2026-06-14T01:00:00Z','','','pending'],
    [15,'',  'group','C',2,'Scotland','Morocco','2026-06-19T22:00:00Z','','','pending'],
    [16,'',  'group','C',2,'Brazil','Haiti','2026-06-20T00:30:00Z','','','pending'],
    [17,'',  'group','C',3,'Scotland','Brazil','2026-06-24T22:00:00Z','','','pending'],
    [18,'',  'group','C',3,'Morocco','Haiti','2026-06-24T22:00:00Z','','','pending'],
    [19,'',  'group','D',1,'USA','Paraguay','2026-06-13T01:00:00Z','','','pending'],
    [20,'',  'group','D',1,'Australia','Türkiye','2026-06-14T04:00:00Z','','','pending'],
    [21,'',  'group','D',2,'USA','Australia','2026-06-19T19:00:00Z','','','pending'],
    [22,'',  'group','D',2,'Türkiye','Paraguay','2026-06-20T03:00:00Z','','','pending'],
    [23,'',  'group','D',3,'Türkiye','USA','2026-06-26T02:00:00Z','','','pending'],
    [24,'',  'group','D',3,'Paraguay','Australia','2026-06-26T02:00:00Z','','','pending'],
    [25,'',  'group','E',1,'Germany','Curacao','2026-06-14T17:00:00Z','','','pending'],
    [26,'',  'group','E',1,'Ivory Coast','Ecuador','2026-06-14T23:00:00Z','','','pending'],
    [27,'',  'group','E',2,'Germany','Ivory Coast','2026-06-20T20:00:00Z','','','pending'],
    [28,'',  'group','E',2,'Ecuador','Curacao','2026-06-21T00:00:00Z','','','pending'],
    [29,'',  'group','E',3,'Curacao','Ivory Coast','2026-06-25T20:00:00Z','','','pending'],
    [30,'',  'group','E',3,'Ecuador','Germany','2026-06-25T20:00:00Z','','','pending'],
    [31,'',  'group','F',1,'Netherlands','Japan','2026-06-14T20:00:00Z','','','pending'],
    [32,'',  'group','F',1,'Sweden','Tunisia','2026-06-15T02:00:00Z','','','pending'],
    [33,'',  'group','F',2,'Tunisia','Japan','2026-06-21T04:00:00Z','','','pending'],
    [34,'',  'group','F',2,'Netherlands','Sweden','2026-06-20T17:00:00Z','','','pending'],
    [35,'',  'group','F',3,'Japan','Sweden','2026-06-25T23:00:00Z','','','pending'],
    [36,'',  'group','F',3,'Tunisia','Netherlands','2026-06-25T23:00:00Z','','','pending'],
    [37,'',  'group','G',1,'Belgium','Egypt','2026-06-15T19:00:00Z','','','pending'],
    [38,'',  'group','G',1,'Iran','New Zealand','2026-06-16T01:00:00Z','','','pending'],
    [39,'',  'group','G',2,'Belgium','Iran','2026-06-21T19:00:00Z','','','pending'],
    [40,'',  'group','G',2,'New Zealand','Egypt','2026-06-22T01:00:00Z','','','pending'],
    [41,'',  'group','G',3,'Egypt','Iran','2026-06-27T03:00:00Z','','','pending'],
    [42,'',  'group','G',3,'New Zealand','Belgium','2026-06-27T03:00:00Z','','','pending'],
    [43,'',  'group','H',1,'Spain','Cape Verde','2026-06-15T16:00:00Z','','','pending'],
    [44,'',  'group','H',1,'Saudi Arabia','Uruguay','2026-06-15T22:00:00Z','','','pending'],
    [45,'',  'group','H',2,'Spain','Saudi Arabia','2026-06-21T16:00:00Z','','','pending'],
    [46,'',  'group','H',2,'Uruguay','Cape Verde','2026-06-21T22:00:00Z','','','pending'],
    [47,'',  'group','H',3,'Cape Verde','Saudi Arabia','2026-06-27T00:00:00Z','','','pending'],
    [48,'',  'group','H',3,'Uruguay','Spain','2026-06-27T00:00:00Z','','','pending'],
    [49,'',  'group','I',1,'France','Senegal','2026-06-16T19:00:00Z','','','pending'],
    [50,'',  'group','I',1,'Iraq','Norway','2026-06-16T22:00:00Z','','','pending'],
    [51,'',  'group','I',2,'France','Iraq','2026-06-22T21:00:00Z','','','pending'],
    [52,'',  'group','I',2,'Norway','Senegal','2026-06-23T00:00:00Z','','','pending'],
    [53,'',  'group','I',3,'Norway','France','2026-06-26T19:00:00Z','','','pending'],
    [54,'',  'group','I',3,'Senegal','Iraq','2026-06-26T19:00:00Z','','','pending'],
    [55,'',  'group','J',1,'Austria','Jordan','2026-06-17T04:00:00Z','','','pending'],
    [56,'',  'group','J',1,'Argentina','Algeria','2026-06-17T01:00:00Z','','','pending'],
    [57,'',  'group','J',2,'Argentina','Austria','2026-06-22T17:00:00Z','','','pending'],
    [58,'',  'group','J',2,'Jordan','Algeria','2026-06-23T03:00:00Z','','','pending'],
    [59,'',  'group','J',3,'Jordan','Argentina','2026-06-28T02:00:00Z','','','pending'],
    [60,'',  'group','J',3,'Algeria','Austria','2026-06-28T02:00:00Z','','','pending'],
    [61,'',  'group','K',1,'Portugal','DR Congo','2026-06-17T17:00:00Z','','','pending'],
    [62,'',  'group','K',1,'Uzbekistan','Colombia','2026-06-18T02:00:00Z','','','pending'],
    [63,'',  'group','K',2,'Portugal','Uzbekistan','2026-06-23T17:00:00Z','','','pending'],
    [64,'',  'group','K',2,'Colombia','DR Congo','2026-06-24T02:00:00Z','','','pending'],
    [65,'',  'group','K',3,'Colombia','Portugal','2026-06-27T23:30:00Z','','','pending'],
    [66,'',  'group','K',3,'DR Congo','Uzbekistan','2026-06-27T23:30:00Z','','','pending'],
    [67,'',  'group','L',1,'England','Croatia','2026-06-17T20:00:00Z','','','pending'],
    [68,'',  'group','L',1,'Ghana','Panama','2026-06-17T23:00:00Z','','','pending'],
    [69,'',  'group','L',2,'England','Ghana','2026-06-23T20:00:00Z','','','pending'],
    [70,'',  'group','L',2,'Panama','Croatia','2026-06-23T23:00:00Z','','','pending'],
    [71,'',  'group','L',3,'Panama','England','2026-06-27T21:00:00Z','','','pending'],
    [72,'',  'group','L',3,'Croatia','Ghana','2026-06-27T21:00:00Z','','','pending'],
  ];

  // Rows above are [id,api_id,phase,group,round,home,away,utc,hs,as,status].
  // Insert an empty match_index after 'round' (index 5) to match the schema.
  fixtures.forEach(function(row) {
    var r = row.slice();
    r.splice(5, 0, '');
    s.appendRow(r);
  });
  Logger.log('72 group stage fixtures populated');
}

// ── Migration: run ONCE to upgrade an already-initialised spreadsheet ──────────
// Safe to run if you set the sheet up with the older schema. It:
//  1. Adds the 'match_index' column to Fixtures (for knockout bracket alignment)
//  2. Rebuilds MacroPicks with the new schema (runner-up, 3rd place, golden awards)
// No real macro picks exist yet at launch, so wiping MacroPicks data is safe.

function migrateV2() {
  // 1. Fixtures — add match_index after 'round'
  var fx = SS.getSheetByName('Fixtures');
  var fh = fx.getRange(1, 1, 1, fx.getLastColumn()).getValues()[0];
  if (fh.indexOf('match_index') === -1) {
    var roundIdx = fh.indexOf('round'); // 0-based
    fx.insertColumnAfter(roundIdx + 1);
    fx.getRange(1, roundIdx + 2).setValue('match_index');
    Logger.log('Added match_index column to Fixtures');
  } else {
    Logger.log('Fixtures already has match_index');
  }

  // 2. MacroPicks — rebuild with new schema
  var mp = SS.getSheetByName('MacroPicks');
  mp.clear();
  mp.getRange(1, 1, 1, 11).setValues([[
    'user_id','runner_up','third_place','golden_ball','golden_boot','golden_glove',
    'runner_up_pts','third_place_pts','golden_ball_pts','golden_boot_pts','golden_glove_pts'
  ]]);
  Logger.log('MacroPicks rebuilt with new schema');

  Logger.log('Migration V2 complete.');
}

// ── One-off: correct kickoff times on an existing sheet ────────────────────────
// Three 04:00 UTC games were placed one calendar day too early (so they locked
// prematurely). Run this ONCE from the editor to fix them in the live Fixtures sheet.
// Verified against ESPN's official schedule.
function fixKickoffTimes() {
  var corrections = {
    '20': '2026-06-14T04:00:00Z',  // Australia v Türkiye
    '33': '2026-06-21T04:00:00Z',  // Tunisia v Japan
    '55': '2026-06-17T04:00:00Z'   // Austria v Jordan
  };
  var s = SS.getSheetByName('Fixtures');
  var data = s.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('id');
  var utcCol = headers.indexOf('utc_date');
  var fixed = 0;
  for (var i = 1; i < data.length; i++) {
    var corr = corrections[String(data[i][idCol])];
    if (corr) { s.getRange(i + 1, utcCol + 1).setValue(corr); fixed++; }
  }
  Logger.log('Corrected ' + fixed + ' kickoff times.');
}
