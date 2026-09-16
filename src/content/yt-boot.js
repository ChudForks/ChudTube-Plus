(() => {
  if (/(^|\.)music\.youtube\.com$/i.test(location.hostname)) return;

  const loadTheme = () => {
    import(chrome.runtime.getURL("src/content/yt.js")).catch((error) => {
      console.error("[ChudTube+] OLED theme failed to load:", error);
    });
  };

  if (globalThis.__ctpOledBoot) {
    const apply = globalThis.__ctpApplyYoutubeSettings;
    if (typeof apply === "function") {
      chrome.storage.sync.get("settings", (result) => {
        try {
          apply(result?.settings?.youtube);
        } catch {
          loadTheme();
        }
      });
    } else {
      loadTheme();
    }
    return;
  }
  globalThis.__ctpOledBoot = true;

  const root = document.documentElement;
  const themeAttributes = ["dark", "darker-dark-theme"];
  const themeStyles = [
    "background",
    "background-color",
    "--yt-spec-base-background",
    "--yt-spec-raised-background",
    "--yt-sys-color-baseline--base-background",
  ];
  const bootState = {
    darkAttributes: [],
    styles: new Map(),
  };

  for (const name of themeAttributes) {
    if (root.hasAttribute(name)) continue;
    root.setAttribute(name, "");
    bootState.darkAttributes.push(name);
  }
  for (const name of themeStyles) {
    bootState.styles.set(name, {
      value: root.style.getPropertyValue(name),
      priority: root.style.getPropertyPriority(name),
    });
  }
  globalThis.__ctpOledBootState = bootState;
  root.setAttribute("data-ctp-theme", "oled-black");
  paintBoot("#000");

  chrome.storage.sync.get("settings", (result) => {
    const youtube = result?.settings?.youtube;
    root.toggleAttribute("data-ctp-hide-shorts", Boolean(youtube?.hideShorts));
    root.toggleAttribute("data-ctp-hide-playables", Boolean(youtube?.hidePlayables));
    if (youtube?.theme === "default") {
      restoreBootTheme();
      return;
    }
    if (youtube?.theme === "custom") {
      applyCustomBoot(youtube.customTheme);
    }
  });

  function paintBoot(background) {
    root.style.setProperty("background", background, "important");
    root.style.setProperty("background-color", background, "important");
    root.style.setProperty("--yt-spec-base-background", background, "important");
    root.style.setProperty("--yt-spec-raised-background", background, "important");
    root.style.setProperty("--yt-sys-color-baseline--base-background", background, "important");
  }

  function applyCustomBoot(customTheme) {
    const colors = customTheme && typeof customTheme === "object" ? customTheme : {};
    const background = parseHex(colors.background) || "#140f18";
    const surface = parseHex(colors.surface) || "#1f1828";
    const text = parseHex(colors.text) || "#f4f1ef";
    const muted = parseHex(colors.muted) || "#b4aeb8";
    const accent = parseHex(colors.accent) || "#ff695b";
    const hover = parseHex(colors.hover) || "#2b2338";
    const outline = parseHex(colors.outline) || "#3d344c";
    root.setAttribute("data-ctp-theme", "custom");
    paintBoot(background);
    root.style.setProperty("--ctp-custom-background", background);
    root.style.setProperty("--ctp-custom-surface", surface);
    root.style.setProperty("--ctp-custom-text", text);
    root.style.setProperty("--ctp-custom-muted", muted);
    root.style.setProperty("--ctp-custom-accent", accent);
    root.style.setProperty("--ctp-custom-hover", hover);
    root.style.setProperty("--ctp-custom-outline", outline);
    root.style.setProperty("color", text, "important");
    if (isLight(background)) {
      for (const name of themeAttributes) root.removeAttribute(name);
    }
  }

  function parseHex(value) {
    const raw = String(value || "").trim().toLowerCase();
    const hex = raw.startsWith("#") ? raw.slice(1) : raw;
    if (/^[0-9a-f]{3}$/.test(hex)) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
    return null;
  }

  function isLight(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
  }

  function restoreBootTheme() {
    root.removeAttribute("data-ctp-theme");
    for (const name of bootState.darkAttributes) root.removeAttribute(name);
    for (const [name, previous] of bootState.styles) {
      if (previous.value) root.style.setProperty(name, previous.value, previous.priority);
      else root.style.removeProperty(name);
    }
    delete globalThis.__ctpOledBootState;
  }

  loadTheme();
})();
