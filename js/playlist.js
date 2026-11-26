// Playlist selection and track import, with a local cache keyed by snapshot_id.
import { getMe, getMyPlaylists, getPlaylistInfo, getPlaylistItems } from './spotify-api.js';
import { load, save } from './storage.js';

export function playlistTotal(p) {
  return p.items?.total ?? p.tracks?.total ?? 0;
}

// Only playlists the user owns or collaborates on return their items (Dev Mode rule).
export async function listUsablePlaylists() {
  const [me, playlists] = await Promise.all([getMe(), getMyPlaylists()]);
  return playlists
    .filter(Boolean)
    .map(p => ({
      id: p.id,
      name: p.name,
      total: playlistTotal(p),
      owner: p.owner?.display_name || p.owner?.id || '',
      usable: p.owner?.id === me.id || p.collaborative === true
    }))
    .sort((a, b) => Number(b.usable) - Number(a.usable) || b.total - a.total);
}

export function normalizeTrack(row) {
  const t = row?.item ?? (typeof row?.track === 'object' ? row.track : null);
  if (!t || t.type !== 'track' || t.is_local || !t.id) return null;
  const images = t.album?.images || [];
  const art = images.find(i => i.width && i.width <= 640 && i.width >= 250) || images[0];
  return {
    spotifyId: t.id,
    uri: t.uri,
    title: t.name,
    artist: (t.artists || []).map(a => a.name).join(', '),
    artists: (t.artists || []).map(a => a.name),
    album: t.album?.name || '',
    albumType: t.album?.album_type || '',
    spotifyYear: parseInt((t.album?.release_date || '').slice(0, 4), 10) || null,
    durationMs: t.duration_ms || null,
    isrc: t.external_ids?.isrc || null,
    artwork: art?.url || null
  };
}

// Removes duplicates: same Spotify ID, or same ISRC (same recording on two albums).
export function dedupe(tracks) {
  const seenId = new Set();
  const seenIsrc = new Set();
  const out = [];
  for (const t of tracks) {
    if (!t || seenId.has(t.spotifyId)) continue;
    if (t.isrc && seenIsrc.has(t.isrc)) continue;
    seenId.add(t.spotifyId);
    if (t.isrc) seenIsrc.add(t.isrc);
    out.push(t);
  }
  return out;
}

export function getSelectedPlaylist() {
  return load('playlist');
}

export function setSelectedPlaylist(p) {
  save('playlist', { id: p.id, name: p.name });
}

// Returns { playlist, tracks, fromCache }.
export async function loadTracks(playlistId, { force = false, onProgress } = {}) {
  const info = await getPlaylistInfo(playlistId);
  const cached = load(`tracks.${playlistId}`);
  if (!force && cached && cached.snapshot === info.snapshot_id && cached.tracks?.length && 'durationMs' in cached.tracks[0]) {
    return { playlist: info, tracks: cached.tracks, fromCache: true };
  }
  const rows = await getPlaylistItems(playlistId, onProgress);
  const tracks = dedupe(rows.map(normalizeTrack));
  if (!tracks.length) {
    const err = new Error('empty_playlist');
    err.code = 'empty_playlist';
    throw err;
  }
  save(`tracks.${playlistId}`, { snapshot: info.snapshot_id, tracks });
  return { playlist: info, tracks, fromCache: false };
}
