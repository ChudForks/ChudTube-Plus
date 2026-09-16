import { getSettings, onSettingsChanged, setSettings } from "../lib/settings.js";
import {
  CUSTOM_THEME_FIELDS,
  CUSTOM_THEME_PRESETS,
  DEFAULT_CUSTOM_THEME,
  applyCustomThemeVars,
  contrastRatio,
  mergeCustomTheme,
  parseHexColor,
} from "../lib/theme.js";

const preview = document.getElementById("preview");
const colorFields = document.getElementById("colorFields");
const presetsEl = document.getElementById("presets");
const useOnYoutube = document.getElementById("useOnYoutube");
const resetColors = document.getElementById("resetColors");
const contrastHint = document.getElementById("contrastHint");
const saveStatus = document.getElementById("saveStatus");

const fields = new Map();
let palette = mergeCustomTheme();
let enabled = false;
let saveTimer = 0;
let statusTimer = 0;
let pendingWrite = 0;

renderFieldControls();
renderPresets();

const settings = await getSettings();
palette = mergeCustomTheme(settings.youtube.customTheme);
enabled = settings.youtube.theme === "custom";
syncControls();
paintPreview();

useOnYoutube.addEventListener("change", async () => {
  enabled = useOnYoutube.checked;
  await persist({ theme: enabled ? "custom" : "default", customTheme: palette });
  setStatus(enabled ? "On for YouTube" : "Saved, not applied on YouTube");
});

resetColors.addEventListener("click", () => {
  applyPalette({ ...DEFAULT_CUSTOM_THEME }, { persistNow: true });
});

for (const input of document.querySelectorAll('input[name="previewView"]')) {
  input.addEventListener("change", () => {
    if (input.checked) preview.dataset.view = input.value;
  });
}

onSettingsChanged((next) => {
  enabled = next.youtube.theme === "custom";
  useOnYoutube.checked = enabled;
  if (saveTimer || pendingWrite) return;
  palette = mergeCustomTheme(next.youtube.customTheme);
  syncControls();
  paintPreview();
});

function renderFieldControls() {
  colorFields.replaceChildren(
    ...CUSTOM_THEME_FIELDS.map((field) => {
      const row = document.createElement("label");
      row.className = "field";
      row.setAttribute("for", `color-${field.id}`);

      const copy = document.createElement("span");
      copy.className = "field-copy";
      const title = document.createElement("strong");
      title.textContent = field.label;
      const help = document.createElement("span");
      help.textContent = field.help;
      copy.append(title, help);

      const picker = document.createElement("input");
      picker.id = `color-${field.id}`;
      picker.type = "color";
      picker.setAttribute("aria-label", field.label);

      const hex = document.createElement("input");
      hex.className = "hex";
      hex.type = "text";
      hex.spellcheck = false;
      hex.maxLength = 7;
      hex.setAttribute("aria-label", `${field.label} hex`);

      picker.addEventListener("input", () => {
        applyPalette({ ...palette, [field.id]: picker.value });
      });
      hex.addEventListener("input", () => {
        const parsed = parseHexColor(hex.value);
        if (!parsed) return;
        applyPalette({ ...palette, [field.id]: parsed });
      });
      hex.addEventListener("blur", () => {
        hex.value = palette[field.id];
      });

      row.append(copy, picker, hex);
      fields.set(field.id, { picker, hex });
      return row;
    })
  );
}

function renderPresets() {
  presetsEl.replaceChildren(
    ...CUSTOM_THEME_PRESETS.map((preset) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preset";
      button.dataset.preset = preset.id;
      const bar = document.createElement("span");
      bar.className = "preset-bar";
      bar.setAttribute("aria-hidden", "true");
      for (const key of ["background", "surface", "accent", "text"]) {
        const swatch = document.createElement("i");
        swatch.style.background = preset.colors[key];
        bar.append(swatch);
      }
      const label = document.createElement("span");
      label.textContent = preset.label;
      button.append(bar, label);
      button.addEventListener("click", () => {
        applyPalette({ ...preset.colors }, { persistNow: true });
      });
      return button;
    })
  );
}

function applyPalette(next, { persistNow = false } = {}) {
  palette = mergeCustomTheme(next);
  syncControls();
  paintPreview();
  if (persistNow) {
    persist({ customTheme: palette });
    setStatus("Saved");
    return;
  }
  scheduleSave();
}

function syncControls() {
  useOnYoutube.checked = enabled;
  for (const field of CUSTOM_THEME_FIELDS) {
    const controls = fields.get(field.id);
    if (!controls) continue;
    controls.picker.value = palette[field.id];
    if (document.activeElement !== controls.hex) controls.hex.value = palette[field.id];
  }
  for (const button of presetsEl.querySelectorAll(".preset")) {
    const preset = CUSTOM_THEME_PRESETS.find((item) => item.id === button.dataset.preset);
    button.classList.toggle("is-active", Boolean(preset && samePalette(preset.colors, palette)));
  }
  const ratio = contrastRatio(palette.text, palette.background);
  if (ratio < 4.5) {
    contrastHint.hidden = false;
    contrastHint.textContent = `Primary text contrast is ${ratio.toFixed(1)}:1. Aim for at least 4.5:1.`;
  } else {
    contrastHint.hidden = true;
    contrastHint.textContent = "";
  }
}

function paintPreview() {
  applyCustomThemeVars(preview, palette);
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    persist({ customTheme: palette });
    setStatus("Saved");
  }, 120);
}

async function persist(partialYoutube) {
  pendingWrite += 1;
  try {
    const current = await getSettings();
    await setSettings({
      ...current,
      youtube: {
        ...current.youtube,
        ...partialYoutube,
      },
    });
  } finally {
    pendingWrite -= 1;
  }
}

function setStatus(text) {
  saveStatus.textContent = text;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    saveStatus.textContent = "Auto-saved";
  }, 1200);
}

function samePalette(left, right) {
  return CUSTOM_THEME_FIELDS.every((field) => left[field.id] === right[field.id]);
}
