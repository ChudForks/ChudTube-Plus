# ChudTube+

Chromium extension that customizes YouTube and YouTube Music.

YouTube ships customizable themes (including an OLED preset) and optional, read-only **SponsorBlock** skip controls. YouTube Music ships the same skip options, an OLED player bar, and **Follow-along lyrics**, which uses official YouTube Music lyrics and timestamped, karaoke-style lines fetched from [LRCLIB](https://lrclib.net).

## What it does

### YouTube

- Themes → **Custom theme**: choose OLED or another preset, or pick page, card, text, and accent colors in a separate editor window with a live preview
- OLED pixels can turn off on the large surfaces (home, watch, sidebar, masthead)
- Matches YouTube's appearance to the selected theme's brightness
- **Hide Shorts**: removes Shorts shelves, cards, and navigation links
- **Hide Playables**: removes Playables shelves, cards, and navigation links
- Optional **SponsorBlock** skip controls read community timestamps for sponsors, intros, outros, and other categories
- Each category can auto-skip, show a Skip button on the player, or stay off
- Color-coded SponsorBlock timeline markers show each segment category and can be hidden independently
- Toggle it from the toolbar popup

### YouTube Music

- Themes → **True OLED black**: true `#000` persistent player bar instead of its gray surface
- Watches the current YouTube Music track
- Looks up synced lyrics on LRCLIB (`/api/get`, then `/api/search`)
- Uses the lyrics supplied by YouTube Music when LRCLIB has no synced match
- Turns the lyrics tab into a clean lyrics view, with timestamps when available
- Highlights the current line as the song plays
- Click a timed line to seek
- Optional **SponsorBlock** skip controls and colored segment markers also work during music playback
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
| YouTube → Themes → Custom theme | On (OLED preset) | Apply your selected preset or saved colors on youtube.com |
| YouTube → Themes → Edit colors | — | Opens a color picker window with a live Home/Watch preview |
| YouTube → Hide Shorts | Off | Remove Shorts from feeds and navigation |
| YouTube → Hide Playables | Off | Remove Playables from feeds and navigation |
| SponsorBlock → Skip categories | Button | Per category: Auto skips immediately, Button shows a Skip control on the player, Off leaves the segment alone |
| SponsorBlock → Show colored segment markers | On | Show each SponsorBlock category in its own color on the video timeline |
| YouTube Music → Themes → True OLED black | On | Pure `#000` persistent player bar on music.youtube.com |
| YouTube Music → Follow-along lyrics | On | Use YouTube Music lyrics plus timestamped LRCLIB lyrics in the lyrics tab |

## Permissions

- `storage` — save the settings and cache lyrics locally
- `scripting` — apply the OLED theme to already-open YouTube tabs
- `youtube.com` — apply themes
- `music.youtube.com` — read the player and replace the lyrics tab
- `lrclib.net` — fetch lyrics
- `sponsor.ajay.app` — fetch SponsorBlock timestamps when skip features or markers are enabled

No account, no analytics, no extra trackers. The SponsorBlock integration is read-only: it uses the recommended hash-prefix lookup and never submits segments, votes, view events, or user data. LRCLIB is queried with a `Lrclib-Client` header so the client is identifiable, as their API asks.

## Project layout

```
manifest.json
src/background.js          service worker, LRCLIB fetch + cache
src/lib/settings.js        synced settings
src/lib/theme.js           custom YouTube theme colors
src/theme-editor/          color picker and live preview window
src/lib/lrc.js             LRC parser
src/lib/lrclib.js          LRCLIB client
src/lib/ytm-track.js       now-playing metadata
src/content/yt.js          YouTube themes
src/content/sponsorblock.js read-only skip controller
src/content/yt.css
src/content/ytm.js         YouTube Music injection
src/lib/youtube-lyrics.js  YouTube Music lyric normalization
src/content/ytm.css
src/popup/                 toolbar popup
```
