# ChudTube+ for Firefox

This is a separate Firefox fork of ChudTube+. Its source, icons, manifest, and packaging script live in this directory; both browser builds share the [privacy policy](../PRIVACY.md) at the repository root. Build from a full repository checkout so that policy can be included in the XPI.

## Build

```powershell
./package-extension.ps1
```

This creates `ChudTube-Plus-Firefox.xpi` with `manifest.json` and `PRIVACY.md` at the archive root, ready for Firefox development or signing workflows.

## Load during development

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on**.
3. Choose this directory's `manifest.json`.

Temporary add-ons are removed when Firefox closes. For persistent end-user installation, submit the generated XPI to Mozilla's signing process or install it through an enterprise policy.

## Firefox-specific choices

- Uses Firefox's Manifest V3 event-page background (`background.scripts`) because Firefox does not support extension service workers.
- Retains the `MAIN` content-script world for the YouTube Music playback bridge.
- Uses a Firefox-only Gecko extension ID, so its storage and installation identity remain distinct from the Chromium extension.
- Declares website-content transmission for LRCLIB and SponsorBlock lookups in Firefox's install consent. These lookups are enabled by the extension's defaults, rather than requiring a separate feature opt-in.

## Privacy and controls

Read the shared [privacy policy](../PRIVACY.md) for exactly what leaves your device. SponsorBlock receives a four-character video-ID hash prefix and fixed lookup parameters; LRCLIB receives the current song's title, artist, optional album, optional rounded duration, and application-identifying headers. Both services receive ordinary network metadata, including your connection's IP address. Saved extension preferences can also leave the device through Firefox Sync when enabled; lyrics and segment caches stay in local extension storage.

SponsorBlock categories default to **Button**, colored markers default to **On**, and follow-along lyrics default to **On**. To stop new SponsorBlock requests, set every category to **Off** and turn markers **Off**. To stop new LRCLIB requests, turn **Follow-along lyrics Off**. Unlike the Chromium build, this Firefox fork currently has no lyrics-source selector; using built-in lyrics as a fallback does not prevent LRCLIB lookups. A request already in progress can finish after a setting changes.
