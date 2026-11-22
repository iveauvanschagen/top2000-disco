// Game state machine and controller.
// States: unconfigured, not_connected, loading, playlist, ready, playing, revealed, exhausted
import * as auth from './auth.js';
import * as playlistMod from './playlist.js';
import * as songs from './songs.js';
import * as shuffle from './shuffle.js';
import * as player from './player.js';

const subscribers = new Set();
let state = {
  name: 'loading',
  round: 0,
  song: null,          // current song object (never rendered before reveal)
  playing: false,
  busy: false,
  notice: null,        // { kind: 'error'|'info', text }
  playlist: null,
  stats: null,
  remaining: 0,
  loadProgress: null
};
let catalog = new Map();
let session = null;

export const getState = () => state;
export function subscribe(fn) { subscribers.add(fn); fn(state); return () => subscribers.delete(fn); }
function set(patch) { state = { ...state, ...patch }; subscribers.forEach(fn => fn(state)); }

export function notify(text, kind = 'error') { set({ notice: { kind, text } }); }
export function clearNotice() { set({ notice: null }); }

const MESSAGES = {
  premium_required: 'Spotify Premium is nodig om af te spelen.',
  device_unavailable: 'Het afspeelapparaat reageert niet. Open Spotify op je iPad of speaker, speel kort iets af en probeer opnieuw.',
  no_device: 'Kies eerst waar de muziek moet klinken (instellingen).',
  sdk_timeout: 'De Spotify-speler in deze browser start niet. Kies een ander apparaat in de instellingen.',
  sdk_load_failed: 'De Spotify-speler kon niet laden. Check je internet of kies een ander apparaat.',
  session_expired: 'Je Spotify-sessie is verlopen. Verbind opnieuw.',
  empty_playlist: 'Deze playlist heeft geen speelbare nummers.',
  autoplay_blocked: 'De browser blokkeerde het afspelen. Druk nog een keer op Volgende nummer.'
};

export function messageFor(err) {
  const code = err?.code || err?.message;
  if (MESSAGES[code]) return MESSAGES[code];
  if (err?.status === 403) return 'Spotify weigert dit verzoek. Staat je account in de app onder User Management?';
  if (err?.status === 429) return 'Even rustig aan, Spotify vraagt om een korte pauze.';
  return 'Er ging iets mis met Spotify. Probeer het nog eens.';
}

function fail(err) {
  console.error(err);
  if (err?.message === 'session_expired' || err?.message === 'not_logged_in') {
    set({ name: 'not_connected', busy: false, notice: { kind: 'error', text: MESSAGES.session_expired } });
    return;
  }
  set({ busy: false, notice: { kind: 'error', text: messageFor(err) } });
}

player.onPlayerEvent(e => {
  if (e.type === 'state') {
    if (state.name === 'playing' || state.name === 'revealed') set({ playing: e.playing });
  } else if (e.type === 'premium_required') notify(MESSAGES.premium_required);
  else if (e.type === 'autoplay_blocked') notify(MESSAGES.autoplay_blocked);
  else if (e.type === 'auth_error') fail(new Error('session_expired'));
  else if (e.type === 'device_lost') notify('Verbinding met de speler even kwijt. Hij probeert opnieuw te verbinden.', 'info');
});

export async function start() {
  if (!auth.isConfigured()) return set({ name: 'unconfigured' });
  const redirect = await auth.handleRedirect();
  if (redirect.handled && redirect.returnTo) { window.location.replace(redirect.returnTo); return; }
  if (redirect.error) notify(redirect.error === 'access_denied' ? 'Verbinden met Spotify geannuleerd.' : 'Verbinden met Spotify mislukt. Probeer opnieuw.');
  if (!auth.isLoggedIn()) return set({ name: 'not_connected' });
  const selected = playlistMod.getSelectedPlaylist();
  if (selected?.id) return openPlaylist(selected.id);
  return showPlaylists();
}

export async function showPlaylists() {
  set({ name: 'loading', busy: true, loadProgress: 'Playlists ophalen...' });
  try {
    const playlists = await playlistMod.listUsablePlaylists();
    set({ name: 'playlist', busy: false, playlists, loadProgress: null });
  } catch (err) {
    fail(err);
    if (state.name === 'loading') set({ name: 'playlist', playlists: [] });
  }
}

export async function openPlaylist(id, { force = false } = {}) {
  set({ name: 'loading', busy: true, loadProgress: 'Nummers laden...', notice: null });
  try {
    const [{ playlist, tracks }, sources] = await Promise.all([
      playlistMod.loadTracks(id, { force, onProgress: (n, total) => set({ loadProgress: `Nummers laden... ${n} van ${total}` }) }),
      songs.loadSources()
    ]);
    playlistMod.setSelectedPlaylist(playlist);
    const built = songs.buildCatalog(tracks, sources, songs.getLocalMeta(id));
    catalog = built.catalog;
    session = shuffle.loadSession(id, [...catalog.keys()]);
    shuffle.saveSession(id, session);
    set({
      name: shuffle.isExhausted(session) ? 'exhausted' : 'ready',
      busy: false, loadProgress: null, song: null, playing: false,
      playlist: { id: playlist.id, name: playlist.name },
      stats: built.stats, round: session.round, remaining: shuffle.remaining(session)
    });
  } catch (err) {
    if (err?.status === 404 || err?.status === 403) {
      notify('Deze playlist kan niet geladen worden. Kies een playlist die van jou is.');
      playlistMod.setSelectedPlaylist({ id: null, name: null });
      return showPlaylists();
    }
    fail(err);
    if (state.name === 'loading') await showPlaylists();
  }
}

export async function next() {
  if (state.busy || !session) return;
  if (!player.getDevicePref()) return notify(MESSAGES.no_device, 'info');
  clearNotice();
  const id = shuffle.nextId(session);
  shuffle.saveSession(state.playlist.id, session);
  if (!id) {
    player.pause().catch(() => {});
    player.stop();
    return set({ name: 'exhausted', song: null, playing: false, remaining: 0 });
  }
  const song = catalog.get(id);
  set({ name: 'playing', busy: true, song, round: session.round, remaining: shuffle.remaining(session), playing: false });
  try {
    await player.prime();
    await player.playTrack(song.uri);
    set({ busy: false, playing: true });
  } catch (err) {
    fail(err);
  }
}

export function reveal() {
  if (state.name !== 'playing' || !state.song) return;
  set({ name: 'revealed' });
}

export async function togglePause() {
  if (!state.song) return;
  try {
    if (state.playing) { await player.pause(); set({ playing: false }); }
    else { await player.resume(); set({ playing: true }); }
  } catch (err) { fail(err); }
}

export async function replay() {
  if (!state.song) return;
  try { await player.prime(); await player.replay(); set({ playing: true }); } catch (err) { fail(err); }
}

export function newSession() {
  if (!state.playlist) return;
  player.pause().catch(() => {});
  player.stop();
  session = shuffle.newSession([...catalog.keys()]);
  shuffle.saveSession(state.playlist.id, session);
  set({ name: 'ready', song: null, playing: false, round: 0, remaining: shuffle.remaining(session), notice: null });
}

export function logout() {
  player.pause().catch(() => {});
  player.stop();
  auth.logout();
  set({ name: 'not_connected', song: null, playlist: null, playing: false });
}

export const login = () => auth.login();
