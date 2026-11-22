// Spotify authentication: Authorization Code with PKCE. No client secret anywhere.
import { SPOTIFY_CLIENT_ID, SPOTIFY_SCOPES, getRedirectUri } from './config.js';
import { load, save, remove } from './storage.js';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

export function isConfigured() {
  return SPOTIFY_CLIENT_ID && !SPOTIFY_CLIENT_ID.startsWith('PASTE_');
}

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// returnTo: page to go back to after login (e.g. 'beheer.html').
export async function login(returnTo = '') {
  const verifier = randomString(64);
  const state = randomString(16);
  save('pkce', { verifier, state, returnTo });
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: SPOTIFY_SCOPES,
    redirect_uri: getRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    state
  });
  window.location.assign(`${AUTH_URL}?${params}`);
}

function storeToken(data) {
  const previous = load('token', {});
  save('token', {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || previous.refreshToken,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000
  });
}

async function tokenRequest(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  return res.json();
}

// Handles ?code=...&state=... after the Spotify redirect.
// Returns { handled, returnTo, error }.
export async function handleRedirect() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('code') && !params.has('error')) return { handled: false };
  const pkce = load('pkce');
  remove('pkce');
  history.replaceState(null, '', getRedirectUri());
  if (params.has('error')) return { handled: true, error: params.get('error') };
  if (!pkce || pkce.state !== params.get('state')) {
    return { handled: true, error: 'state_mismatch' };
  }
  try {
    const data = await tokenRequest({
      grant_type: 'authorization_code',
      code: params.get('code'),
      redirect_uri: getRedirectUri(),
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: pkce.verifier
    });
    storeToken(data);
    return { handled: true, returnTo: pkce.returnTo };
  } catch (err) {
    return { handled: true, error: err.message };
  }
}

export function isLoggedIn() {
  return Boolean(load('token')?.refreshToken);
}

let refreshing = null;

export async function getAccessToken(forceRefresh = false) {
  const token = load('token');
  if (!token) throw new Error('not_logged_in');
  if (!forceRefresh && token.accessToken && Date.now() < token.expiresAt) {
    return token.accessToken;
  }
  if (!refreshing) {
    refreshing = tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
      client_id: SPOTIFY_CLIENT_ID
    }).then(data => { storeToken(data); return data.access_token; })
      .catch(err => { logout(); throw new Error('session_expired'); })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export function logout() {
  remove('token');
}
