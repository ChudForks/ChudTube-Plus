import { getSettings, setSettings } from "../lib/settings.js";

const toggle = document.getElementById("followAlongLyrics");

const settings = await getSettings();
toggle.checked = Boolean(settings.ytm.followAlongLyrics);

toggle.addEventListener("change", async () => {
  const current = await getSettings();
  await setSettings({
    ...current,
    ytm: {
      ...current.ytm,
      followAlongLyrics: toggle.checked,
    },
  });
});
