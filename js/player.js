// Playback: Web Playback SDK in this browser (laptop/desktop), or Spotify Connect
// to another device (iPad Spotify app, speaker) where the SDK is not supported.
import { getAccessToken } from './auth.js';
import * as sp from './spotify-api.js';
import { load, save } from './storage.js';

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
const NEUTRAL = { title: 'Top 2000 Disco', artist: 'Raad maar...', album: '' };

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const sdkSupported = () => !isIOS() && 'MediaKeys' in window;

const listeners = new Set();
let sdkPlayer = null;
let sdkDeviceId = null;
let sdkReady = null;
let currentUri = null;
let pollTimer = null;
let maskTimer = null;
let lastState = { playing: false, paused: false };

export function onPlayerEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(type, data = {}) { listeners.forEach(fn => fn({ type, ...data })); }

// Device preference: 'browser' or a Spotify Connect device id.
export function getDevicePref() {
  return load('device', sdkSupported() ? { id: 'browser', name: 'Deze browser' } : null);
}
export function setDevicePref(device) { save('device', device); }

// Hide track metadata from OS media controls, lock screens and notifications.
function maskMediaSession() {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  try { navigator.mediaSession.metadata = new MediaMetadata(NEUTRAL); } catch { /* ignore */ }
}
function startMasking() {
  maskMediaSession();
  clearInterval(maskTimer);
  maskTimer = setInterval(maskMediaSession, 1500);
}

function loadSdk() {
  if (sdkReady) return sdkReady;
  sdkReady = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('sdk_timeout')), 15000);
    window.onSpotifyWebPlaybackSDKReady = () => {
      sdkPlayer = new window.Spotify.Player({
        name: 'Top 2000 Disco',
        volume: 0.9,
        getOAuthToken: cb => getAccessToken().then(cb).catch(() => emit('auth_error'))
      });
      sdkPlayer.addListener('ready', ({ device_id }) => {
        clearTimeout(timeout);
        sdkDeviceId = device_id;
        resolve(device_id);
      });
      sdkPlayer.addListener('not_ready', () => emit('device_lost'));
      sdkPlayer.addListener('initialization_error', ({ message }) => { clearTimeout(timeout); reject(new Error(message)); });
      sdkPlayer.addListener('authentication_error', () => emit('auth_error'));
      sdkPlayer.addListener('account_error', () => emit('premium_required'));
      sdkPlayer.addListener('autoplay_failed', () => emit('autoplay_blocked'));
      sdkPlayer.addListener('player_state_changed', state => {
        maskMediaSession();
        if (!state) return;
        handleState({
          uri: state.track_window?.current_track?.uri,
          playing: !state.paused,
          position: state.position,
          duration: state.duration
        });
      });
      sdkPlayer.connect();
    };
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.onerror = () => { clearTimeout(timeout); reject(new Error('sdk_load_failed')); };
    document.head.appendChild(s);
  });
  sdkReady.catch(() => { sdkReady = null; });
  return sdkReady;
}

function handleState({ uri, playing, position, duration }) {
  // Guard: Spotify autoplay must never continue with an unrelated song.
  if (currentUri && uri && uri !== currentUri && playing) {
    pause().catch(() => {});
    playing = false;
  }
  const ended = currentUri && !playing && position === 0 && lastState.playing;
  lastState = { playing, paused: !playing };
  emit('state', { playing, ended, position, duration });
}

function startPolling(deviceId) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const s = await sp.getPlayback();
      if (!s) { emit('state', { playing: false }); return; }
      if (s.device?.id && s.device.id !== deviceId) { emit('device_switched', { name: s.device.name }); }
      handleState({ uri: s.item?.uri, playing: s.is_playing, position: s.progress_ms, duration: s.item?.duration_ms });
    } catch { /* transient, try again next tick */ }
  }, 5000);
}

async function resolveDeviceId() {
  const pref = getDevicePref();
  if (!pref) throw Object.assign(new Error('no_device'), { code: 'no_device' });
  if (pref.id === 'browser') return loadSdk();
  return pref.id;
}

// Must be called from a click handler (autoplay rules on Safari/Chrome).
export async function prime() {
  const pref = getDevicePref();
  if (pref?.id === 'browser') {
    await loadSdk();
    await sdkPlayer.activateElement?.();
  }
}

export async function playTrack(uri) {
  currentUri = uri;
  startMasking();
  const deviceId = await resolveDeviceId();
  const body = { uris: [uri], position_ms: 0 };
  try {
    await sp.play(deviceId, body);
  } catch (err) {
    if (err.status === 404) {
      // Device asleep or not yet registered: transfer, then retry once.
      await sp.transfer(deviceId).catch(() => {});
      await new Promise(r => setTimeout(r, 800));
      try { await sp.play(deviceId, body); }
      catch (e2) { throw Object.assign(new Error('device_unavailable'), { code: 'device_unavailable', cause: e2 }); }
    } else if (err.status === 403) {
      throw Object.assign(new Error('premium_required'), { code: 'premium_required', cause: err });
    } else throw err;
  }
  sp.setRepeat(deviceId, 'off').catch(() => {});
  if (getDevicePref()?.id !== 'browser') startPolling(deviceId);
  lastState = { playing: true, paused: false };
  emit('state', { playing: true });
}

export async function pause() {
  if (getDevicePref()?.id === 'browser' && sdkPlayer) return sdkPlayer.pause();
  const id = getDevicePref()?.id;
  await sp.pause(id).catch(() => {});
}

export async function resume() {
  if (getDevicePref()?.id === 'browser' && sdkPlayer) return sdkPlayer.resume();
  await sp.play(getDevicePref()?.id).catch(() => {});
}

export async function replay() {
  if (currentUri) return playTrack(currentUri);
}

export async function listDevices() {
  const devices = (await sp.getDevices()).filter(d => !d.is_restricted && d.name !== 'Top 2000 Disco');
  const list = devices.map(d => ({ id: d.id, name: d.name, type: d.type, active: d.is_active }));
  return sdkSupported() ? [{ id: 'browser', name: 'Deze browser', type: 'Browser' }, ...list] : list;
}

export function stop() {
  clearInterval(pollTimer);
  currentUri = null;
}
