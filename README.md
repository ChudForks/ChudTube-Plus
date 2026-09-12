# ChudTube+

Chromium extension that customizes YouTube and YouTube Music.

This first version ships one YouTube Music setting: **Follow-along lyrics**. It replaces the native lyrics tab with timestamped, karaoke-style lines fetched from [LRCLIB](https://lrclib.net).

## What it does

- Watches the current YouTube Music track
- Looks up synced lyrics on LRCLIB (`/api/get`, then `/api/search`)
- Turns the lyrics tab into a follow-along view with timestamps
- Highlights the current line as the song plays
- Click a line to seek
- Falls back to unsynced LRCLIB text when timestamps are missing
- Toggle it from the toolbar popup

YouTube customizations are next. The settings shape already reserves a YouTube section.

## Load unpacked

1. Open Chrome, Edge, Brave, or another Chromium browser
2. Go to `chrome://extensions` (or `edge://extensions`)
3. Turn on **Developer mode**
4. Click **Load unpacked**
5. Select this folder (`ChudTube+`)
6. Open [YouTube Music](https://music.youtube.com), play a song, and open the **Lyrics** tab

The lyrics tab is re-enabled when YouTube Music disables it because it has no official lyrics.

## Settings

Click the ChudTube+ icon:

| Setting | Default | Effect |
| --- | --- | --- |
| YouTube Music → Follow-along lyrics | On | Inject timestamped LRCLIB lyrics into the lyrics tab |

## Permissions

- `storage` — save the setting and cache lyrics locally
- `music.youtube.com` — read the player and replace the lyrics tab
- `lrclib.net` — fetch lyrics

No account, no analytics, no extra trackers. LRCLIB is queried with a `Lrclib-Client` header so the client is identifiable, as their API asks.

## Project layout

```
manifest.json
src/background.js          service worker, LRCLIB fetch + cache
src/lib/settings.js        synced settings
src/lib/lrc.js             LRC parser
src/lib/lrclib.js          LRCLIB client
src/lib/ytm-track.js       now-playing metadata
src/content/ytm.js         YouTube Music injection
src/content/ytm.css
src/popup/                 toolbar popup
```
