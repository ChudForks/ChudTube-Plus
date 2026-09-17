# ChudTube+

<p align="center">
  <img src="icons/icon128.png" width="96" alt="ChudTube+ icon">
</p>

<p align="center">
  A Chromium extension for making YouTube and YouTube Music feel more yours: OLED themes, content filters, follow-along lyrics, and optional SponsorBlock controls.
</p>

<p align="center">
  <a href="https://github.com/ChudForks/ChudTube-Plus/releases/latest/download/ChudTube-Plus.zip"><strong>Download ChudTube+</strong></a>
  &nbsp;·&nbsp;
  <a href="#install">Install</a>
  &nbsp;·&nbsp;
  <a href="#features">Features</a>
</p>

> **Experimental software.** Install only if you are comfortable enabling Developer mode in a Chromium browser. ChudTube+ is not distributed through the Chrome Web Store.

## Install

1. [Download the latest ZIP](https://github.com/ChudForks/ChudTube-Plus/releases/latest/download/ChudTube-Plus.zip) and unzip it somewhere permanent. Do not delete the extracted folder after installing.
2. Open your browser's extensions page:
   - Chrome / Brave / Opera: `chrome://extensions`
   - Edge: `edge://extensions`
3. Enable **Developer mode**.
4. Click **Load unpacked**, then select the extracted `ChudTube-Plus` folder.
5. Pin ChudTube+ from the browser toolbar, then visit [YouTube](https://www.youtube.com) or [YouTube Music](https://music.youtube.com).

GitHub downloads cannot be installed in Chromium with one click; Chromium reserves that privilege for its extension store or managed-browser policies. The steps above are the supported direct-from-GitHub route and take about a minute. To update, download and extract the newest ZIP over a new folder, then choose **Reload** on the extension card.

## Features

### YouTube

- Custom themes with OLED and other presets, plus a color editor with live preview
- True-black large surfaces for OLED displays
- Automatic light/dark appearance matching
- Hide Shorts, Playables, and their navigation links
- Optional, read-only SponsorBlock controls for sponsors, intros, outros, and other categories
- Per-category options: auto-skip, show a Skip button, or leave it off
- Optional color-coded SponsorBlock timeline markers

### YouTube Music

- True OLED-black persistent player bar
- Follow-along lyrics from official YouTube Music lyrics and LRCLIB
- Timestamped karaoke-style line highlighting when timing is available
- Click a timed lyric line to seek
- Unsynced lyric fallback when timestamps are unavailable
- The same optional SponsorBlock controls and timeline markers

## Settings

Click the ChudTube+ toolbar icon to change settings.

| Setting | Default | Effect |
| --- | --- | --- |
| YouTube → Themes → Custom theme | On (OLED) | Applies your saved YouTube theme |
| YouTube → Themes → Edit colors | — | Opens the live color editor |
| YouTube → Hide Shorts | Off | Removes Shorts from feeds and navigation |
| YouTube → Hide Playables | Off | Removes Playables from feeds and navigation |
| SponsorBlock → Skip categories | Button | Configure every category as Auto, Button, or Off |
| SponsorBlock → Show colored segment markers | On | Shows category-colored video timeline markers |
| YouTube Music → Themes → True OLED black | On | Uses a pure-black persistent player bar |
| YouTube Music → Follow-along lyrics | On | Replaces the lyrics tab with synced lyrics when available |

## Privacy and permissions

ChudTube+ has no account, analytics, or extra trackers.

- `storage` saves settings and cached lyrics locally.
- `scripting` applies your theme to already-open YouTube tabs.
- YouTube and YouTube Music permissions apply the extension where it is needed.
- [LRCLIB](https://lrclib.net) is queried for lyrics when required.
- [SponsorBlock](https://sponsor.ajay.app) is queried only for the optional skip features and markers.

The SponsorBlock integration is read-only: it uses the recommended hash-prefix lookup and never submits segments, votes, view events, or user data. LRCLIB requests identify the client with its requested `Lrclib-Client` header.

## For contributors

This is a Manifest V3 extension. Clone the repository, then use **Load unpacked** to select the repository folder while developing. The release ZIP can be built locally with:

```powershell
./scripts/package-extension.ps1
```

The command creates `ChudTube-Plus.zip`, containing only the installable extension files. Publishing a GitHub release automatically builds and attaches the same ZIP.

## Project layout

```
manifest.json                extension manifest
src/background.js            service worker; LRCLIB fetch and cache
src/lib/settings.js          synced settings
src/lib/theme.js             custom YouTube theme colors
src/theme-editor/            color picker and live preview window
src/content/yt.js            YouTube theme/content injection
src/content/sponsorblock.js  read-only skip controller
src/content/ytm.js           YouTube Music injection
src/lib/youtube-lyrics.js    YouTube Music lyric normalization
src/popup/                   toolbar popup
```

## License

No license has been selected yet. All rights are reserved until one is added.
