// Sounds at the end of the timer, synthesised with Web Audio (no audio files).
import { load, save } from './storage.js';

export const OPTIONS = [
  ['ticks', 'Aftellen (tikjes 5 tot 1, piep bij 0)'],
  ['buzzer', 'Spelshow-zoemer'],
  ['gong', 'Gong'],
  ['horn', 'Airhorn'],
  ['scratch', 'Plaat-scratch'],
  ['off', 'Geen geluid']
];

export const getSound = () => load('sound', 'ticks');
export const setSound = v => save('sound', v);

let ctx = null;
const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());

// Browsers only allow audio after a user gesture: call this from click/keydown.
export function unlock() {
  try { ac().resume(); } catch { /* no audio support */ }
}

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function osc(type, freq, t, dur, peak, dest) {
  const c = ac(), o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  env(g, t, 0.01, peak, dur);
  o.connect(g).connect(dest || c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}
function noise(dur) {
  const c = ac(), buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource();
  s.buffer = buf;
  return s;
}

const FINAL = {
  ticks() {
    const t = ac().currentTime;
    osc('sine', 880, t, .7, .3);
    osc('sine', 1320, t, .7, .15);
  },
  buzzer() {
    const c = ac(), t = c.currentTime, lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1800; lp.connect(c.destination);
    [110, 113, 220].forEach(f => osc('sawtooth', f, t, .9, .18, lp));
  },
  gong() {
    const t = ac().currentTime;
    [[98, .5], [196, .25], [261, .18], [330, .12], [523, .06]].forEach(([f, v], i) => {
      const o = osc('sine', f, t, 3.2 - i * .3, v);
      o.frequency.exponentialRampToValueAtTime(f * .985, t + 3);
    });
  },
  horn() {
    const c = ac(), t0 = c.currentTime, lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(c.destination);
    [[0, .14], [.2, .14], [.4, .7]].forEach(([s, d]) => {
      [440, 443, 660].forEach(f => {
        const o = osc('sawtooth', f, t0 + s, d, .12, lp);
        o.frequency.setValueAtTime(f * .94, t0 + s);
        o.frequency.exponentialRampToValueAtTime(f, t0 + s + .05);
      });
    });
  },
  scratch() {
    const c = ac(), t = c.currentTime;
    for (let i = 0; i < 3; i++) {
      const n = noise(.18), bp = c.createBiquadFilter(), g = c.createGain(), s = t + i * .17;
      bp.type = 'bandpass'; bp.Q.value = 3;
      bp.frequency.setValueAtTime(i % 2 ? 2400 : 500, s);
      bp.frequency.exponentialRampToValueAtTime(i % 2 ? 500 : 2400, s + .15);
      env(g, s, .01, .7, .15);
      n.connect(bp).connect(g).connect(c.destination);
      n.start(s);
    }
    const st = t + .55, o = osc('triangle', 330, st, 1.1, .25);
    o.frequency.exponentialRampToValueAtTime(40, st + 1.1);
  }
};

function safe(fn) { try { if (ac().state !== 'closed') fn(); } catch { /* ignore */ } }

// Called each second the timer shows 5, 4, 3, 2 or 1.
export function tick() {
  if (getSound() !== 'ticks') return;
  safe(() => osc('square', 1200, ac().currentTime, .05, .12));
}

// Called when the timer hits 0.
export function final(kind = getSound()) {
  if (kind === 'off' || !FINAL[kind]) return;
  safe(FINAL[kind]);
}

// Preview from the settings.
export function preview(kind) {
  unlock();
  if (kind === 'ticks') {
    const t = ac().currentTime;
    for (let i = 0; i < 5; i++) safe(() => osc('square', 1200, t + i * .6, .05, .12));
    setTimeout(() => final('ticks'), 3000);
  } else final(kind);
}
