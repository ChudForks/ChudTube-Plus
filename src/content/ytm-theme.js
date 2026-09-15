import { getSettings, onSettingsChanged } from "../lib/settings.js";

const THEME_OLED = "oled-black";
const ATTR = "data-ctp-ytm-theme";

init();

async function init() {
  const settings = await getSettings();
  applyTheme(settings.ytm.theme);
  onSettingsChanged((next) => applyTheme(next.ytm.theme));
}

function applyTheme(theme) {
  const enabled = theme === THEME_OLED;
  document.documentElement.toggleAttribute(ATTR, enabled);
  if (enabled) document.documentElement.setAttribute(ATTR, THEME_OLED);
}
