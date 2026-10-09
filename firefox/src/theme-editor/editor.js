import { getSettings, onSettingsChanged, setSettings } from "../lib/settings.js";
import {
  CUSTOM_THEME_FIELDS,
  CUSTOM_THEME_PRESETS,
  DEFAULT_CUSTOM_THEME,
  applyCustomThemeVars,
  contrastRatio,
  mergeCustomTheme,
  parseHexColor,
  youtubeThemePalette,
} from "../lib/theme.js";

const preview = document.getElementById("preview");
const colorFields = document.getElementById("colorFields");
const presetsEl = document.getElementById("presets");
const useOnYoutube = document.getElementById("useOnYoutube");
const resetColors = document.getElementById("resetColors");
const saveCustom = document.getElementById("saveCustom");
const applyPreset = document.getElementById("applyPreset");
const contrastHint = document.getElementById("contrastHint");
const saveStatus = document.getElementById("saveStatus");

const fields = new Map();
let palette = mergeCustomTheme();
let savedPalette = mergeCustomTheme();
let selectedPreset = "custom";
let activePreset = "custom";
let enabled = false;
let statusTimer = 0;
let pendingWrite = 0;

renderFieldControls();

const settings = await getSettings();
savedPalette = mergeCustomTheme(settings.youtube.customTheme);
selectedPreset = activePreset = settings.youtube.themePreset;
palette = youtubeThemePalette(settings.youtube);
enabled = settings.youtube.theme === "custom";
renderPresets();
syncControls();
paintPreview();
setStatus(defaultStatus());

useOnYoutube.addEventListener("change", async () => {
  enabled = useOnYoutube.checked;
  await persist({ theme: enabled ? "custom" : "default" });
  syncControls();
  setStatus(enabled ? "On for YouTube" : "Saved, not applied on YouTube");
});

applyPreset.addEventListener("click", async () => {
  const preset = selectedPreset;
  applyPreset.disabled = true;
  await persist({ theme: "custom", themePreset: preset });
  syncControls();
  setStatus(`${presetLabel(preset)} applied on YouTube`);
});

resetColors.addEventListener("click", () => {
  selectedPreset = "chudtube";
  applyPalette({ ...DEFAULT_CUSTOM_THEME });
});

saveCustom.addEventListener("click", async () => {
  const nextSavedPalette = { ...palette };
  saveCustom.disabled = true;
  await persist({ customTheme: nextSavedPalette, themePreset: "custom" });
  savedPalette = nextSavedPalette;
  selectedPreset = "custom";
  renderPresets();
  syncControls();
  setStatus("Saved in Custom");
});

for (const input of document.querySelectorAll('input[name="previewView"]')) {
  input.addEventListener("change", () => {
    if (input.checked) preview.dataset.view = input.value;
  });
}

onSettingsChanged((next) => {
  const presetChanged = activePreset !== next.youtube.themePreset;
  enabled = next.youtube.theme === "custom";
  activePreset = next.youtube.themePreset;
  useOnYoutube.checked = enabled;
  if (pendingWrite) return;
  const nextSavedPalette = mergeCustomTheme(next.youtube.customTheme);
  const hasUnsavedChanges = hasDraft();
  const customChanged = !samePalette(nextSavedPalette, savedPalette);
  savedPalette = nextSavedPalette;
  if (!hasUnsavedChanges) {
    if (presetChanged) selectedPreset = activePreset;
    if (presetChanged || selectedPreset === "custom") {
      palette = { ...presetPalette(CUSTOM_THEME_PRESETS.find((preset) => preset.id === selectedPreset)) };
    }
  }
  if (customChanged) renderPresets();
  syncControls();
  paintPreview();
  setStatus(defaultStatus());
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
      const colors = presetPalette(preset);
      for (const key of ["background", "surface", "accent", "text"]) {
        const swatch = document.createElement("i");
        swatch.style.background = colors[key];
        bar.append(swatch);
      }
      const label = document.createElement("span");
      label.textContent = preset.label;
      button.append(bar, label);
      button.addEventListener("click", () => {
        selectedPreset = preset.id;
        applyPalette({ ...presetPalette(preset) });
      });
      return button;
    })
  );
}

function applyPalette(next) {
  palette = mergeCustomTheme(next);
  syncControls();
  paintPreview();
  setStatus(defaultStatus());
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
    const selected = button.dataset.preset === selectedPreset;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  const hasUnsavedChanges = hasDraft();
  saveCustom.disabled = samePalette(palette, savedPalette);
  applyPreset.disabled = hasUnsavedChanges || (enabled && activePreset === selectedPreset);
  applyPreset.title = hasUnsavedChanges ? "Save edited colors to Custom before applying them" : "Apply this preset and keep your saved Custom colors";
  saveStatus.parentElement.classList.toggle("is-dirty", hasUnsavedChanges);
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

async function persist(partialYoutube) {
  pendingWrite += 1;
  try {
    const current = await getSettings();
    const next = await setSettings({
      ...current,
      youtube: {
        ...current.youtube,
        ...partialYoutube,
      },
    });
    enabled = next.youtube.theme === "custom";
    activePreset = next.youtube.themePreset;
  } finally {
    pendingWrite -= 1;
  }
}

function setStatus(text) {
  saveStatus.textContent = text;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    saveStatus.textContent = defaultStatus();
  }, 1200);
}

function presetPalette(preset) {
  return preset.id === "custom" ? savedPalette : preset.colors;
}

function presetLabel(id) {
  return CUSTOM_THEME_PRESETS.find((preset) => preset.id === id).label;
}

function hasDraft() {
  const preset = CUSTOM_THEME_PRESETS.find((item) => item.id === selectedPreset);
  return !samePalette(palette, presetPalette(preset));
}

function defaultStatus() {
  if (hasDraft()) return "Unsaved changes";
  if (selectedPreset === "custom") return "Saved in Custom";
  return enabled && selectedPreset === activePreset
    ? `${presetLabel(selectedPreset)} applied on YouTube`
    : `${presetLabel(selectedPreset)} preset · Ready to apply`;
}

function samePalette(left, right) {
  return CUSTOM_THEME_FIELDS.every((field) => left[field.id] === right[field.id]);
}
