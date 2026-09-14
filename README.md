# ChudTube+

Chromium extension that customizes YouTube and YouTube Music.

YouTube ships a **True OLED black** theme. YouTube Music ships **Follow-along lyrics**, which uses official YouTube Music lyrics and timestamped, karaoke-style lines fetched from [LRCLIB](https://lrclib.net).

## What it does

### YouTube

- Themes → **True OLED black**: true `#000` page chrome instead of YouTube's gray dark mode
- OLED pixels can turn off on the large surfaces (home, watch, sidebar, masthead)
- Forces YouTube's dark appearance while the theme is on
- Toggle it from the toolbar popup

### YouTube Music

- Watches the current YouTube Music track
- Looks up synced lyrics on LRCLIB (`/api/get`, then `/api/search`)
- Uses the lyrics supplied by YouTube Music when LRCLIB has no synced match
- Turns the lyrics tab into a clean lyrics view, with timestamps when available
- Highlights the current line as the song plays
- Click a timed line to seek
- Falls back to unsynced LRCLIB text when timestamps are missing
- Toggle it from the toolbar popup

## Load unpacked

1. Open Chrome, Edge, Brave, or another Chromium browser
2. Go to `chrome://extensions` (or `edge://extensions`)
3. Turn on **Developer mode**
4. Click **Load unpacked**
5. Select this folder (`ChudTube+`)
6. Open [YouTube](https://www.youtube.com) for the OLED theme, or [YouTube Music](https://music.youtube.com), play a song, and open the **Lyrics** tab

The lyrics tab is re-enabled when YouTube Music disables it because it has no official lyrics.

## Settings

Click the ChudTube+ icon:

| Setting | Default | Effect |
| --- | --- | --- |
| YouTube → Themes → True OLED black | On | Pure `#000` chrome on youtube.com |
| YouTube Music → Follow-along lyrics | On | Use YouTube Music lyrics plus timestamped LRCLIB lyrics in the lyrics tab |

## Permissions

- `storage` — save the settings and cache lyrics locally
- `scripting` — apply the OLED theme to already-open YouTube tabs
- `youtube.com` — apply themes
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
src/content/yt.js          YouTube themes
src/content/yt.css
src/content/ytm.js         YouTube Music injection
src/lib/youtube-lyrics.js  YouTube Music lyric normalization
src/content/ytm.css
src/popup/                 toolbar popup
```
