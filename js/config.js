// Central configuration. The Spotify Client ID is public by design (PKCE, no secret).
export const APP_VERSION = '1.5.0';

// The Spotify Client ID is entered in the app itself and stored on the device,
// so it never has to be committed to the repository.

// Playlist that is opened by default (must be owned by, or shared with, the host).
export const DEFAULT_PLAYLIST_ID = '1DTzz7Nh2rJBnyFbjsH1Mh';

export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative'
].join(' ');

// The redirect URI is the folder the app is served from, e.g.
// https://<user>.github.io/top2000-disco/ or http://127.0.0.1:8080/
export function getRedirectUri() {
  const { origin, pathname } = window.location;
  return origin + pathname.replace(/[^/]*$/, '');
}

export const STORAGE_PREFIX = 't2d.';

// Official NPO Radio 2 Top 2000 list with release years (authoritative year source).
// For a new edition: add data/top2000-<year>.json and point this to it.
export const TOP2000_LIST_FILE = 'data/top2000-2025.json';
export const SONGS_FILE = 'data/songs.json';
