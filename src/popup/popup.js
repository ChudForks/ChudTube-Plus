import { getSettings, setSettings } from "../lib/settings.js";

const followAlong = document.getElementById("followAlongLyrics");
const oledBlack = document.getElementById("oledBlack");
const musicOledBlack = document.getElementById("musicOledBlack");

const settings = await getSettings();
followAlong.checked = Boolean(settings.ytm.followAlongLyrics);
oledBlack.checked = settings.youtube.theme === "oled-black";
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
