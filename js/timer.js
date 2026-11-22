// Optional 30-second countdown per song. Pure UI helper, driven by game state.
import { load, save } from './storage.js';

export const DURATION = 30;
let remainingMs = DURATION * 1000;
let endsAt = null;
let tick = null;
let onUpdate = () => {};
let onDone = () => {};
let done = false;

export const isEnabled = () => load('timer', false);
export const setEnabled = on => save('timer', Boolean(on));

export function init({ update, finished }) { onUpdate = update; onDone = finished; }

function emit() { onUpdate({ seconds: Math.ceil(remainingMs / 1000), fraction: remainingMs / (DURATION * 1000), running: Boolean(endsAt), done }); }

function loop() {
  remainingMs = Math.max(0, endsAt - Date.now());
  emit();
  if (remainingMs === 0) {
    stopTicking();
    done = true;
    emit();
    onDone();
  }
}

function stopTicking() { clearInterval(tick); tick = null; endsAt = null; }

export function start() {
  stopTicking();
  done = false;
  remainingMs = DURATION * 1000;
  resume();
}

export function pause() {
  if (!endsAt) return;
  remainingMs = Math.max(0, endsAt - Date.now());
  stopTicking();
  emit();
}

export function resume() {
  if (done || endsAt || remainingMs <= 0) return;
  endsAt = Date.now() + remainingMs;
  tick = setInterval(loop, 200);
  loop();
}

export function reset() { stopTicking(); done = false; remainingMs = DURATION * 1000; emit(); }
export const isDone = () => done;
