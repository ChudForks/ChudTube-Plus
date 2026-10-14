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
  &nbsp;·&nbsp;
  <a href="PRIVACY.md">Privacy policy</a>
</p>

> **Experimental software.** Install only if you are comfortable enabling Developer mode in a Chromium browser. ChudTube+ is not distributed through the Chrome Web Store.

A separate Firefox build lives in [`firefox/`](firefox/README.md). It has its own installation instructions and does not yet include all of the Chromium build's lyrics controls.

## Install

1. [Download the latest ZIP](https://github.com/ChudForks/ChudTube-Plus/releases/latest/download/ChudTube-Plus.zip) and unzip it somewhere permanent. Do not delete the extracted folder after installing.
2. Open your browser's extensions page:
   - Chrome / Brave / Opera: `chrome://extensions`
   - Edge: `edge://extensions`
3. Enable **Developer mode**.
4. Click **Load unpacked**, then select the extracted `ChudTube-Plus` folder.
5. Pin ChudTube+ from the browser toolbar, then visit [YouTube](https://www.youtube.com) or [YouTube Music](https://music.youtube.com).

GitHub downloads cannot be installed in Chromium with one click; Chromium reserves that privilege for its extension store or managed-browser policies. The steps above are the supported direct-from-GitHub route and take about a minute. To update, download and extract the newest ZIP over a new folder, then choose **Reload** on the extension card.

The release ZIP contains the code from its release tag. For changes on `master` that have not been released yet, clone or download the repository and load its root folder instead.

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
- Choose Automatic, built-in YouTube Music, or LRCLIB as your lyrics source
- Classic, OLED Bounce, and Compact lyrics themes
- Timestamped karaoke-style line highlighting when timing is available
- Click a timed lyric line to seek
- Unsynced lyric fallback when timestamps are unavailable
- The same optional SponsorBlock controls and timeline markers

## Settings

Click the ChudTube+ toolbar icon to change settings. In the theme editor, choose **ChudTube**, **OLED**, **Slate**, or **Custom**, then click **Apply preset**. Applying a preset keeps your saved Custom colors intact, including after closing the editor or disabling and re-enabling the theme. To replace Custom with the colors in the preview, explicitly click **Save to Custom**.

| Setting | Default | Effect |
| --- | --- | --- |
| YouTube → Themes → YouTube theme | On (OLED) | Applies your chosen preset or saved Custom colors |
| YouTube → Themes → Choose preset / Edit colors | — | Opens preset selection and the live color editor |
| YouTube → Hide Shorts | Off | Removes Shorts from feeds and navigation |
| YouTube → Hide Playables | Off | Removes Playables from feeds and navigation |
| SponsorBlock → Skip categories | Button | Configure every category as Auto, Button, or Off |
| SponsorBlock → Show colored segment markers | On | Shows category-colored video timeline markers |
| YouTube Music → Themes → True OLED black | On | Uses a pure-black persistent player bar |
| YouTube Music → Follow-along lyrics | On | Replaces the lyrics tab with synced lyrics when available |
| YouTube Music → Lyrics theme | Classic | Choose the original timestamp/progress view, pure-black OLED Bounce, or a compact layout |
| YouTube Music → Lyrics source | Automatic | Prefer LRCLIB timing with native lyric fallback, or use only YouTube Music or LRCLIB |

The **OLED Bounce** lyrics theme uses a pure-black panel, bold white active lyrics, dimmed surrounding lines, and a spring animation with staggered word entrances when each lyric becomes active. The animation moves the text without changing line spacing; the word entrance is a visual effect at each line's timestamp, rather than word-level timing. It has no artwork backdrop, gradients, or blur. OLED Bounce always uses full animation, including when system animations are disabled. Saved selections of the former YouTube Music (Mobile) theme automatically become OLED Bounce. Choose a source or theme directly from the controls at the top of the **Lyrics tab**, including while lyrics are loading or unavailable. These choices apply to this browser tab across songs without changing your saved extension defaults. Select **Default** in a menu to follow its setting in the extension popup again. Themes and sources are independent, and changes apply to the current song without refreshing the page. Built-in YouTube Music lyrics use the text available in the website's Lyrics tab; when that text has no timestamps, it stays static. Selecting **YouTube Music** as the source does not query LRCLIB.

## Privacy and permissions

Read the [privacy policy](PRIVACY.md) for the full data flows, storage details, and controls. ChudTube+ has no extension account, analytics, advertising trackers, or telemetry sent to the developer, but some features make third-party requests **by default**.

| Destination | What leaves your device | When |
| --- | --- | --- |
| [SponsorBlock](https://sponsor.ajay.app) | First four hexadecimal characters of the SHA-256 hash of the current video ID, `service=YouTube`, the eight supported categories, and `actionTypes=["skip"]` | For uncached videos while any category is Auto/Button or timeline markers are on; defaults are Button for every category and markers on |
| [LRCLIB](https://lrclib.net) | Song title, artist, album when available, rounded duration when available, and application-identifying headers | For uncached songs while follow-along lyrics are on and the Chromium source is Automatic or LRCLIB; defaults are lyrics on and Automatic. Firefox queries LRCLIB while follow-along lyrics are on |
| Browser sync provider | Saved theme colors/preset, content-filter settings, SponsorBlock options, and lyrics preferences supported by your build | When your browser supports and enables extension settings sync |
| YouTube Music artwork host | Request for the artwork URL read from the page, sometimes at a larger image size | When the lyrics panel displays artwork |

Network destinations also receive your connection's IP address and ordinary request metadata. The SponsorBlock hash prefix reduces how precisely a request identifies a video; it does not guarantee anonymity. ChudTube+ does not send SponsorBlock the full video ID, a SponsorBlock user ID, segment submissions, votes, or segment-view/skip reports. LRCLIB receives readable song metadata. Settings use `storage.sync`; lyrics and segment caches use `storage.local` and are not uploaded through settings sync.

To stop SponsorBlock lookups, set **every category to Off** and turn **Show colored segment markers off**. To stop LRCLIB lookups, turn **Follow-along lyrics off**; on Chromium you can instead choose **YouTube Music** as the lyrics source. A Lyrics-tab source override takes precedence over the saved default for that tab. These changes stop new lookups; a request already in progress can finish. Browser settings control settings sync separately.

- `storage` stores synced preferences and local caches.
- `scripting` applies themes to already-open YouTube and YouTube Music tabs.
- YouTube and YouTube Music host permissions let the extension read player/page information and modify those pages.
- LRCLIB and SponsorBlock host permissions allow the lookups described above.

## For contributors

This is a Manifest V3 extension. Clone the repository, then use **Load unpacked** to select the repository folder while developing. The release ZIP can be built locally with:

```powershell
./scripts/package-extension.ps1
```

The command creates `ChudTube-Plus.zip`, containing only the installable extension files. Publishing a GitHub release automatically builds and attaches the same ZIP.

The ZIP includes `PRIVACY.md`. To build the separate Firefox XPI from the repository root, run `./firefox/package-extension.ps1`; see the [Firefox README](firefox/README.md) for development and signing instructions.

## Project layout

```
manifest.json                extension manifest
PRIVACY.md                   privacy policy for both browser builds
src/background.js            service worker; LRCLIB/SponsorBlock lookups and caches
src/lib/settings.js          synced settings
src/lib/theme.js             custom YouTube theme colors
src/theme-editor/            color picker and live preview window
src/content/yt.js            YouTube theme/content injection
src/content/sponsorblock.js  read-only skip controller
src/content/ytm.js           YouTube Music injection
src/lib/youtube-lyrics.js    YouTube Music lyric normalization
src/popup/                   toolbar popup
firefox/                     separate Firefox manifest, source, and packaging
```

## License

No license has been selected yet. All rights are reserved until one is added.
