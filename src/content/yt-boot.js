(() => {
  if (/(^|\.)music\.youtube\.com$/i.test(location.hostname)) return;
  if (globalThis.__ctpOledBoot) return;
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
  root.style.setProperty("background", "#000", "important");
  root.style.setProperty("background-color", "#000", "important");
  root.style.setProperty("--yt-spec-base-background", "#000", "important");
  root.style.setProperty("--yt-spec-raised-background", "#000", "important");
  root.style.setProperty("--yt-sys-color-baseline--base-background", "#000", "important");

  chrome.storage.sync.get("settings", (result) => {
    const youtube = result?.settings?.youtube;
    root.toggleAttribute("data-ctp-hide-shorts", Boolean(youtube?.hideShorts));
    root.toggleAttribute("data-ctp-hide-playables", Boolean(youtube?.hidePlayables));
    if (youtube?.theme === "default") {
      restoreBootTheme();
    }
  });

  function restoreBootTheme() {
    root.removeAttribute("data-ctp-theme");
    for (const name of bootState.darkAttributes) root.removeAttribute(name);
    for (const [name, previous] of bootState.styles) {
      if (previous.value) root.style.setProperty(name, previous.value, previous.priority);
      else root.style.removeProperty(name);
    }
    delete globalThis.__ctpOledBootState;
  }

  import(chrome.runtime.getURL("src/content/yt.js")).catch((error) => {
    console.error("[ChudTube+] OLED theme failed to load:", error);
  });
})();
