// Bootstrap: wires the DOM to the game controller.
import { APP_VERSION } from './config.js';
import * as game from './game.js';
import * as player from './player.js';
import { render, renderPlaylists, renderSettings } from './ui.js';

const $ = id => document.getElementById(id);
let playlistFilter = '';
let devices = [];

$('app-version').textContent = APP_VERSION;
$('settings-version').textContent = APP_VERSION;

game.subscribe(s => {
  render(s);
  if (s.name === 'playlist') renderPlaylists(s.playlists || [], playlistFilter, p => game.openPlaylist(p.id));
});

$('connect-button').addEventListener('click', () => game.login());
$('next-button').addEventListener('click', () => game.next());
$('reveal-button').addEventListener('click', () => game.reveal());
$('pause-button').addEventListener('click', () => game.togglePause());
$('replay-button').addEventListener('click', () => game.replay());
$('notice-close').addEventListener('click', () => game.clearNotice());
$('track-info').addEventListener('click', e => { if (e.target.id === 'exhausted-new') game.newSession(); });
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

// iPad without a chosen device: open settings on first Next press.
$('next-button').addEventListener('click', () => {
  if (!player.getDevicePref() && game.getState().name !== 'not_connected') $('settings-button').click();
}, { capture: true });

// Spacebar/Enter are left alone; keyboard shortcuts are a future enhancement.

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

game.start();
