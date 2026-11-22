// Thin Spotify Web API client (paths as of the February 2026 Web API changes).
import { getAccessToken } from './auth.js';

const API = 'https://api.spotify.com/v1';

export class SpotifyError extends Error {
  constructor(status, message, reason) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function api(path, { method = 'GET', body, query, retry = 0 } = {}) {
  const url = new URL(path.startsWith('http') ? path : API + path);
  if (query) Object.entries(query).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const token = await getAccessToken(retry > 0 && retry < 2);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401 && retry === 0) return api(path, { method, body, query, retry: 1 });
  if (res.status === 429 && retry < 4) {
    const wait = Number(res.headers.get('Retry-After') || 2);
    await sleep(Math.min(wait, 30) * 1000);
    return api(path, { method, body, query, retry: retry + 2 });
  }
  if (res.status === 204 || res.status === 202) return null;
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    throw new SpotifyError(res.status, data?.error?.message || `HTTP ${res.status}`, data?.error?.reason);
  }
  return data;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

// Follows paging "next" links and collects all items.
export async function getAll(path, query, onProgress) {
  const items = [];
  let page = await api(path, { query });
  while (page) {
    items.push(...(page.items || []));
    onProgress?.(items.length, page.total);
    page = page.next ? await api(page.next) : null;
  }
  return items;
}

export const getMe = () => api('/me');
export const getMyPlaylists = () => getAll('/me/playlists', { limit: 50 });
export const getPlaylistInfo = id => api(`/playlists/${id}`, { query: { fields: 'id,name,snapshot_id,owner(id,display_name)' } });
export const getPlaylistItems = (id, onProgress) => getAll(`/playlists/${id}/items`, { limit: 50 }, onProgress);
export const getDevices = () => api('/me/player/devices').then(d => d?.devices || []);
export const getPlayback = () => api('/me/player');
export const play = (deviceId, body) => api('/me/player/play', { method: 'PUT', query: { device_id: deviceId }, body });
export const pause = deviceId => api('/me/player/pause', { method: 'PUT', query: { device_id: deviceId } });
export const transfer = deviceId => api('/me/player', { method: 'PUT', body: { device_ids: [deviceId], play: false } });
export const setRepeat = (deviceId, state) => api('/me/player/repeat', { method: 'PUT', query: { state, device_id: deviceId } });
