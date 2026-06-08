// ──────────────────────────────────────────────────────────────────────────────
// World Cup Pool 2026 — Apps Script Backend
// Deploy as Web App: Execute as "Me", Access "Anyone"
// ──────────────────────────────────────────────────────────────────────────────

var SS = SpreadsheetApp.getActiveSpreadsheet();

// ── Helpers ───────────────────────────────────────────────────────────────────

function sheet(name) {
  return SS.getSheetByName(name);
}

function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function hashPassword(pw) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pw);
  return bytes.map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function generateToken() {
  return Utilities.getUuid().replace(/-/g, '');
}

function sheetToObjects(sheetName) {
  var s = sheet(sheetName);
  var data = s.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function findRow(sheetName, colName, value) {
  var s = sheet(sheetName);
  var data = s.getDataRange().getValues();
  if (data.length < 2) return -1;
  var col = data[0].indexOf(colName);
  if (col === -1) return -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][col] == value) return i + 1; // 1-indexed sheet row
  }
  return -1;
}

function getConfig(key) {
  var rows = sheetToObjects('Config');
  var row = rows.find(function(r) { return r.key === key; });
  return row ? row.value : null;
}

function setConfig(key, value) {
  var s = sheet('Config');
  var data = s.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      s.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  s.appendRow([key, value]);
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function verifyToken(token) {
  if (!token) return null;
  var users = sheetToObjects('Users');
  return users.find(function(u) { return u.session_token === token; }) || null;
}

function verifyAdmin(password) {
  if (!password) return false;
  var stored = getConfig('admin_password_hash');
  return stored && hashPassword(password) === stored;
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

function handleRegister(body) {
  var email = (body.email || '').toLowerCase().trim();
  var displayName = (body.display_name || '').trim();
  var password = body.password || '';

  if (!email || !displayName || !password) return { error: 'Missing fields' };
  if (password.length < 6) return { error: 'Password must be at least 6 characters' };

  var s = sheet('Users');
  var existingRow = findRow('Users', 'email', email);
  if (existingRow > 0) return { error: 'Email already registered' };

  var token = generateToken();
  var id = generateToken().slice(0, 16);
  s.appendRow([id, email, displayName, hashPassword(password), token, false, new Date().toISOString()]);
  return { success: true, token: token, user: { id: id, display_name: displayName, email: email } };
}

function handleLogin(body) {
  var email = (body.email || '').toLowerCase().trim();
  var password = body.password || '';

  if (!email || !password) return { error: 'Missing fields' };

  var s = sheet('Users');
  var data = s.getDataRange().getValues();
  var headers = data[0];
  var emailCol = headers.indexOf('email');
  var pwCol = headers.indexOf('password_hash');
  var tokenCol = headers.indexOf('session_token');
  var idCol = headers.indexOf('id');
  var nameCol = headers.indexOf('display_name');

  for (var i = 1; i < data.length; i++) {
    if (data[i][emailCol] === email) {
      if (data[i][pwCol] !== hashPassword(password)) return { error: 'Invalid password' };
      var token = generateToken();
      s.getRange(i + 1, tokenCol + 1).setValue(token);
      return {
        success: true,
        token: token,
        user: { id: data[i][idCol], display_name: data[i][nameCol], email: email }
      };
    }
  }
  return { error: 'Email not found' };
}

function handleGetFixtures() {
  var fixtures = sheetToObjects('Fixtures');
  return { fixtures: fixtures };
}

function handleGetLeaderboard() {
  var lb = sheetToObjects('Leaderboard');
  var config = {
    buy_in: Number(getConfig('buy_in')) || 20,
    prize_split_1st: Number(getConfig('prize_split_1st')) || 0.60,
    prize_split_2nd: Number(getConfig('prize_split_2nd')) || 0.25,
    prize_split_group: Number(getConfig('prize_split_group')) || 0.15,
    tournament_status: getConfig('tournament_status') || 'pre'
  };
  // Count paid users for prize pool
  var users = sheetToObjects('Users');
  var paidCount = users.filter(function(u) { return u.has_paid == true || u.has_paid === 'TRUE'; }).length;
  var pool = paidCount * config.buy_in;

  return {
    leaderboard: lb,
    pool: pool,
    paid_count: paidCount,
    prize_1st: Math.floor(pool * config.prize_split_1st),
    prize_2nd: Math.floor(pool * config.prize_split_2nd),
    prize_group: Math.floor(pool * config.prize_split_group),
    tournament_status: config.tournament_status
  };
}

function handleGetConfig() {
  var adminHash = getConfig('admin_password_hash');
  return {
    buy_in: Number(getConfig('buy_in')) || 20,
    tournament_status: getConfig('tournament_status') || 'pre',
    picks_locked: getConfig('picks_locked') === 'true',
    admin_password_set: !!(adminHash && String(adminHash).trim() !== '')
  };
}

function handleGetUserPicks(userId) {
  var groupPicks = sheetToObjects('GroupPredictions').filter(function(r) { return r.user_id === userId; });
  var bracketPicks = sheetToObjects('BracketPredictions').filter(function(r) { return r.user_id === userId; });
  var macroPicks = sheetToObjects('MacroPicks').filter(function(r) { return r.user_id === userId; });
  return {
    group_picks: groupPicks,
    bracket_picks: bracketPicks,
    macro_picks: macroPicks.length ? macroPicks[0] : null
  };
}

function handleSubmitGroupPicks(userId, picks) {
  if (getConfig('picks_locked') === 'true') return { error: 'Picks are locked' };
  if (!picks || !Array.isArray(picks)) return { error: 'Invalid picks format' };

  var s = sheet('GroupPredictions');
  var data = s.getDataRange().getValues();
  var headers = data[0];
  var userCol = headers.indexOf('user_id');
  var fixCol = headers.indexOf('fixture_id');

  picks.forEach(function(pick) {
    var fixtureId = pick.fixture_id;
    var homePred = parseInt(pick.home_pred, 10);
    var awayPred = parseInt(pick.away_pred, 10);
    if (isNaN(homePred) || isNaN(awayPred) || homePred < 0 || awayPred < 0) return;

    // Find existing row for this user+fixture
    var existingRow = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][userCol] == userId && data[i][fixCol] == fixtureId) {
        existingRow = i + 1;
        break;
      }
    }

    var now = new Date().toISOString();
    if (existingRow > 0) {
      s.getRange(existingRow, headers.indexOf('home_pred') + 1).setValue(homePred);
      s.getRange(existingRow, headers.indexOf('away_pred') + 1).setValue(awayPred);
      s.getRange(existingRow, headers.indexOf('updated_at') + 1).setValue(now);
    } else {
      s.appendRow([userId, fixtureId, homePred, awayPred, '', now]);
    }
  });

  // Refresh data after writes
  data = s.getDataRange().getValues();
  return { success: true, saved: picks.length };
}

function handleSubmitBracketPick(userId, round, matchIndex, teamPicked) {
  if (!round || !matchIndex || !teamPicked) return { error: 'Missing fields' };

  var s = sheet('BracketPredictions');
  var data = s.getDataRange().getValues();
  var headers = data[0];
  var userCol = headers.indexOf('user_id');
  var roundCol = headers.indexOf('round');
  var idxCol = headers.indexOf('match_index');

  var existingRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][userCol] == userId && data[i][roundCol] == round && data[i][idxCol] == matchIndex) {
      existingRow = i + 1;
      break;
    }
  }

  var now = new Date().toISOString();
  if (existingRow > 0) {
    s.getRange(existingRow, headers.indexOf('team_picked') + 1).setValue(teamPicked);
    s.getRange(existingRow, headers.indexOf('updated_at') + 1).setValue(now);
  } else {
    s.appendRow([userId, round, matchIndex, teamPicked, '', 0, now]);
  }
  return { success: true };
}

function handleSubmitMacroPicks(userId, picks) {
  if (getConfig('picks_locked') === 'true') return { error: 'Picks are locked' };
  if (!picks) return { error: 'Missing macro picks' };

  var required = ['runner_up', 'third_place', 'golden_ball', 'golden_boot', 'golden_glove'];
  for (var k = 0; k < required.length; k++) {
    if (!picks[required[k]] || String(picks[required[k]]).trim() === '') {
      return { error: 'Please fill in all five macro picks' };
    }
  }

  var s = sheet('MacroPicks');
  var headers = s.getDataRange().getValues()[0];
  var vals = {
    user_id:        userId,
    runner_up:      picks.runner_up,
    third_place:    picks.third_place,
    golden_ball:    picks.golden_ball,
    golden_boot:    picks.golden_boot,
    golden_glove:   picks.golden_glove,
    runner_up_pts: '', third_place_pts: '', golden_ball_pts: '',
    golden_boot_pts: '', golden_glove_pts: ''
  };

  var existingRow = findRow('MacroPicks', 'user_id', userId);
  if (existingRow > 0) {
    headers.forEach(function(h, i) {
      if (vals[h] !== undefined) s.getRange(existingRow, i + 1).setValue(vals[h]);
    });
  } else {
    s.appendRow(headers.map(function(h) { return vals[h] !== undefined ? vals[h] : ''; }));
  }
  return { success: true };
}

function handleOverrideResult(fixtureId, homeScore, awayScore, adminPw) {
  if (!verifyAdmin(adminPw)) return { error: 'Unauthorized' };
  return updateFixtureResult(fixtureId, homeScore, awayScore);
}

function handleUpsertKnockout(body) {
  if (!verifyAdmin(body.admin_password)) return { error: 'Unauthorized' };
  return upsertKnockoutFixture(body.round, body.match_index, body.home, body.away, body.home_score, body.away_score);
}

function handleEnterMacroAnswers(body) {
  if (!verifyAdmin(body.admin_password)) return { error: 'Unauthorized' };
  return scoreMacroPicks(body.answers || {});
}

function handleSetPaid(userId, paid, adminPw) {
  if (!verifyAdmin(adminPw)) return { error: 'Unauthorized' };
  var s = sheet('Users');
  var row = findRow('Users', 'id', userId);
  if (row < 0) return { error: 'User not found' };
  var headers = s.getDataRange().getValues()[0];
  s.getRange(row, headers.indexOf('has_paid') + 1).setValue(paid ? true : false);
  return { success: true };
}

function handleSetPhase(phase, adminPw) {
  if (!verifyAdmin(adminPw)) return { error: 'Unauthorized' };
  var valid = ['pre', 'group', 'knockout', 'done'];
  if (!valid.includes(phase)) return { error: 'Invalid phase' };
  setConfig('tournament_status', phase);
  if (phase === 'group') setConfig('picks_locked', 'true');
  return { success: true, phase: phase };
}

function handleAdminGetUsers(adminPw) {
  if (!verifyAdmin(adminPw)) return { error: 'Unauthorized' };
  var users = sheetToObjects('Users').map(function(u) {
    return { id: u.id, email: u.email, display_name: u.display_name, has_paid: u.has_paid, joined_at: u.joined_at };
  });
  return { users: users };
}

function handleSetAdminPassword(newPassword, oldPasswordOrSetup) {
  var storedHash = getConfig('admin_password_hash');
  if (storedHash && storedHash !== '' && !verifyAdmin(oldPasswordOrSetup)) {
    return { error: 'Unauthorized' };
  }
  setConfig('admin_password_hash', hashPassword(newPassword));
  return { success: true };
}

function handleTriggerFetch(adminPw) {
  if (!verifyAdmin(adminPw)) return { error: 'Unauthorized' };
  autoFetchResults();
  return { success: true, message: 'Fetch triggered' };
}

// ── Router ────────────────────────────────────────────────────────────────────

function doGet(e) {
  var p = e.parameter;
  try {
    switch (p.action) {
      case 'getFixtures':    return jsonOut(handleGetFixtures());
      case 'getLeaderboard': return jsonOut(handleGetLeaderboard());
      case 'getConfig':      return jsonOut(handleGetConfig());
      case 'getUserPicks': {
        var user = verifyToken(p.token);
        if (!user) return jsonOut({ error: 'Unauthorized' });
        return jsonOut(handleGetUserPicks(user.id));
      }
      default:               return jsonOut({ error: 'Unknown action' });
    }
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ error: 'Invalid JSON body' });
  }
  try {
    switch (body.action) {
      case 'register':          return jsonOut(handleRegister(body));
      case 'login':             return jsonOut(handleLogin(body));
      case 'submitGroupPicks': {
        var u = verifyToken(body.token);
        if (!u) return jsonOut({ error: 'Unauthorized' });
        return jsonOut(handleSubmitGroupPicks(u.id, body.picks));
      }
      case 'submitBracketPick': {
        var u2 = verifyToken(body.token);
        if (!u2) return jsonOut({ error: 'Unauthorized' });
        return jsonOut(handleSubmitBracketPick(u2.id, body.round, body.match_index, body.team_picked));
      }
      case 'submitMacroPicks': {
        var u3 = verifyToken(body.token);
        if (!u3) return jsonOut({ error: 'Unauthorized' });
        return jsonOut(handleSubmitMacroPicks(u3.id, body.picks));
      }
      case 'overrideResult':    return jsonOut(handleOverrideResult(body.fixture_id, body.home_score, body.away_score, body.admin_password));
      case 'upsertKnockout':    return jsonOut(handleUpsertKnockout(body));
      case 'enterMacroAnswers': return jsonOut(handleEnterMacroAnswers(body));
      case 'setPaid':           return jsonOut(handleSetPaid(body.user_id, body.paid, body.admin_password));
      case 'setPhase':          return jsonOut(handleSetPhase(body.phase, body.admin_password));
      case 'adminGetUsers':     return jsonOut(handleAdminGetUsers(body.admin_password));
      case 'setAdminPassword':  return jsonOut(handleSetAdminPassword(body.new_password, body.old_password));
      case 'triggerFetch':      return jsonOut(handleTriggerFetch(body.admin_password));
      default:                  return jsonOut({ error: 'Unknown action' });
    }
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}
