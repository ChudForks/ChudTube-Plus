# ChudTube+ Privacy Policy

Effective date: October 13, 2026

This policy covers the Chromium extension at the repository root and the separate Firefox build in `firefox/`. It describes the code in this repository on the effective date; older release archives may behave differently. ChudTube+ is maintained by [ChudForks](https://github.com/ChudForks/ChudTube-Plus).

## Overview

ChudTube+ changes YouTube and YouTube Music pages in your browser. It has no extension account, analytics, advertising trackers, or telemetry endpoint operated by the developer. It does not send browsing or listening records to the developer or sell data. However, **SponsorBlock and LRCLIB lookups are enabled by default**, and saved preferences may be transmitted by your browser's settings-sync service. These requests can reveal information about the video or music you are using.

## Information used on your device

The extension reads the current YouTube video ID and relevant page/player information to show segment markers and skip controls. On YouTube Music it reads song title, artist, album, duration, artwork URLs, built-in lyrics, playback position/state, and player/tab visibility to display and synchronize lyrics. Themes and content filters inspect and modify the matching pages locally.

The YouTube Music bridge exchanges song metadata, playback updates, and seek commands through messages within the current page. These page messages are not network requests. The extension also uses internal browser-extension messages between its content scripts and background code. Local console diagnostics can include settings, song metadata, and errors; the extension does not upload those diagnostics automatically.

## What leaves your device

### SponsorBlock: segment lookups

ChudTube+ uses the third-party [SponsorBlock](https://sponsor.ajay.app) API at `https://sponsor.ajay.app/api/skipSegments/{prefix}` to retrieve community-marked segments for YouTube and YouTube Music.

For a video without a usable local cache entry, the extension hashes the video ID locally with SHA-256 and sends **only the first four hexadecimal characters of that hash** in the request path. The query also sends these fixed parameters:

- `service=YouTube`
- `categories=["sponsor","selfpromo","interaction","intro","outro","preview","music_offtopic","filler"]`
- `actionTypes=["skip"]`

All eight supported categories are requested regardless of which categories you enabled. Your per-category Auto/Button/Off choices and marker setting are applied locally and are not included in this request. SponsorBlock returns potential matches, and the extension selects the matching full video ID locally.

The extension does not send the full video ID or watch URL to SponsorBlock, generate or send a SponsorBlock user ID, submit segments or votes, or report views, skips, or playback position to that service. **The hash prefix does not guarantee anonymity:** it narrows the possible videos, and SponsorBlock and its network infrastructure receive your connection's IP address and ordinary request metadata. See [SponsorBlock's own privacy policy](https://gist.github.com/ajayyy/aa9f8ded2b573d4f73a3ffa0ef74f796) for its service practices; those are separate from this extension's behavior.

Requests occur while at least one category is Auto or Button, **or** colored timeline markers are enabled. Every category defaults to Button and markers default to On. Setting every category to Off alone does not stop requests if markers remain on.

### LRCLIB: lyrics lookups

ChudTube+ retrieves lyrics from the third-party [LRCLIB](https://lrclib.net) service. For a song without a usable local cache entry, it sends an HTTPS GET request to `https://lrclib.net/api/get` containing:

- `track_name`: the song title, with some common video-title labels removed.
- `artist_name`: the artist.
- `album_name`: the album, when available.
- `duration`: the rounded song duration in seconds, when available.

If the exact lookup does not provide a usable result, the extension may request `https://lrclib.net/api/search` with title and artist. Failed or rate-limited requests can be retried. Requests identify the application using `Lrclib-Client` and `X-User-Agent`, both currently set to the fixed string `ChudTube+/0.1.0`; this is a client label, not a personal or per-install identifier. The extension does not add your YouTube video ID, watch URL, artwork URL, playback position, account identity, or a listening-history list to these API requests. It does not publish lyrics to LRCLIB.

LRCLIB receives readable song metadata, your connection's IP address, and ordinary request metadata. A sequence of requests can reveal listening activity even though the extension does not upload a separate history file. See [LRCLIB's API documentation](https://lrclib.net/docs) for the service interface.

In Chromium, follow-along lyrics default to On and the source defaults to Automatic. Automatic and LRCLIB sources can query LRCLIB as songs change, including while the Lyrics tab is not open; built-in lyrics being available does not itself prevent a lookup. Selecting YouTube Music as the effective source prevents new LRCLIB lookups. A source selected within the Lyrics tab overrides the saved popup default for that browser tab until you select Default again or the page is reloaded.

In the Firefox fork, follow-along lyrics also default to On. That build queries LRCLIB while follow-along lyrics are enabled and can fall back to built-in YouTube Music lyrics. It currently has no source selector, so the built-in fallback does not prevent an LRCLIB request.

### Browser settings sync

Both builds save preferences using `chrome.storage.sync`. If your browser supports extension settings sync and you enable it, the browser may transmit these preferences to its sync provider and your other synced browser installations. Preferences include theme colors and preset, theme/content-filter toggles, SponsorBlock category modes and marker toggle, and follow-along lyrics preferences. Chromium also saves lyrics source and theme preferences; the current Firefox fork does not have those selectors.

Browser sync is managed by your browser and its provider, independently of ChudForks. See the [Chrome storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage#storage_areas) and [Firefox storage.sync documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/sync). Support and behavior differ among browsers. The extension does not put lyrics caches, segment caches, video IDs, or song lookup records into sync storage.

### YouTube Music, artwork, and links

Built-in lyrics are read from the YouTube Music page. The extension does not implement a separate YouTube lyrics API request, but normal site playback, navigation, and loading of the site's Lyrics tab remain subject to Google's services and [privacy policy](https://policies.google.com/privacy).

When its lyrics panel displays artwork, the extension uses an artwork URL read from the page, sometimes requesting a larger image size. This can cause an image request to the host in that URL, normally YouTube/Google image infrastructure. The image host receives the requested URL, your connection's IP address, and ordinary browser request metadata. These page-context image requests follow browser rules for cookies and referrers. Artwork is not sent to LRCLIB or SponsorBlock.

Opening an external service or support link makes a normal browser visit to that destination. Third-party API requests also carry browser-generated network information, potentially including a user-agent or origin header depending on the browser; the extension does not anonymize that traffic. ChudTube+ does not read your account cookies or attach your YouTube credentials to LRCLIB or SponsorBlock requests.

## Storage and retention on your device

Preferences remain in extension sync storage until changed or cleared through the browser. Lyrics and SponsorBlock results are saved in `chrome.storage.local`, not settings sync:

| Cache | Locally stored information | Reuse period |
| --- | --- | --- |
| Lyrics | Song lookup key, returned lyrics/metadata or lookup status, and fetch timestamp. Chromium keys include artist, title, album, and duration; Firefox keys include artist, title, and duration | Found/instrumental results: 7 days; not-found results: 30 minutes |
| SponsorBlock | Full video ID in the cache key, returned segment IDs/categories/times, and fetch timestamp | Results with segments: 1 hour; empty results: 10 minutes |

These caches can reveal recently looked-up songs or videos to someone with access to your browser profile. The reuse periods are **not automatic deletion deadlines**: expired entries are removed when that same key is read again, and unused entries can remain longer. Disabling a feature does not erase its existing cache or saved settings. The extension has no built-in cache-clear button. You can clear its storage using your browser's extension-development tools or remove the extension to clear local extension storage; browser backups, sync copies, and provider retention are controlled by the browser/provider. Clearing ordinary browsing history alone does not necessarily clear extension storage.

The developer does not control third-party server logs or retention and cannot delete information already received by SponsorBlock, LRCLIB, Google, or your browser sync provider. This policy makes no promise that those providers keep no logs.

## Your controls

- **Stop new SponsorBlock lookups:** set every SponsorBlock category to Off and turn Show colored segment markers Off in the popup.
- **Stop new LRCLIB lookups in either build:** turn Follow-along lyrics Off.
- **Keep the Chromium lyrics panel without LRCLIB:** choose YouTube Music as the source. If a Lyrics-tab override is active, change it to YouTube Music or select Default after changing the saved popup source.
- **Control preference uploads:** manage extension/settings sync through your browser's sync settings.
- **Stop extension activity:** disable or remove ChudTube+ through your browser's extension manager.

Changing settings stops new feature lookups but does not cancel an API request already in progress or remove data already sent. These controls do not stop YouTube/YouTube Music's own network activity.

## Permissions

`storage` supports preferences and local caches. `scripting` applies themes to already-open matching tabs. YouTube and YouTube Music host access supports reading the current page/player and changing its interface. LRCLIB and SponsorBlock host access supports the API requests above. The Firefox manifest also declares `websiteContent` transmission in its install-consent metadata for these lookups; that declaration does not mean the features are off by default.

## Questions and updates

For privacy questions, open an issue in the [ChudTube+ GitHub repository](https://github.com/ChudForks/ChudTube-Plus/issues). GitHub issues are public; share only information you want to make public. Information you choose to post is handled by GitHub and can be read by the project's maintainers.

Changes to data handling should be reflected in this file with an updated effective date. Check the policy shipped with your installed version and the repository for updates.
