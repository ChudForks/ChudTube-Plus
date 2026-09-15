import { getSettings, setSettings } from "../lib/settings.js";

const followAlong = document.getElementById("followAlongLyrics");
const oledBlack = document.getElementById("oledBlack");
const hideShorts = document.getElementById("hideShorts");
const hidePlayables = document.getElementById("hidePlayables");
const musicOledBlack = document.getElementById("musicOledBlack");

const settings = await getSettings();
followAlong.checked = Boolean(settings.ytm.followAlongLyrics);
oledBlack.checked = settings.youtube.theme === "oled-black";
hideShorts.checked = Boolean(settings.youtube.hideShorts);
hidePlayables.checked = Boolean(settings.youtube.hidePlayables);
musicOledBlack.checked = settings.ytm.theme === "oled-black";

followAlong.addEventListener("change", async () => {
  const current = await getSettings();
  await setSettings({
    ...current,
    ytm: {
      ...current.ytm,
      followAlongLyrics: followAlong.checked,
    },
  });
});

oledBlack.addEventListener("change", async () => {
  const current = await getSettings();
  await setSettings({
    ...current,
    youtube: {
      ...current.youtube,
      theme: oledBlack.checked ? "oled-black" : "default",
    },
  });
});

hideShorts.addEventListener("change", async () => {
  const current = await getSettings();
  await setSettings({
    ...current,
    youtube: {
      ...current.youtube,
      hideShorts: hideShorts.checked,
    },
  });
});

hidePlayables.addEventListener("change", async () => {
  const current = await getSettings();
  await setSettings({
    ...current,
    youtube: {
      ...current.youtube,
      hidePlayables: hidePlayables.checked,
    },
  });
});

musicOledBlack.addEventListener("change", async () => {
  const current = await getSettings();
  await setSettings({
    ...current,
    ytm: {
      ...current.ytm,
      theme: musicOledBlack.checked ? "oled-black" : "default",
    },
  });
});
