// Rendering. Song details are only written to the DOM in the "revealed" state.
const $ = id => document.getElementById(id);

const PLAYING_LINES = ['NU OP DE DRAAITAFEL', 'OREN OPEN, MOND DICHT', 'WIE WEET ’M?', 'LUISTER GOED...', 'DIT KEN JE WEL'];
const REVEAL_LINES = ['DAAR IS ’IE!', 'TROMGEROFFEL...', 'WIE HAD ’M?', 'EN HET ANTWOORD IS'];

const SCREENS = {
  unconfigured: 'screen-unconfigured',
  not_connected: 'screen-connect',
  loading: 'screen-loading',
  playlist: 'screen-playlist',
  ready: 'screen-game',
  playing: 'screen-game',
  revealed: 'screen-game',
  exhausted: 'screen-game'
};

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function placeholder(kicker, title, sub, icon = '?') {
  const frag = document.createDocumentFragment();
  frag.append(el('div', 'mystery-icon', icon));
  const box = el('div', 'track-text');
  box.append(el('span', 'info-kicker', kicker), el('h2', null, title), el('p', null, sub));
  frag.append(box);
  return frag;
}

function answer(song) {
  const frag = document.createDocumentFragment();
  if (song.artwork) {
    const img = el('img', 'artwork');
    img.alt = '';
    img.decoding = 'async';
    img.src = song.artwork;            // only set at reveal
    frag.append(img);
  } else {
    frag.append(el('div', 'mystery-icon', '♫'));
  }
  const box = el('div', 'track-text');
  box.append(el('span', 'info-kicker', 'HET ANTWOORD'));
  box.append(el('h2', 'answer-title', song.displayTitle || song.title));
  box.append(el('p', 'answer-artist', song.displayArtist || song.artist));
  const details = el('div', 'answer-details');
  const year = el('span', 'answer-year');
  year.append('JAAR ', el('b', null, song.year ? String(song.year) : 'onbekend'));
  details.append(year);
  if (song.year) {
    const dec = el('span');
    dec.append('DECENNIUM ', el('b', null, `${String(Math.floor(song.year / 10) * 10).slice(2)}s`));
    details.append(dec);
  }
  if (song.top2000Position) {
    const pos = el('span');
    pos.append('TOP 2000 ', el('b', null, `#${song.top2000Position}`));
    details.append(pos);
  }
  box.append(details);
  if (song.status !== 'verified') box.append(el('p', 'unverified', 'Jaar nog niet gecontroleerd'));
  frag.append(box);
  return frag;
}

let lastRenderKey = '';

export function render(s) {
  document.body.dataset.state = s.name;
  document.body.classList.toggle('is-playing', Boolean(s.playing) && (s.name === 'playing' || s.name === 'revealed'));
  document.body.classList.toggle('is-busy', Boolean(s.busy));

  const screenId = SCREENS[s.name];
  document.querySelectorAll('.screen').forEach(sc => { sc.hidden = sc.id !== screenId; });

  // Header
  const connected = !['unconfigured', 'not_connected'].includes(s.name);
  $('connection').classList.toggle('on', connected);
  $('connection-text').textContent = connected
    ? (s.playlist?.name ? s.playlist.name.toUpperCase() : 'SPOTIFY VERBONDEN')
    : 'SPOTIFY NIET VERBONDEN';

  // Notice
  $('notice').hidden = !s.notice;
  if (s.notice) {
    $('notice').dataset.kind = s.notice.kind;
    $('notice-text').textContent = s.notice.text;
  }

  if (s.name === 'loading') $('loading-text').textContent = s.loadProgress || 'Even geduld...';

  if (screenId !== 'screen-game') return;

  $('round-number').textContent = String(s.round).padStart(2, '0');
  $('live-text').textContent = s.name === 'exhausted' ? 'LIJST LEEG GEDRAAID' : `NOG ${s.remaining} NUMMERS`;

  const status = $('track-status');
  if (s.name === 'ready') status.textContent = s.round ? 'KLAAR VOOR DE VOLGENDE' : 'KLAAR VOOR DE EERSTE PLAAT';
  else if (s.name === 'playing') status.textContent = s.busy ? 'PLAAT WORDT OPGEZET...' : s.playing ? PLAYING_LINES[s.round % PLAYING_LINES.length] : 'GEPAUZEERD';
  else if (s.name === 'revealed') status.textContent = s.playing ? REVEAL_LINES[s.round % REVEAL_LINES.length] : 'ANTWOORD ONTHULD';
  else status.textContent = 'ALLES GEDRAAID';

  // Track info: rebuild only when the visible content changes.
  const key = `${s.name}|${s.round}|${s.name === 'revealed' ? s.song?.spotifyId : ''}`;
  if (key !== lastRenderKey) {
    lastRenderKey = key;
    const info = $('track-info');
    info.replaceChildren();
    info.classList.toggle('revealed', s.name === 'revealed');
    if (s.name === 'revealed' && s.song) info.append(answer(s.song));
    else if (s.name === 'exhausted') {
      info.append(placeholder('EINDE VAN DE LIJST', 'ALLES IS GEDRAAID', 'Nog een rondje? Start een nieuwe sessie.', '✳'));
      const btn = el('button', 'mini-button', 'NIEUWE SESSIE');
      btn.id = 'exhausted-new';
      info.append(btn);
    } else if (s.name === 'playing') info.append(placeholder('HUIDIG NUMMER', 'HET VOLGENDE NUMMER IS...', 'Luister goed. Doe je gok.'));
    else info.append(placeholder('KLAAR?', s.round ? 'OP NAAR DE VOLGENDE' : 'DRUK OP VOLGENDE NUMMER', 'Dansvloer klaar, oren gespitst.'));
  }

  // Controls
  $('next-button').disabled = s.busy || s.name === 'exhausted';
  $('next-small').textContent = s.name === 'playing' ? 'OVERSLAAN' : s.round ? 'VOLGENDE RONDE' : 'START DE RONDE';
  const canReveal = s.name === 'playing' && !s.busy;
  $('reveal-button').disabled = !canReveal;
  $('reveal-icon').textContent = s.name === 'revealed' ? '✓' : '✦';
  $('reveal-small').textContent = s.name === 'revealed' ? 'ANTWOORD STAAT ER' : 'IEDEREEN EEN GOK?';
  $('reveal-strong').textContent = s.name === 'revealed' ? 'ONTHULD' : 'ONTHUL ANTWOORD';

}

export function renderPlaylists(playlists, filter, onPick) {
  const list = $('playlist-list');
  list.replaceChildren();
  const f = filter.trim().toLowerCase();
  const shown = playlists.filter(p => !f || p.name.toLowerCase().includes(f));
  if (!shown.length) {
    list.append(el('li', 'muted', playlists.length ? 'Geen playlist gevonden.' : 'Geen playlists gevonden.'));
    return;
  }
  for (const p of shown) {
    const li = el('li');
    const btn = el('button', 'playlist-item');
    btn.disabled = !p.usable;
    btn.append(el('strong', null, p.name));
    btn.append(el('small', null, p.usable ? `${p.total} nummers` : `van ${p.owner}, maak eerst een eigen kopie`));
    btn.addEventListener('click', () => onPick(p));
    li.append(btn);
    list.append(li);
  }
}

export function renderSettings(s, devices, pref) {
  $('settings-playlist').textContent = s.playlist?.name || 'Geen playlist gekozen';
  const st = s.stats;
  $('settings-stats').textContent = st
    ? `${st.verified} van ${st.total} gecontroleerd (${st.inList} uit de officiële lijst). ${st['needs-check']} nakijken.`
    : '-';
  $('settings-session').textContent = s.playlist ? `Ronde ${s.round}, nog ${s.remaining} nummers in deze sessie.` : '-';
  const select = $('device-select');
  select.replaceChildren();
  if (!devices.length) {
    const o = el('option', null, 'Geen apparaat gevonden');
    o.value = '';
    select.append(o);
  }
  for (const d of devices) {
    const o = el('option', null, d.id === 'browser' ? 'Deze browser' : `${d.name} (${d.type})`);
    o.value = d.id;
    o.selected = pref?.id === d.id;
    select.append(o);
  }
}
