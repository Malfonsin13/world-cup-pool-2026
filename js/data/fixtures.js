// All 72 group stage fixtures — UTC times
// ET (EDT, UTC-4) converted to UTC
window.FIXTURES = [
  // ── GROUP A ──────────────────────────────────────────────
  { id: 1,  group: 'A', round: 1, home: 'Mexico',       away: 'South Africa',      utc: '2026-06-11T19:00:00Z' },
  { id: 2,  group: 'A', round: 1, home: 'South Korea',  away: 'Czechia',           utc: '2026-06-12T02:00:00Z' },
  { id: 3,  group: 'A', round: 2, home: 'Czechia',      away: 'South Africa',      utc: '2026-06-18T16:00:00Z' },
  { id: 4,  group: 'A', round: 2, home: 'Mexico',       away: 'South Korea',       utc: '2026-06-19T01:00:00Z' },
  { id: 5,  group: 'A', round: 3, home: 'Czechia',      away: 'Mexico',            utc: '2026-06-25T01:00:00Z' },
  { id: 6,  group: 'A', round: 3, home: 'South Africa', away: 'South Korea',       utc: '2026-06-25T01:00:00Z' },

  // ── GROUP B ──────────────────────────────────────────────
  { id: 7,  group: 'B', round: 1, home: 'Canada',           away: 'Bosnia-Herzegovina', utc: '2026-06-12T19:00:00Z' },
  { id: 8,  group: 'B', round: 1, home: 'Qatar',            away: 'Switzerland',        utc: '2026-06-13T19:00:00Z' },
  { id: 9,  group: 'B', round: 2, home: 'Switzerland',      away: 'Bosnia-Herzegovina', utc: '2026-06-18T19:00:00Z' },
  { id: 10, group: 'B', round: 2, home: 'Canada',           away: 'Qatar',              utc: '2026-06-18T22:00:00Z' },
  { id: 11, group: 'B', round: 3, home: 'Switzerland',      away: 'Canada',             utc: '2026-06-24T19:00:00Z' },
  { id: 12, group: 'B', round: 3, home: 'Bosnia-Herzegovina', away: 'Qatar',            utc: '2026-06-24T19:00:00Z' },

  // ── GROUP C ──────────────────────────────────────────────
  { id: 13, group: 'C', round: 1, home: 'Brazil',    away: 'Morocco',  utc: '2026-06-13T22:00:00Z' },
  { id: 14, group: 'C', round: 1, home: 'Haiti',     away: 'Scotland', utc: '2026-06-14T01:00:00Z' },
  { id: 15, group: 'C', round: 2, home: 'Scotland',  away: 'Morocco',  utc: '2026-06-19T22:00:00Z' },
  { id: 16, group: 'C', round: 2, home: 'Brazil',    away: 'Haiti',    utc: '2026-06-20T00:30:00Z' },
  { id: 17, group: 'C', round: 3, home: 'Scotland',  away: 'Brazil',   utc: '2026-06-24T22:00:00Z' },
  { id: 18, group: 'C', round: 3, home: 'Morocco',   away: 'Haiti',    utc: '2026-06-24T22:00:00Z' },

  // ── GROUP D ──────────────────────────────────────────────
  { id: 19, group: 'D', round: 1, home: 'USA',       away: 'Paraguay', utc: '2026-06-13T01:00:00Z' },
  { id: 20, group: 'D', round: 1, home: 'Australia', away: 'Türkiye',  utc: '2026-06-14T04:00:00Z' },
  { id: 21, group: 'D', round: 2, home: 'USA',       away: 'Australia',utc: '2026-06-19T19:00:00Z' },
  { id: 22, group: 'D', round: 2, home: 'Türkiye',   away: 'Paraguay', utc: '2026-06-20T03:00:00Z' },
  { id: 23, group: 'D', round: 3, home: 'Türkiye',   away: 'USA',      utc: '2026-06-26T02:00:00Z' },
  { id: 24, group: 'D', round: 3, home: 'Paraguay',  away: 'Australia',utc: '2026-06-26T02:00:00Z' },

  // ── GROUP E ──────────────────────────────────────────────
  { id: 25, group: 'E', round: 1, home: 'Germany',     away: 'Curacao',     utc: '2026-06-14T17:00:00Z' },
  { id: 26, group: 'E', round: 1, home: 'Ivory Coast', away: 'Ecuador',     utc: '2026-06-14T23:00:00Z' },
  { id: 27, group: 'E', round: 2, home: 'Germany',     away: 'Ivory Coast', utc: '2026-06-20T20:00:00Z' },
  { id: 28, group: 'E', round: 2, home: 'Ecuador',     away: 'Curacao',     utc: '2026-06-21T00:00:00Z' },
  { id: 29, group: 'E', round: 3, home: 'Curacao',     away: 'Ivory Coast', utc: '2026-06-25T20:00:00Z' },
  { id: 30, group: 'E', round: 3, home: 'Ecuador',     away: 'Germany',     utc: '2026-06-25T20:00:00Z' },

  // ── GROUP F ──────────────────────────────────────────────
  { id: 31, group: 'F', round: 1, home: 'Netherlands', away: 'Japan',       utc: '2026-06-14T20:00:00Z' },
  { id: 32, group: 'F', round: 1, home: 'Sweden',      away: 'Tunisia',     utc: '2026-06-15T02:00:00Z' },
  { id: 33, group: 'F', round: 2, home: 'Tunisia',     away: 'Japan',       utc: '2026-06-21T04:00:00Z' },
  { id: 34, group: 'F', round: 2, home: 'Netherlands', away: 'Sweden',      utc: '2026-06-20T17:00:00Z' },
  { id: 35, group: 'F', round: 3, home: 'Japan',       away: 'Sweden',      utc: '2026-06-25T23:00:00Z' },
  { id: 36, group: 'F', round: 3, home: 'Tunisia',     away: 'Netherlands', utc: '2026-06-25T23:00:00Z' },

  // ── GROUP G ──────────────────────────────────────────────
  { id: 37, group: 'G', round: 1, home: 'Belgium',     away: 'Egypt',       utc: '2026-06-15T19:00:00Z' },
  { id: 38, group: 'G', round: 1, home: 'Iran',        away: 'New Zealand', utc: '2026-06-16T01:00:00Z' },
  { id: 39, group: 'G', round: 2, home: 'Belgium',     away: 'Iran',        utc: '2026-06-21T19:00:00Z' },
  { id: 40, group: 'G', round: 2, home: 'New Zealand', away: 'Egypt',       utc: '2026-06-22T01:00:00Z' },
  { id: 41, group: 'G', round: 3, home: 'Egypt',       away: 'Iran',        utc: '2026-06-27T03:00:00Z' },
  { id: 42, group: 'G', round: 3, home: 'New Zealand', away: 'Belgium',     utc: '2026-06-27T03:00:00Z' },

  // ── GROUP H ──────────────────────────────────────────────
  { id: 43, group: 'H', round: 1, home: 'Spain',       away: 'Cape Verde',  utc: '2026-06-15T16:00:00Z' },
  { id: 44, group: 'H', round: 1, home: 'Saudi Arabia',away: 'Uruguay',     utc: '2026-06-15T22:00:00Z' },
  { id: 45, group: 'H', round: 2, home: 'Spain',       away: 'Saudi Arabia',utc: '2026-06-21T16:00:00Z' },
  { id: 46, group: 'H', round: 2, home: 'Uruguay',     away: 'Cape Verde',  utc: '2026-06-21T22:00:00Z' },
  { id: 47, group: 'H', round: 3, home: 'Cape Verde',  away: 'Saudi Arabia',utc: '2026-06-27T00:00:00Z' },
  { id: 48, group: 'H', round: 3, home: 'Uruguay',     away: 'Spain',       utc: '2026-06-27T00:00:00Z' },

  // ── GROUP I ──────────────────────────────────────────────
  { id: 49, group: 'I', round: 1, home: 'France',  away: 'Senegal', utc: '2026-06-16T19:00:00Z' },
  { id: 50, group: 'I', round: 1, home: 'Iraq',    away: 'Norway',  utc: '2026-06-16T22:00:00Z' },
  { id: 51, group: 'I', round: 2, home: 'France',  away: 'Iraq',    utc: '2026-06-22T21:00:00Z' },
  { id: 52, group: 'I', round: 2, home: 'Norway',  away: 'Senegal', utc: '2026-06-23T00:00:00Z' },
  { id: 53, group: 'I', round: 3, home: 'Norway',  away: 'France',  utc: '2026-06-26T19:00:00Z' },
  { id: 54, group: 'I', round: 3, home: 'Senegal', away: 'Iraq',    utc: '2026-06-26T19:00:00Z' },

  // ── GROUP J ──────────────────────────────────────────────
  { id: 55, group: 'J', round: 1, home: 'Austria',   away: 'Jordan',   utc: '2026-06-17T04:00:00Z' },
  { id: 56, group: 'J', round: 1, home: 'Argentina', away: 'Algeria',  utc: '2026-06-17T01:00:00Z' },
  { id: 57, group: 'J', round: 2, home: 'Argentina', away: 'Austria',  utc: '2026-06-22T17:00:00Z' },
  { id: 58, group: 'J', round: 2, home: 'Jordan',    away: 'Algeria',  utc: '2026-06-23T03:00:00Z' },
  { id: 59, group: 'J', round: 3, home: 'Jordan',    away: 'Argentina',utc: '2026-06-28T02:00:00Z' },
  { id: 60, group: 'J', round: 3, home: 'Algeria',   away: 'Austria',  utc: '2026-06-28T02:00:00Z' },

  // ── GROUP K ──────────────────────────────────────────────
  { id: 61, group: 'K', round: 1, home: 'Portugal',  away: 'DR Congo',   utc: '2026-06-17T17:00:00Z' },
  { id: 62, group: 'K', round: 1, home: 'Uzbekistan',away: 'Colombia',   utc: '2026-06-18T02:00:00Z' },
  { id: 63, group: 'K', round: 2, home: 'Portugal',  away: 'Uzbekistan', utc: '2026-06-23T17:00:00Z' },
  { id: 64, group: 'K', round: 2, home: 'Colombia',  away: 'DR Congo',   utc: '2026-06-24T02:00:00Z' },
  { id: 65, group: 'K', round: 3, home: 'Colombia',  away: 'Portugal',   utc: '2026-06-27T23:30:00Z' },
  { id: 66, group: 'K', round: 3, home: 'DR Congo',  away: 'Uzbekistan', utc: '2026-06-27T23:30:00Z' },

  // ── GROUP L ──────────────────────────────────────────────
  { id: 67, group: 'L', round: 1, home: 'England', away: 'Croatia', utc: '2026-06-17T20:00:00Z' },
  { id: 68, group: 'L', round: 1, home: 'Ghana',   away: 'Panama',  utc: '2026-06-17T23:00:00Z' },
  { id: 69, group: 'L', round: 2, home: 'England', away: 'Ghana',   utc: '2026-06-23T20:00:00Z' },
  { id: 70, group: 'L', round: 2, home: 'Panama',  away: 'Croatia', utc: '2026-06-23T23:00:00Z' },
  { id: 71, group: 'L', round: 3, home: 'Panama',  away: 'England', utc: '2026-06-27T21:00:00Z' },
  { id: 72, group: 'L', round: 3, home: 'Croatia', away: 'Ghana',   utc: '2026-06-27T21:00:00Z' },
];

// ISO 3166-1 alpha-2 codes for flagcdn.com images
window.TEAM_FLAGS = {
  'Algeria': 'dz', 'Argentina': 'ar', 'Australia': 'au', 'Austria': 'at',
  'Belgium': 'be', 'Bosnia-Herzegovina': 'ba', 'Brazil': 'br', 'Canada': 'ca',
  'Cape Verde': 'cv', 'Colombia': 'co', 'Croatia': 'hr', 'Curacao': 'cw',
  'Czechia': 'cz', 'DR Congo': 'cd', 'Ecuador': 'ec', 'Egypt': 'eg',
  'England': 'gb-eng', 'France': 'fr', 'Germany': 'de', 'Ghana': 'gh',
  'Haiti': 'ht', 'Iran': 'ir', 'Iraq': 'iq', 'Ivory Coast': 'ci',
  'Japan': 'jp', 'Jordan': 'jo', 'Mexico': 'mx', 'Morocco': 'ma',
  'Netherlands': 'nl', 'New Zealand': 'nz', 'Norway': 'no', 'Panama': 'pa',
  'Paraguay': 'py', 'Portugal': 'pt', 'Qatar': 'qa', 'Saudi Arabia': 'sa',
  'Scotland': 'gb-sct', 'Senegal': 'sn', 'South Africa': 'za', 'South Korea': 'kr',
  'Spain': 'es', 'Sweden': 'se', 'Switzerland': 'ch', 'Tunisia': 'tn',
  'Türkiye': 'tr', 'Uruguay': 'uy', 'USA': 'us', 'Uzbekistan': 'uz'
};

// Helper used across all views
window.teamFlag = name => {
  const code = TEAM_FLAGS[name];
  if (!code) return '';
  return `<img src="https://flagcdn.com/w20/${code}.png" alt="${name}" class="flag-img" loading="lazy" decoding="async">`;
};
window.teamWithFlag = (name, flagSide = 'left') =>
  flagSide === 'left'
    ? `${teamFlag(name)}<span class="team-name-text">${name}</span>`
    : `<span class="team-name-text">${name}</span>${teamFlag(name)}`;

// Kickoff time in the viewer's local U.S. zone (EDT/CDT/MDT/PDT), never a "GMT-4" offset.
window.formatKickoff = utc =>
  new Date(utc).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  });

window.ALL_TEAMS = [
  'Algeria','Argentina','Australia','Austria','Belgium','Bosnia-Herzegovina',
  'Brazil','Canada','Cape Verde','Colombia','Croatia','Curacao','Czechia',
  'DR Congo','Ecuador','Egypt','England','France','Germany','Ghana','Haiti',
  'Iran','Iraq','Ivory Coast','Japan','Jordan','Mexico','Morocco',
  'Netherlands','New Zealand','Norway','Panama','Paraguay','Portugal',
  'Qatar','Saudi Arabia','Scotland','Senegal','South Africa','South Korea',
  'Spain','Sweden','Switzerland','Tunisia','Türkiye','Uruguay','USA','Uzbekistan'
];

window.GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L'];
