// Release-year logic: parsing a Top 2000 list with years, matching it to Spotify
// tracks and deciding the final year plus a verification status. Pure functions.

const YEAR_RE = /^(19[0-9]{2}|20[0-4][0-9])$/;
const NOISE_CELL = /^([+-]?\d{1,4}|nw|nieuw|new|re|ree|-|–|▲|▼|=|▶|►|\s*)$/i;
const REISSUE_RE = /\b(remaster(ed)?|re-?issue|best of|greatest hits|the hits|hits collection|collection|anniversary|deluxe|anthology|essential|essentials|gold|platinum|ultimate|compilation|the very best|singles)\b/i;

// Removes Spotify version noise for display: "Song - Remastered 2011" -> "Song".
export function cleanTitle(title = '') {
  return title
    .replace(/\s+-\s+(\d{4}\s+)?(digital(ly)?\s+)?remaster(ed)?.*$/i, '')
    .replace(/\s+-\s+(single|radio|album|mono|stereo|original)( version| edit| mix)?.*$/i, '')
    .replace(/\s*[([](\d{4}\s+)?(digital(ly)?\s+)?remaster(ed)?[^)\]]*[)\]]/i, '')
    .trim() || title;
}

export function norm(s = '') {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+-\s+.*$/, '')            // "Song - Remastered 2011"
    .replace(/\(.*?\)|\[.*?\]/g, ' ')      // "(Album Version)", "[Live]"
    .replace(/\b(feat\.?|ft\.?|featuring)(\s|$).*$/, ' ')
    .replace(/&/g, ' and ')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}

function splitCells(line) {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes(';')) return line.split(';');
  if (line.includes('|')) return line.split('|');
  return [line];
}

function cleanCell(c) {
  return c.trim().replace(/^"(.*)"$/, '$1').trim();
}

// Accepts:
// 1. CSV/TSV with a header row containing title/titel, artist/artiest and year/jaar
// 2. Pasted tables from chart sites (tab separated, year in the last cell),
//    including layouts where artist and title are on separate lines.
export function parseYearList(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = splitCells(lines[0]).map(c => cleanCell(c).toLowerCase());
  const ti = header.findIndex(h => /^(title|titel|nummer|song)$/.test(h));
  const ai = header.findIndex(h => /^(artist|artiest|artiest\(en\)|uitvoerende|performer)$/.test(h));
  const yi = header.findIndex(h => /^(year|jaar|jaartal|jr)$/.test(h));
  if (ti >= 0 && ai >= 0 && yi >= 0) {
    return lines.slice(1).map(l => {
      const c = splitCells(l).map(cleanCell);
      return { artist: c[ai], title: c[ti], year: parseInt(c[yi], 10) };
    }).filter(e => e.artist && e.title && YEAR_RE.test(String(e.year)));
  }

  const entries = [];
  let buffer = [];
  for (const line of lines) {
    const cells = splitCells(line).map(cleanCell).filter(c => c !== '');
    if (!cells.length) continue;
    const last = cells[cells.length - 1];
    const hasYear = YEAR_RE.test(last);
    const body = hasYear ? cells.slice(0, -1) : cells;
    const texts = body.filter(c => !NOISE_CELL.test(c));
    if (hasYear) {
      const all = [...buffer, ...texts];
      if (all.length >= 2) {
        const [a, b] = all.slice(-2);
        entries.push({ a, b, year: parseInt(last, 10) });
      }
      buffer = [];
    } else {
      buffer = [...buffer, ...texts].slice(-3);
    }
  }
  return entries;
}

const ARTIST_SPLIT = /\s*(?:,|&|\+|\/|\bft\.?(?=\s)|\bfeat\.?(?=\s)|\bfeaturing\b|\bvs\.?(?=\s)|\ben\b|\band\b|\bwith\b|\bmet\b|\bx\b)\s*/i;

function artistParts(text) {
  return text.split(ARTIST_SPLIT).map(norm).filter(Boolean);
}

// 0..2: how well the artist sets overlap (2 = identical sets).
function artistScore(trackArtists, entryParts, entryJoined, trackJoined) {
  const inEntry = a => entryParts.some(p => p === a);
  const inTrack = p => trackArtists.some(a => a === p);
  const coverT = trackArtists.filter(inEntry).length / trackArtists.length;
  const coverE = entryParts.filter(inTrack).length / entryParts.length;
  let score = coverT + coverE;
  if (entryJoined && entryJoined === trackJoined) score = Math.max(score, 2);
  if (!score && entryJoined && trackJoined &&
      (trackJoined.includes(entryJoined) || entryJoined.includes(trackJoined))) score = 0.5;
  return score;
}

// Matches the official list to Spotify tracks. Each track gets its best-scoring
// entry (exact title beats fuzzy title, identical artists beat partial overlap).
// Returns { matches: Map(spotifyId -> {year, pos}), matched, unmatched: [entry] }.
export function matchList(entries, tracks) {
  const prepared = entries.map(e => {
    const title = e.title ?? e.b;
    const artist = e.artist ?? e.a;
    return { e, title: norm(title), parts: artistParts(artist || ''), joined: norm(artist || ''),
      alt: e.title ? null : { title: norm(e.a), parts: artistParts(e.b || ''), joined: norm(e.b || '') } };
  });
  const byTitle = new Map();
  const addIdx = (key, ref) => { if (!key) return; if (!byTitle.has(key)) byTitle.set(key, []); byTitle.get(key).push(ref); };
  prepared.forEach(p => { addIdx(p.title, { p, v: p }); if (p.alt) addIdx(p.alt.title, { p, v: p.alt }); });

  const matches = new Map();
  const used = new Set();
  for (const t of tracks) {
    const tTitle = norm(t.title);
    const tArtists = (t.artists?.length ? t.artists : artistParts(t.artist || '')).map(norm).filter(Boolean);
    const tJoined = norm(t.artist || '');
    if (!tArtists.length) continue;
    let best = null;
    const consider = (p, v, titleBonus) => {
      const a = artistScore(tArtists, v.parts.length ? v.parts : [v.joined], v.joined, tJoined);
      if (a <= 0) return;
      const score = a + titleBonus;
      if (!best || score > best.score || (score === best.score && (p.e.pos ?? 1e9) < (best.p.e.pos ?? 1e9))) best = { p, score };
    };
    for (const { p, v } of byTitle.get(tTitle) || []) consider(p, v, 2);
    if (!best && tTitle.length >= 4) {
      for (const p of prepared) {
        for (const v of p.alt ? [p, p.alt] : [p]) {
          if (v.title.length >= 4 && (tTitle.startsWith(v.title) || v.title.startsWith(tTitle))) consider(p, v, 0);
        }
      }
    }
    if (best) { matches.set(t.spotifyId, { year: best.p.e.year, pos: best.p.e.pos ?? null, title: best.p.e.title ?? null, artist: best.p.e.artist ?? null }); used.add(best.p); }
  }
  const unmatched = prepared.filter(p => !used.has(p)).map(p => p.e);
  return { matches, matched: matches.size, unmatched };
}

// meta: { listYear, manualYear, manualVerified, notes }
// The official NPO Top 2000 list is treated as the authoritative source.
export function resolveYear(track, meta = {}) {
  const { listYear, manualYear, manualVerified } = meta;
  const sp = track.spotifyYear || null;
  const flags = [];
  let year = null, source = null, status = 'needs-check';
  if (manualYear) {
    year = manualYear; source = 'handmatig';
    status = manualVerified ? 'verified' : 'auto';
  } else if (listYear) {
    year = listYear; source = 'top2000-lijst'; status = 'verified';
  } else if (sp) {
    year = sp; source = 'spotify';
    status = 'needs-check';
  } else {
    flags.push('geen jaar');
  }
  if (!listYear && !manualYear) {
    flags.push('niet gevonden in Top 2000-lijst');
    if (track.albumType === 'compilation') flags.push('verzamelalbum');
    if (REISSUE_RE.test(track.album || '') || REISSUE_RE.test(track.title || '')) flags.push('heruitgave');
  }
  return { year, source, status, flags };
}
