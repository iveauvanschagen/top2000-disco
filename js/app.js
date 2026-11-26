// Bootstrap: wires the DOM to the game controller.
import { APP_VERSION, getRedirectUri } from './config.js';
import * as game from './game.js';
import * as player from './player.js';
import { render, renderPlaylists, renderSettings } from './ui.js';
import * as timer from './timer.js';

const $ = id => document.getElementById(id);
let playlistFilter = '';
let devices = [];

$('settings-version').textContent = APP_VERSION;
$('app-version').textContent = APP_VERSION;
$('redirect-uri').textContent = getRedirectUri();

game.subscribe(s => {
  render(s);
  if (s.name === 'playlist') renderPlaylists(s.playlists || [], playlistFilter, p => game.openPlaylist(p.id));
});

// Main controls
$('next-button').addEventListener('click', () => {
  const s = game.getState();
  if (s.name === 'exhausted') return game.newSession();
  if (!player.getDevicePref()) $('settings-button').click();
  game.next();
});
$('reveal-button').addEventListener('click', () => game.reveal());
$('pause-button').addEventListener('click', () => game.togglePause());

// Setup and connection
$('connect-button').addEventListener('click', () => game.login());
$('notice-close').addEventListener('click', () => game.clearNotice());
$('copy-redirect').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(getRedirectUri()); $('copy-redirect').textContent = 'GEKOPIEERD'; } catch { /* select manually */ }
});
$('client-form').addEventListener('submit', e => {
  e.preventDefault();
  game.saveClientId($('client-id').value);
});
$('playlist-search').addEventListener('input', e => {
  playlistFilter = e.target.value;
  renderPlaylists(game.getState().playlists || [], playlistFilter, p => game.openPlaylist(p.id));
});

// Settings
async function refreshDevices() {
  try { devices = await player.listDevices(); }
  catch { devices = player.sdkSupported() ? [{ id: 'browser', name: 'Deze browser', type: 'Browser' }] : []; }
  let pref = player.getDevicePref();
  if (!pref && devices.length) { pref = devices.find(d => d.active) || devices[0]; player.setDevicePref(pref); }
  renderSettings(game.getState(), devices, pref);
}

$('settings-button').addEventListener('click', () => {
  renderSettings(game.getState(), devices, player.getDevicePref());
  $('settings').showModal();
  if (!['unconfigured', 'not_connected'].includes(game.getState().name)) refreshDevices();
});
$('settings').addEventListener('click', e => { if (e.target === $('settings')) $('settings').close(); });
$('device-refresh').addEventListener('click', refreshDevices);
$('device-select').addEventListener('change', e => {
  const d = devices.find(x => x.id === e.target.value);
  if (d) player.setDevicePref({ id: d.id, name: d.name });
});
$('change-playlist').addEventListener('click', () => { $('settings').close(); game.showPlaylists(); });
$('reload-playlist').addEventListener('click', () => {
  const p = game.getState().playlist;
  $('settings').close();
  if (p) game.openPlaylist(p.id, { force: true });
});
$('new-session').addEventListener('click', () => { $('settings').close(); game.newSession(); });
$('logout-button').addEventListener('click', () => { $('settings').close(); game.logout(); });
$('reset-client').addEventListener('click', () => { $('settings').close(); game.resetClientId(); });

// Reveal effect: flash plus a burst of sparks in the design colours.
let lastName = null;
game.subscribe(s => {
  if (s.name === 'revealed' && lastName === 'playing' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const f = $('flash');
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    const host = document.querySelector('.copy');
    for (let i = 0; i < 30; i++) {
      const sp = document.createElement('i');
      sp.className = 'spark';
      sp.style.setProperty('--x', `${(Math.random() * 2 - 1) * 380}px`);
      sp.style.setProperty('--y', `${(Math.random() * 2 - 1) * 220}px`);
      sp.style.setProperty('--c', ['#ff60b9', '#88eadf', '#f5f0e7', '#9d7aff'][i % 4]);
      sp.style.animationDelay = `${Math.random() * 120}ms`;
      host.append(sp);
      setTimeout(() => sp.remove(), 1400);
    }
  }
  lastName = s.name;
});

// Timer: starts when a song is playing, follows pause, stops on reveal.
const timerEl = $('timer');
timer.init({
  update: ({ seconds, fraction, done }) => {
    timerEl.style.setProperty('--p', fraction.toFixed(4));
    $('timer-value').textContent = done ? 'TIJD!' : String(seconds);
    timerEl.classList.toggle('urgent', !done && seconds <= 5);
    timerEl.classList.toggle('done', done);
  },
  finished: () => { if (game.getState().playing) game.togglePause(); }
});
$('timer-toggle').checked = timer.isEnabled();
$('timer-toggle').addEventListener('change', e => {
  timer.setEnabled(e.target.checked);
  if (!e.target.checked) { timer.reset(); timerEl.hidden = true; }
});
let timerRound = null;
game.subscribe(s => {
  const playing = s.name === 'playing' && !s.busy;
  if (!timer.isEnabled() || (s.name !== 'playing')) {
    if (s.name !== 'playing') { timer.reset(); timerRound = null; }
    timerEl.hidden = true;
    return;
  }
  if (!playing) return;
  timerEl.hidden = false;
  if (timerRound !== s.round) { timerRound = s.round; timer.start(); }
  else if (s.playing) timer.resume();
  else timer.pause();
});

// Updates: always check for a new service worker, reload once when it takes over
// (never in the middle of a song), and a manual "refresh app" escape hatch.
const inGame = () => ['playing', 'revealed'].includes(game.getState().name);

async function hardRefresh() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations() || [];
    await Promise.all(regs.map(r => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  } catch { /* ignore */ }
  location.replace(location.pathname + '?v=' + Date.now());
}
$('refresh-app').addEventListener('click', hardRefresh);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1')) {
  let pendingReload = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (inGame()) pendingReload = true; else location.reload();
  });
  game.subscribe(s => { if (pendingReload && !['playing', 'revealed', 'loading'].includes(s.name)) location.reload(); });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});

  // Safety net: if the live version differs from the running one, refresh once.
  fetch('js/config.js', { cache: 'no-store' }).then(r => r.text()).then(src => {
    const live = src.match(/APP_VERSION = '([\d.]+)'/)?.[1];
    if (live && live !== APP_VERSION && !inGame() && sessionStorage.getItem('t2d.refreshed') !== live) {
      sessionStorage.setItem('t2d.refreshed', live);
      hardRefresh();
    }
  }).catch(() => {});
}

game.start();
