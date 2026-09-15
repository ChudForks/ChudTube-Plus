(async () => {
  if (!/(^|\.)music\.youtube\.com$/i.test(location.hostname)) return;

  const mark = (text, error) => {
    console[error ? "error" : "info"]("[ChudTube+]", text, error || "");
    let el = document.getElementById("ctp-boot-status");
    if (!el) {
      el = document.createElement("div");
      el.id = "ctp-boot-status";
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = text;
    el.dataset.error = error ? "1" : "0";
  };

  try {
    mark("ChudTube+ loading…");
    await import(chrome.runtime.getURL("src/content/ytm-theme.js"));
    await import(chrome.runtime.getURL("src/content/ytm.js"));
  } catch (error) {
    mark(`ChudTube+ failed to load: ${error?.message || error}`, error);
  }
})();
