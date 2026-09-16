import { getSettings, onSettingsChanged } from "../lib/settings.js";
import "./sponsorblock.js";

const THEME_OLED = "oled-black";
const ATTR = "data-ctp-theme";
const STYLE_ID = "ctp-oled-style";
const DARK_ATTRS = ["dark", "darker-dark-theme"];
const OLED_RGB = new Set([15, 13, 18, 24, 33, 39]);
const OLED_VARS = {
  "--yt-spec-base-background": "#000",
  "--yt-spec-raised-background": "#000",
  "--yt-spec-menu-background": "#000",
  "--yt-spec-brand-background-solid": "#000",
  "--yt-spec-brand-background-primary": "#000",
  "--yt-spec-general-background-a": "#000",
  "--yt-spec-general-background-b": "#000",
  "--yt-spec-general-background-c": "#000",
  "--yt-sys-color-baseline--base-background": "#000",
  "--yt-sys-color-baseline--raised-background": "#000",
  "--yt-sys-color-baseline--menu-background": "#000",
};

const overridden = new Map();
let currentTheme = THEME_OLED;
const forcedDarkAttrs = new Set();
let remapTimer = 0;
let featureFilterTimer = 0;
let featureObserver = null;
let hideShorts = false;
let hidePlayables = false;
let started = false;
let sheetCss = "";

if (!/(^|\.)music\.youtube\.com$/i.test(location.hostname) && !globalThis.__ctpOledInit) {
  globalThis.__ctpOledInit = true;
  init();
}

async function init() {
  try {
    sheetCss = await fetch(chrome.runtime.getURL("src/content/yt.css")).then((res) => res.text());
  } catch (error) {
    console.warn("[ChudTube+] OLED stylesheet fetch failed", error);
  }
  const settings = await getSettings();
  applyYoutubeSettings(settings.youtube);
  onSettingsChanged((next) => applyYoutubeSettings(next.youtube));
  if (!started) bindPage();
}

function applyYoutubeSettings(settings) {
  applyTheme(settings.theme);
  const root = document.documentElement;
  hideShorts = Boolean(settings.hideShorts);
  hidePlayables = Boolean(settings.hidePlayables);
  root.toggleAttribute("data-ctp-hide-shorts", hideShorts);
  root.toggleAttribute("data-ctp-hide-playables", hidePlayables);
  syncFeatureObserver();
  scheduleFeatureFilter();
}

function bindPage() {
  started = true;
  document.addEventListener("yt-navigate-finish", scheduleRemap, true);
  document.addEventListener("yt-page-data-updated", scheduleRemap, true);
  window.addEventListener("yt-navigate-finish", scheduleRemap, true);
  document.addEventListener("yt-navigate-finish", scheduleFeatureFilter, true);
  document.addEventListener("yt-page-data-updated", scheduleFeatureFilter, true);
  window.addEventListener("yt-navigate-finish", scheduleFeatureFilter, true);

  const attrObs = new MutationObserver(() => {
    if (currentTheme !== THEME_OLED) return;
    const root = document.documentElement;
    if (root.getAttribute(ATTR) !== THEME_OLED) root.setAttribute(ATTR, THEME_OLED);
    ensureDark();
    scheduleRemap();
  });
  attrObs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["dark", "darker-dark-theme", ATTR],
  });

  const attachHost = () => {
    const host = document.querySelector("ytd-app");
    if (host) {
      attrObs.observe(host, { attributes: true, attributeFilter: ["style"] });
      scheduleRemap();
      return true;
    }
    return false;
  };
  if (!attachHost()) {
    const boot = new MutationObserver(() => {
      if (attachHost()) boot.disconnect();
    });
    boot.observe(document.documentElement, { childList: true, subtree: true });
  }

  const headObs = new MutationObserver(scheduleRemap);
  const watchHead = () => {
    if (document.head) headObs.observe(document.head, { childList: true });
  };
  if (document.head) watchHead();
  else document.addEventListener("DOMContentLoaded", watchHead, { once: true });

  window.setTimeout(scheduleRemap, 250);
  window.setTimeout(scheduleRemap, 1500);
  scheduleFeatureFilter();
}

function syncFeatureObserver() {
  if (!hideShorts && !hidePlayables) {
    featureObserver?.disconnect();
    featureObserver = null;
    return;
  }
  if (featureObserver) return;
  featureObserver = new MutationObserver(scheduleFeatureFilter);
  featureObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function scheduleFeatureFilter() {
  if (featureFilterTimer) return;
  featureFilterTimer = window.requestAnimationFrame(() => {
    featureFilterTimer = 0;
    applyFeatureFilters();
  });
}

function applyFeatureFilters() {
  const entries = document.querySelectorAll(
    "ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer"
  );
  for (const entry of entries) {
    const feature = featureForGuideEntry(entry);
    if ((feature === "shorts" && hideShorts) || (feature === "playables" && hidePlayables)) {
      entry.dataset.ctpHiddenFeature = feature;
    } else {
      delete entry.dataset.ctpHiddenFeature;
    }
  }
}

function featureForGuideEntry(entry) {
  const link = entry.querySelector("a[href]") || entry.shadowRoot?.querySelector("a[href]");
  const href = link?.getAttribute("href") || "";
  if (/^\/shorts(?:[/?#]|$)/.test(href)) return "shorts";
  if (/^\/playables(?:[/?#]|$)/.test(href)) return "playables";

  // Renderer data lives in YouTube's page world, which content scripts cannot
  // reliably read. The visible title is available in both worlds as a fallback.
  const title = (
    entry.querySelector("a[title]")?.getAttribute("title") || entry.textContent
  ).trim().toLowerCase();
  if (title === "shorts") return "shorts";
  if (title === "playables") return "playables";

  // Current guide entries use JavaScript navigation and omit href entirely.
  // The Shorts entry is identified by its stable reel watch endpoint instead.
  const data = entry.data;
  const endpoint = data?.serviceEndpoint || data?.navigationEndpoint || {};
  if (endpoint.reelWatchEndpoint) return "shorts";

  // Playables uses a browse endpoint whose exact ID varies by YouTube rollout.
  // Its endpoint data consistently contains the Playables route or identifier.
  try {
    if (JSON.stringify(endpoint).toLowerCase().includes("playables")) return "playables";
  } catch {
    // Ignore a malformed renderer while YouTube is replacing its guide.
  }
  return "";
}

function applyTheme(theme) {
  currentTheme = theme === THEME_OLED ? THEME_OLED : "default";
  const root = document.documentElement;
  if (currentTheme === THEME_OLED) {
    root.setAttribute(ATTR, THEME_OLED);
    ensureDark();
    mountSheet();
    stamp(true);
    remapTokens();
  } else {
    root.removeAttribute(ATTR);
    unmountSheet();
    stamp(false);
    clearRemap();
    releaseBootTheme();
    for (const name of forcedDarkAttrs) root.removeAttribute(name);
    forcedDarkAttrs.clear();
  }
}

function hosts() {
  return [
    document.documentElement,
    document.body,
    document.querySelector("ytd-app"),
  ].filter(Boolean);
}

function stamp(on) {
  for (const el of hosts()) {
    if (on) {
      el.style.setProperty("background", "#000", "important");
      el.style.setProperty("background-color", "#000", "important");
      el.style.setProperty("color-scheme", "dark", "important");
      for (const [name, value] of Object.entries(OLED_VARS)) {
        el.style.setProperty(name, value, "important");
      }
    } else {
      el.style.removeProperty("background");
      el.style.removeProperty("background-color");
      el.style.removeProperty("color-scheme");
      for (const name of Object.keys(OLED_VARS)) el.style.removeProperty(name);
    }
  }
}

function mountSheet() {
  if (!sheetCss) return;
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = sheetCss;
  }
  const parent = document.head || document.documentElement;
  if (style.parentNode !== parent) parent.appendChild(style);
}

function unmountSheet() {
  document.getElementById(STYLE_ID)?.remove();
}

function ensureDark() {
  if (currentTheme !== THEME_OLED) return;
  const root = document.documentElement;
  DARK_ATTRS.forEach((name) => {
    if (!root.hasAttribute(name)) {
      root.setAttribute(name, "");
      forcedDarkAttrs.add(name);
    }
  });
}

function releaseBootTheme() {
  const state = globalThis.__ctpOledBootState;
  if (!state) return;
  const root = document.documentElement;
  for (const name of state.darkAttributes || []) root.removeAttribute(name);
  for (const [name, previous] of state.styles || []) {
    if (previous.value) root.style.setProperty(name, previous.value, previous.priority);
    else root.style.removeProperty(name);
  }
  delete globalThis.__ctpOledBootState;
}

function scheduleRemap() {
  if (currentTheme !== THEME_OLED || remapTimer) return;
  remapTimer = window.requestAnimationFrame(() => {
    remapTimer = 0;
    stamp(true);
    remapTokens();
  });
}

function remapTokens() {
  if (currentTheme !== THEME_OLED) return;
  remapOn(document.documentElement);
  remapOn(document.body);
  remapDeep(document.querySelector("ytd-app"), 0);
}

function remapDeep(el, depth) {
  if (!el || depth > 3) return;
  remapOn(el);
  const root = el.shadowRoot;
  if (!root) return;
  for (const child of root.querySelectorAll("*")) {
    if (!child.tagName.includes("-") && !child.shadowRoot) continue;
    remapOn(child);
    if (child.shadowRoot) remapDeep(child, depth + 1);
  }
}

function remapOn(el) {
  if (!el) return;
  const styles = getComputedStyle(el);
  let bucket = overridden.get(el);
  if (!bucket) {
    bucket = new Set();
    overridden.set(el, bucket);
  }
  for (let i = 0; i < styles.length; i += 1) {
    const prop = styles[i];
    if (!prop.startsWith("--")) continue;
    if (!isYoutubeDarkGray(styles.getPropertyValue(prop))) continue;
    el.style.setProperty(prop, "#000", "important");
    bucket.add(prop);
  }
}

function clearRemap() {
  for (const [el, props] of overridden) {
    if (!el?.style) continue;
    for (const prop of props) el.style.removeProperty(prop);
  }
  overridden.clear();
}

function isYoutubeDarkGray(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return false;
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return r === g && g === b && OLED_RGB.has(r);
  }
  const rgb = v.match(/^rgba?\(\s*(\d+)\s*(?:,|\s)\s*(\d+)\s*(?:,|\s)\s*(\d+)/);
  if (rgb) {
    const r = Number(rgb[1]);
    const g = Number(rgb[2]);
    const b = Number(rgb[3]);
    return r === g && g === b && OLED_RGB.has(r);
  }
  return false;
}
