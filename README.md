# Top 2000 Disco

A browser-based music quiz for a Top 2000 disco night. The host connects Spotify and picks the Top 2000 playlist, then presses **Volgende nummer** to play a random song and **Onthul antwoord** to show the title, artist and original release year. The players handle the rest themselves; the app does no scoring, no judging and no challenge selection.

Runs as a static site on GitHub Pages. There is no backend and no build step.

## Features

- Spotify login with Authorization Code + PKCE (no client secret); the Client ID is entered in the app and stored on the device only, so nothing Spotify-related is committed
- Opens the default Top 2000 playlist automatically (`DEFAULT_PLAYLIST_ID` in `js/config.js`)
- Playlist picker and track import with pagination (only playlists you own or collaborate on, per Spotify's Development Mode rules)
- Random order without repeats; a skipped song counts as played; the session survives a page reload
- Playback in the browser (Web Playback SDK) on laptop/desktop, or via Spotify Connect to the Spotify app on an iPad/phone or a speaker
- Answer stays hidden until it is revealed: fixed page title, artwork only loaded on reveal, neutral media-session metadata
- Release years come from the official NPO Radio 2 Top 2000 list (`data/top2000-2025.json`). Songs not on the list fall back to the Spotify album year and are marked "nakijken"
- Metadata page (`beheer.html`) to review and correct years, with export to `songs.json` and CSV
- Dutch interface in a disco-poster design (Barlow Condensed + DM Sans, CSS-only vinyl artwork): minimal text, big Next song / Pause / Reveal answer buttons, album sleeve slides out of the record on reveal, flash and sparks, Top 2000 position shown with the answer
- 30-second timer while a song plays: follows pause, turns pink for the last 5 seconds, shows TIJD! at 0; setting *Muziek stopt bij 0* also pauses the music
- Setting *Start na het intro*: starts each song about 12% in (30 s for a typical 4-minute song; min 15 s, max 60 s, always at least a minute of music left)
- Sound at 0 (setting with preview): countdown ticks at 5 to 1 and a beep at 0 (default), game-show buzzer, gong, airhorn, record scratch or none; synthesised with Web Audio, no audio files
- Keyboard shortcuts: Space = pause, Right arrow = next song, Enter = reveal, F = fullscreen
- Next song is only available when nothing is playing (at the start, when paused, after the reveal or when the list is done)
- Fullscreen button in the header; the screen stays awake during the game (Wake Lock)
- Responsive (TV, laptop, tablet, phone)
- Always up to date: network-first service worker (cache only as offline fallback), automatic update check, one-time reload when a new version takes over (never mid-song), and an *App verversen* button in settings that clears all caches

## Requirements

- Spotify Premium (needed for the app owner in Development Mode and for playback)
- A Spotify playlist that you own (copy the Top 2000 songs into your own playlist; items of other people's playlists are not returned by the API)

## Setup

### 1. GitHub

1. Create a public repository, e.g. `top2000-disco`.
2. Upload all files (keep the folder structure, including `.github/workflows` and `.nojekyll`).
3. Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
4. Settings → Actions → General → Workflow permissions: *Read and write permissions* (for automatic releases).
5. Your app URL: `https://<username>.github.io/top2000-disco/`

### 2. Spotify Developer app

1. Go to https://developer.spotify.com/dashboard and create an app.
2. Redirect URIs (exact, with trailing slash):
   - `https://<username>.github.io/top2000-disco/`
   - optional for local testing: `http://127.0.0.1:8080/`
3. APIs used: **Web API** and **Web Playback SDK**.
4. User Management: add the Spotify account of the host (max 5 users in Development Mode).
5. Open the app, paste the **Client ID** on the setup screen and press *Koppelen*. It is stored in the browser of that device only (change it later under settings → *Client ID wijzigen*). Never put a client secret anywhere.

### 3. Run locally (optional)

```
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080/` (use 127.0.0.1, not localhost; Spotify requires a loopback IP for http redirects).

## Playing

- **Laptop:** choose *Deze browser* in settings (default). Connect the laptop to the speaker or TV.
- **iPad:** the Web Playback SDK does not run on iOS. Open the Spotify app on the iPad, play something briefly, then pick the iPad in settings → *Afspelen op* → *Vernieuw*. Keep the Spotify app running in the background.

## Release years

1. Official list: `data/top2000-2025.json` (converted from the NPO Excel file, 2000 songs with *Jaartal*). These years are treated as verified.
2. Songs in your playlist that are not on the list get the Spotify album year and the status *nakijken* (Spotify years can come from reissues or compilations).
3. Songs not on the list are marked red when the Spotify year probably belongs to a later version (new studio recording, re-recorded, remaster, anniversary, deluxe, live, greatest hits, compilation). Filter *Rood gemarkeerd* shows only those. For red songs only, *MusicBrainz (rood)* searches by title (without version noise) and artist and suggests the earliest release year; *Gebruik* confirms it. Each row also has a web search link for the original release year.
4. Correct years in `beheer.html`. Manual corrections apply to the Spotify track and to other versions of the same song (title + artist). Corrections are stored in the browser; use *Export songs.json* and commit it to `data/songs.json` to make them permanent for every device.

New edition: add `data/top2000-<year>.json` in the same format (`{ "edition", "entries": [{ "pos", "title", "artist", "year" }] }`) and update `TOP2000_LIST_FILE` in `js/config.js`.

## Project structure

```
index.html            game screen
beheer.html           metadata management
styles.css
sw.js                 network-first service worker (bump VERSION each release)
data/top2000-2025.json  official list with years
data/songs.json       exported corrections
js/config.js          version, default playlist, data files
js/auth.js            Spotify PKCE login and token refresh
js/spotify-api.js     Web API client
js/playlist.js        playlist selection and track import
js/player.js          Web Playback SDK and Spotify Connect
js/songs.js           metadata merge and export
js/years.js           list matching and year rules
js/shuffle.js         random order without repeats
js/game.js            state machine
js/timer.js           30-second countdown
js/sounds.js          timer sounds (Web Audio)
js/ui.js, js/app.js   rendering and wiring
js/beheer.js          metadata page
```

## Tokens and privacy

Tokens are stored in the browser's localStorage on the host device only. *Uitloggen* in settings removes them. Nothing is sent anywhere except to Spotify.

## Releases

On every push to `main`, a GitHub Action reads `APP_VERSION` from `js/config.js`. If no release exists for that version yet, it creates a release *Top 2000 Disco X.Y.Z* with the commit description as notes.
