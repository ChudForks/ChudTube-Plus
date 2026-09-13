(() => {
  if (/(^|\.)music\.youtube\.com$/i.test(location.hostname)) return;
  if (globalThis.__ctpOledBoot) return;
  globalThis.__ctpOledBoot = true;

  const root = document.documentElement;
  root.setAttribute("data-ctp-theme", "oled-black");
  root.setAttribute("dark", "");
  root.setAttribute("darker-dark-theme", "");
  root.style.setProperty("background", "#000", "important");
  root.style.setProperty("background-color", "#000", "important");
  root.style.setProperty("--yt-spec-base-background", "#000", "important");
  root.style.setProperty("--yt-spec-raised-background", "#000", "important");
  root.style.setProperty("--yt-sys-color-baseline--base-background", "#000", "important");

  chrome.storage.sync.get("settings", (result) => {
    if (result?.settings?.youtube?.theme === "default") {
      root.removeAttribute("data-ctp-theme");
    }
  });

  import(chrome.runtime.getURL("src/content/yt.js")).catch((error) => {
    console.error("[ChudTube+] OLED theme failed to load:", error);
  });
})();
