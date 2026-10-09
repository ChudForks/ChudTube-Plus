import {
  getSettings,
  onSettingsChanged,
  setSettings,
  SPONSOR_CATEGORIES,
  SPONSOR_SKIP_MODES,
} from "../lib/settings.js";

const MODE_LABELS = {
  auto: "Auto",
  button: "Button",
  off: "Off",
};
const MODE_TITLES = {
  auto: "Skip this category automatically",
  button: "Show a Skip button on the player",
  off: "Do nothing for this category",
};

const followAlong = document.getElementById("followAlongLyrics");
const customTheme = document.getElementById("customTheme");
const editCustomTheme = document.getElementById("editCustomTheme");
const customSwatches = document.getElementById("customSwatches");
const hideShorts = document.getElementById("hideShorts");
const hidePlayables = document.getElementById("hidePlayables");
const musicOledBlack = document.getElementById("musicOledBlack");
const sponsorBlockShowSegmentColors = document.getElementById("sponsorBlockShowSegmentColors");
const sponsorBlockCategories = document.getElementById("sponsorBlockCategories");

const settings = await getSettings();
renderSettings(settings);
onSettingsChanged(renderSettings);

sponsorBlockCategories.addEventListener("change", async (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== "radio") return;
  const category = input.name.replace(/^sponsorBlock-/, "");
  if (!SPONSOR_CATEGORIES.some((item) => item.id === category)) return;
  if (!SPONSOR_SKIP_MODES.includes(input.value)) return;
  const current = await getSettings();
  await setSettings({
    ...current,
    sponsorBlock: {
      ...current.sponsorBlock,
      categories: {
        ...current.sponsorBlock.categories,
        [category]: input.value,
      },
    },
  });
});

sponsorBlockShowSegmentColors.addEventListener("change", async () => {
  const current = await getSettings();
  await setSettings({
    ...current,
    sponsorBlock: {
      ...current.sponsorBlock,
      showSegmentColors: sponsorBlockShowSegmentColors.checked,
    },
  });
});

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

customTheme.addEventListener("change", async () => {
  await saveYoutubeTheme();
});

editCustomTheme.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CTP_OPEN_THEME_EDITOR" });
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

async function saveYoutubeTheme() {
  const current = await getSettings();
  await setSettings({
    ...current,
    youtube: {
      ...current.youtube,
      theme: customTheme.checked ? "custom" : "default",
    },
  });
}

function renderSettings(next) {
  followAlong.checked = Boolean(next.ytm.followAlongLyrics);
  customTheme.checked = next.youtube.theme === "custom";
  hideShorts.checked = Boolean(next.youtube.hideShorts);
  hidePlayables.checked = Boolean(next.youtube.hidePlayables);
  musicOledBlack.checked = next.ytm.theme === "oled-black";
  sponsorBlockShowSegmentColors.checked = Boolean(next.sponsorBlock.showSegmentColors);
  renderSponsorCategories(next.sponsorBlock.categories);
  renderCustomSwatches(next.youtube.customTheme);
}

function renderCustomSwatches(palette) {
  const colors = ["background", "surface", "accent", "text"].map((key) => palette?.[key]).filter(Boolean);
  customSwatches.replaceChildren(
    ...colors.map((color) => {
      const swatch = document.createElement("i");
      swatch.style.background = color;
      return swatch;
    })
  );
}

function renderSponsorCategories(categories) {
  sponsorBlockCategories.replaceChildren(
    ...SPONSOR_CATEGORIES.map((category) => {
      const row = document.createElement("div");
      row.className = "sb-category";

      const swatch = document.createElement("span");
      swatch.className = "sb-swatch";
      swatch.style.background = category.color;
      swatch.setAttribute("aria-hidden", "true");

      const name = document.createElement("span");
      name.className = "sb-name";
      name.textContent = category.label;
      name.title = category.description;

      const modes = document.createElement("div");
      modes.className = "sb-modes";
      modes.setAttribute("role", "radiogroup");
      modes.setAttribute("aria-label", `${category.label} skip mode`);
      const selected = categories?.[category.id] || "off";
      for (const mode of SPONSOR_SKIP_MODES) {
        const label = document.createElement("label");
        label.className = "sb-mode";
        label.title = MODE_TITLES[mode];
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `sponsorBlock-${category.id}`;
        input.value = mode;
        input.checked = selected === mode;
        input.setAttribute("aria-label", `${category.label} ${MODE_LABELS[mode]}`);
        const text = document.createElement("span");
        text.textContent = MODE_LABELS[mode];
        label.append(input, text);
        modes.append(label);
      }

      row.append(swatch, name, modes);
      return row;
    })
  );
}
