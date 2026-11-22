// Random selection without repeats within a session. Pure logic plus persistence.
import { load, save } from './storage.js';

export function shuffled(ids, random = cryptoRandom) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cryptoRandom() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

export function newSession(ids) {
  return { order: shuffled([...new Set(ids)]), pos: 0, round: 0, current: null };
}

// Keeps a session in sync with the playlist: removed tracks drop out,
// new tracks are inserted at random positions in the unplayed part.
export function syncSession(session, ids) {
  const valid = new Set(ids);
  const played = session.order.slice(0, session.pos).filter(id => valid.has(id));
  const rest = session.order.slice(session.pos).filter(id => valid.has(id));
  const known = new Set(session.order);
  const added = ids.filter(id => !known.has(id));
  return { ...session, order: [...played, ...shuffled([...rest, ...added])], pos: played.length };
}

// Returns the next id or null when exhausted. A skipped song counts as played.
export function nextId(session) {
  if (session.pos >= session.order.length) return null;
  const id = session.order[session.pos];
  session.pos += 1;
  session.round += 1;
  session.current = id;
  return id;
}

export const isExhausted = s => s.pos >= s.order.length;
export const remaining = s => s.order.length - s.pos;

export function loadSession(playlistId, ids) {
  const s = load(`session.${playlistId}`);
  return s?.order ? syncSession(s, ids) : newSession(ids);
}

export function saveSession(playlistId, session) {
  save(`session.${playlistId}`, session);
}
