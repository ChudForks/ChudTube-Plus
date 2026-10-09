# ChudTube+ for Firefox

This is a self-contained Firefox fork of ChudTube+. Its source, icons, manifest, and packaging script all live in this directory. The Chromium extension at the repository root is intentionally unchanged.

## Build

```powershell
./package-extension.ps1
```

This creates `ChudTube-Plus-Firefox.xpi` with `manifest.json` at the archive root, ready for Firefox development or signing workflows.

## Load during development

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on**.
3. Choose this directory's `manifest.json`.

Temporary add-ons are removed when Firefox closes. For persistent end-user installation, submit the generated XPI to Mozilla's signing process or install it through an enterprise policy.

## Firefox-specific choices

- Uses Firefox's Manifest V3 event-page background (`background.scripts`) because Firefox does not support extension service workers.
- Retains the `MAIN` content-script world for the YouTube Music playback bridge.
- Uses a Firefox-only Gecko extension ID, so its storage and installation identity remain distinct from the Chromium extension.
- Declares its required website-content transmission for the opt-in LRCLIB and SponsorBlock lookups in Firefox's install consent.
