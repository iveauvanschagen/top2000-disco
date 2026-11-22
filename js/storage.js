// Small localStorage wrapper that never throws (private mode, quota, etc.).
import { STORAGE_PREFIX } from './config.js';

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try { localStorage.removeItem(STORAGE_PREFIX + key); } catch { /* ignore */ }
}
