// Metadata management page: review years, manual corrections, export.
import * as auth from './auth.js';
import { getSelectedPlaylist, loadTracks } from './playlist.js';
import * as songs from './songs.js';

const $ = id => document.getElementById(id);
let playlist = null;
let tracks = [];
let sources = null;
let meta = {};
let built = null;

function notify(text, kind = 'error') {
  $('notice').hidden = false;
  $('notice').dataset.kind = kind;
  $('notice-text').textContent = text;
}
$('notice-close').onclick = () => { $('notice').hidden = true; };

function rebuild() {
  built = songs.buildCatalog(tracks, sources, meta);
  renderStats();
  renderRows();
}

function renderStats() {
  const s = built.stats;
  $('stats').innerHTML = '';
  for (const [label, v] of [['NUMMERS', s.total], ['IN OFFICIËLE LIJST', s.inList], ['GECONTROLEERD', s.verified], ['AUTOMATISCH', s.auto], ['NAKIJKEN', s['needs-check']]]) {
    const span = document.createElement('span');
    span.append(label, Object.assign(document.createElement('b'), { textContent: v }));
    $('stats').append(span);
  }
  $('unmatched-summary').textContent = `Lijstnummers zonder match in de playlist (${built.unmatched.length})`;
  $('unmatched').replaceChildren(...built.unmatched.map(e => {
    const li = document.createElement('li');
    li.textContent = `#${e.pos ?? '?'} ${e.title ?? e.b} · ${e.artist ?? e.a} (${e.year})`;
    return li;
  }));
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS = { verified: 'GECONTROLEERD', auto: 'AUTOMATISCH', 'needs-check': 'NAKIJKEN' };

function renderRows() {
  const filter = $('filter').value;
  const q = $('search').value.trim().toLowerCase();
  const list = [...built.catalog.values()].filter(s => {
    if (filter === 'needs-check' && s.status !== 'needs-check') return false;
    if (filter === 'notlist' && s.listYear) return false;
    if (filter === 'manual' && !s.manualYear) return false;
    if (q && !`${s.title} ${s.artist}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => (a.top2000Position ?? 9999) - (b.top2000Position ?? 9999) || a.artist.localeCompare(b.artist));

  $('rows').innerHTML = list.map(s => `
    <tr data-id="${esc(s.spotifyId)}">
      <td class="num">${s.top2000Position ? '#' + s.top2000Position : '-'}</td>
      <td><strong>${esc(s.title)}</strong><br><span class="muted">${esc(s.artist)}</span></td>
      <td><input class="year" type="number" min="1900" max="2100" value="${esc(s.year ?? '')}" data-orig="${esc(s.year ?? '')}" aria-label="Jaar"></td>
      <td><span class="badge ${s.status}">${STATUS[s.status]}</span>${s.flags.length ? `<span class="flags">${esc(s.flags.join(', '))}</span>` : ''}</td>
      <td class="num">${esc(s.listYear ?? '-')}</td>
      <td class="num">${esc(s.spotifyYear ?? '-')}</td>
      <td class="muted">${esc(s.album)}</td>
      <td><input type="checkbox" class="ok" ${s.status === 'verified' ? 'checked' : ''} aria-label="Gecontroleerd"></td>
      <td><input class="note" value="${esc(s.notes)}" aria-label="Notitie"></td>
    </tr>`).join('') || '<tr><td colspan="10" class="muted">Niets te tonen met dit filter.</td></tr>';
}

function save() { songs.setLocalMeta(playlist.id, meta); }

$('rows').addEventListener('change', e => {
  const tr = e.target.closest('tr');
  if (!tr?.dataset.id) return;
  const id = tr.dataset.id;
  const song = built.catalog.get(id);
  const m = meta[id] || (meta[id] = {});
  if (e.target.classList.contains('year')) {
    const y = parseInt(e.target.value, 10);
    if (y >= 1900 && y <= 2100) { m.manualYear = y; m.manualVerified = true; }
    else { delete m.manualYear; delete m.manualVerified; }
  } else if (e.target.classList.contains('ok')) {
    if (e.target.checked) { m.manualYear = song.year; m.manualVerified = true; }
    else if (m.manualYear) { delete m.manualYear; delete m.manualVerified; }
  } else if (e.target.classList.contains('note')) {
    m.notes = e.target.value;
  }
  save();
  rebuild();
});
$('filter').onchange = renderRows;
$('search').oninput = renderRows;

function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('export-json').onclick = () => download('songs.json', JSON.stringify(songs.toExport(built.catalog, playlist), null, 1), 'application/json');
$('export-csv').onclick = () => download('top2000-jaartallen.csv', '﻿' + songs.toCsv(built.catalog), 'text/csv');

$('import-json').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    let n = 0;
    for (const s of data.songs || []) {
      const m = meta[s.spotifyId] || (meta[s.spotifyId] = {});
      if (s.manualYear) { m.manualYear = s.manualYear; m.manualVerified = s.manualVerified ?? true; n++; }
      if (s.notes) m.notes = s.notes;
    }
    save();
    rebuild();
    notify(`${n} correcties geïmporteerd.`, 'info');
  } catch {
    notify('Dit bestand kon niet gelezen worden.');
  }
  e.target.value = '';
};

async function init(force = false) {
  if (!auth.isConfigured()) { notify('Vul eerst je Spotify Client ID in js/config.js in.'); return; }
  if (!auth.isLoggedIn()) { $('login-card').hidden = false; return; }
  const sel = getSelectedPlaylist();
  if (!sel?.id) { notify('Kies eerst een playlist in het spel (instellingen).'); return; }
  $('main-card').hidden = false;
  $('playlist-line').textContent = 'Playlist laden...';
  try {
    const [res, src] = await Promise.all([
      loadTracks(sel.id, { force, onProgress: (n, t) => { $('playlist-line').textContent = `Playlist laden... ${n} van ${t}`; } }),
      songs.loadSources()
    ]);
    playlist = res.playlist; tracks = res.tracks; sources = src;
    meta = songs.getLocalMeta(playlist.id);
    $('playlist-line').textContent = `${playlist.name} · bron: NPO Top 2000 ${sources.edition ?? ''} (${sources.list.length} nummers)`;
    rebuild();
  } catch (err) {
    console.error(err);
    notify('Playlist laden mislukt. Ben je nog verbonden met Spotify?');
  }
}

$('login-button').onclick = () => auth.login('beheer.html');
$('reload').onclick = () => init(true);
init();
