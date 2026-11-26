// Song metadata: combines Spotify tracks with the official Top 2000 list,
// exported corrections (data/songs.json) and local corrections from the beheer page.
import { TOP2000_LIST_FILE, SONGS_FILE } from './config.js';
import { matchList, resolveYear, cleanTitle, songKey } from './years.js';
import { load, save } from './storage.js';

async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function loadSources() {
  const [list, songs] = await Promise.all([fetchJson(TOP2000_LIST_FILE), fetchJson(SONGS_FILE)]);
  return { list: list?.entries || [], edition: list?.edition || null, songs: songs?.songs || [] };
}

export const getLocalMeta = playlistId => load(`meta.${playlistId}`, {});
export const setLocalMeta = (playlistId, meta) => save(`meta.${playlistId}`, meta);

// Returns { catalog: Map(spotifyId -> song), stats, unmatched }.
export function buildCatalog(tracks, sources, localMeta = {}) {
  const { matches, unmatched } = matchList(sources.list, tracks);
  const exported = new Map(sources.songs.map(s => [s.spotifyId, s]));
  // Manual corrections also apply to other versions of the same song (title + artist).
  const byKey = new Map();
  for (const s of sources.songs) if (s.manualYear) byKey.set(songKey(s.title, s.artist), s);
  for (const m of Object.values(localMeta)) if (m.manualYear && m.title) byKey.set(songKey(m.title, m.artist || ''), m);
  const catalog = new Map();
  const stats = { total: tracks.length, verified: 0, auto: 0, 'needs-check': 0, inList: 0, suspect: 0 };
  for (const t of tracks) {
    const ex = exported.get(t.spotifyId) || byKey.get(songKey(t.title, t.artist)) || {};
    const local = localMeta[t.spotifyId] || {};
    const listMatch = matches.get(t.spotifyId);
    const meta = {
      listYear: listMatch?.year || null,
      manualYear: local.manualYear ?? ex.manualYear ?? null,
      mbYear: local.mbYear ?? ex.mbYear ?? null,
      manualVerified: local.manualVerified ?? ex.manualVerified ?? false,
      notes: local.notes ?? ex.notes ?? ''
    };
    const r = resolveYear(t, meta);
    if (listMatch) stats.inList += 1;
    stats[r.status] += 1;
    if (r.suspect) stats.suspect += 1;
    catalog.set(t.spotifyId, {
      ...t, ...meta, ...r,
      displayTitle: listMatch?.title || cleanTitle(t.title),
      displayArtist: listMatch?.artist || t.artist,
      top2000Position: listMatch?.pos ?? null
    });
  }
  return { catalog, stats, unmatched };
}

export function toExport(catalog, playlist) {
  const songs = [...catalog.values()].map(s => ({
    spotifyId: s.spotifyId,
    title: s.title,
    artist: s.artist,
    year: s.year,
    album: s.album,
    artwork: s.artwork,
    verified: s.status === 'verified',
    status: s.status,
    source: s.source,
    top2000Position: s.top2000Position,
    spotifyYear: s.spotifyYear,
    ...(s.manualYear ? { manualYear: s.manualYear, manualVerified: s.manualVerified } : {}),
    ...(s.mbYear ? { mbYear: s.mbYear } : {}),
    ...(s.notes ? { notes: s.notes } : {})
  }));
  return { version: 1, updated: new Date().toISOString(), playlist: playlist ? { id: playlist.id, name: playlist.name } : null, songs };
}

export function toCsv(catalog) {
  const cols = ['spotifyId', 'title', 'artist', 'year', 'status', 'source', 'top2000Position', 'spotifyYear', 'album', 'flags', 'notes'];
  const esc = v => {
    const s = Array.isArray(v) ? v.join(' / ') : (v ?? '').toString();
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [...catalog.values()].map(s => cols.map(c => esc(s[c])).join(';'));
  return [cols.join(';'), ...rows].join('\n');
}
