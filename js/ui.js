// Rendering. Song details are only written to the DOM in the "revealed" state.
const $ = id => document.getElementById(id);

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

// Fixed copy only: never anything that identifies the current song.
const HERO = {
  ready: ['LET’S GET', 'DISCO.'],
  playing: ['KEN JIJ', 'DEZE?'],
  exhausted: ['ALLE HITS.', 'GEHAD.']
};

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function hero([line1, line2]) {
  const h = el('h1');
  h.append(line1, el('br'), el('span', 'accent', line2));
  return h;
}

// Long titles get a smaller size so they never push the buttons off screen.
function titleSize(t = '') {
  return t.length > 34 ? ' xlong' : t.length > 20 ? ' long' : '';
}

function answer(song) {
  const nodes = [
    el('h1', `answer-title${titleSize(song.displayTitle || song.title)}`, song.displayTitle || song.title),
    el('p', 'artist', song.displayArtist || song.artist)
  ];
  const row = el('div', 'year-row');
  row.append(el('span', 'year', song.year ? String(song.year) : '?'));
  nodes.push(row);
  if (song.top2000Position) {
    const rank = el('span', 'rank');
    rank.append(el('small', null, 'TOP 2000'), `#${song.top2000Position}`);
    nodes.push(rank);
  }
  if (song.status !== 'verified') nodes.push(el('span', 'unverified', 'JAAR NIET GECONTROLEERD'));
  return nodes;
}

let lastKey = '';

export function render(s) {
  document.body.dataset.state = s.name;
  const active = s.name === 'playing' || s.name === 'revealed';
  document.body.classList.toggle('is-playing', Boolean(s.playing) && active);
  document.body.classList.toggle('is-busy', Boolean(s.busy));

  const screenId = SCREENS[s.name];
  document.querySelectorAll('.screen').forEach(sc => { sc.hidden = sc.id !== screenId; });

  const connected = !['unconfigured', 'not_connected'].includes(s.name);
  $('connection').classList.toggle('on', connected);
  $('connection-text').textContent = connected ? (s.playlist?.name || 'SPOTIFY').toUpperCase() : 'NIET VERBONDEN';

  $('notice').hidden = !s.notice;
  if (s.notice) {
    $('notice').dataset.kind = s.notice.kind;
    $('notice-text').textContent = s.notice.text;
  }
  if (s.name === 'loading') $('loading-text').textContent = s.loadProgress || 'Even geduld...';
  if (screenId !== 'screen-game') return;

  // Hero / answer
  const key = `${s.name}|${s.round}`;
  if (key !== lastKey) {
    lastKey = key;
    const box = $('answer');
    box.classList.remove('reveal-in');
    const sleeve = $('sleeve');
    if (s.name === 'revealed' && s.song?.artwork) {
      sleeve.src = s.song.artwork;          // only set at reveal
      sleeve.hidden = false;
    } else {
      sleeve.removeAttribute('src');
      sleeve.hidden = true;
    }
    document.body.classList.toggle('has-sleeve', s.name === 'revealed' && Boolean(s.song?.artwork));
    if (s.name === 'revealed' && s.song) {
      box.replaceChildren(...answer(s.song));
      void box.offsetWidth;
      box.classList.add('reveal-in');
    } else {
      box.replaceChildren(hero(HERO[s.name] || HERO.ready));
    }
  }

  // Essential status only
  $('playback-label').textContent =
    s.busy ? 'LADEN...' :
    active ? (s.playing ? 'SPEELT' : 'GEPAUZEERD') : '';

  // Buttons
  // Next only when nothing is playing: start, paused, revealed or exhausted.
  $('next-button').disabled = s.busy || (s.name === 'playing' && s.playing);
  $('next-label').textContent = s.name === 'exhausted' ? 'NIEUWE SESSIE' : 'VOLGENDE NUMMER';
  $('reveal-button').disabled = !(s.name === 'playing' && !s.busy);
  $('pause-button').disabled = !(active && !s.busy);
  $('pause-symbol').textContent = s.playing ? '❚❚' : '▶';
  $('pause-button').setAttribute('aria-label', s.playing ? 'Pauze' : 'Verder');
}

export function renderPlaylists(playlists, filter, onPick) {
  const list = $('playlist-list');
  list.replaceChildren();
  const f = filter.trim().toLowerCase();
  const shown = playlists.filter(p => !f || p.name.toLowerCase().includes(f));
  if (!shown.length) {
    list.append(el('li', 'hint', playlists.length ? 'Niets gevonden.' : 'Geen playlists gevonden.'));
    return;
  }
  for (const p of shown) {
    const li = el('li');
    const btn = el('button', 'playlist-item');
    btn.disabled = !p.usable;
    btn.append(el('strong', null, p.name), el('small', null, p.usable ? `${p.total} nummers` : 'niet van jou'));
    btn.addEventListener('click', () => onPick(p));
    li.append(btn);
    list.append(li);
  }
}

export function renderSettings(s, devices, pref) {
  $('settings-playlist').textContent = s.playlist?.name || '-';
  const st = s.stats;
  $('settings-stats').textContent = st ? `${st.verified} van ${st.total} jaartallen gecontroleerd` : '';
  $('settings-session').textContent = s.playlist ? `${s.round} gespeeld, nog ${s.remaining} te gaan` : '';
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
