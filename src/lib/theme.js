export const CUSTOM_THEME_FIELDS = [
  {
    id: "background",
    label: "Page background",
    help: "Home, watch, sidebar, and masthead",
  },
  {
    id: "surface",
    label: "Cards and menus",
    help: "Search, dialogs, and raised panels",
  },
  {
    id: "text",
    label: "Primary text",
    help: "Titles, buttons, and icons",
  },
  {
    id: "muted",
    label: "Secondary text",
    help: "Metadata, captions, and inactive icons",
  },
  {
    id: "accent",
    label: "Accent",
    help: "Subscribe, links, and progress bars",
  },
  {
    id: "hover",
    label: "Chips and hover",
    help: "Filter chips and hover fills",
  },
  {
    id: "outline",
    label: "Borders",
    help: "Search box and hairline outlines",
  },
];

export const CUSTOM_THEME_KEYS = CUSTOM_THEME_FIELDS.map((field) => field.id);

export const DEFAULT_CUSTOM_THEME = {
  background: "#140f18",
  surface: "#1f1828",
  text: "#f4f1ef",
  muted: "#b4aeb8",
  accent: "#ff695b",
  hover: "#2b2338",
  outline: "#3d344c",
};

export const OLED_PALETTE = {
  background: "#000000",
  surface: "#000000",
  text: "#f1f1f1",
  muted: "#aaaaaa",
  accent: "#ff0000",
  hover: "#1a1a1a",
  outline: "#222222",
};

export const CUSTOM_THEME_PRESETS = [
  { id: "chudtube", label: "ChudTube", colors: { ...DEFAULT_CUSTOM_THEME } },
  {
    id: "oled",
    label: "OLED",
    colors: { ...OLED_PALETTE },
  },
  {
    id: "slate",
    label: "Slate",
    colors: {
      background: "#0f172a",
      surface: "#1e293b",
      text: "#f8fafc",
      muted: "#94a3b8",
      accent: "#38bdf8",
      hover: "#334155",
      outline: "#475569",
    },
  },
  {
    id: "custom",
    label: "Custom",
  },
];

const CUSTOM_VAR_MAP = {
  background: "--ctp-custom-background",
  surface: "--ctp-custom-surface",
  text: "--ctp-custom-text",
  muted: "--ctp-custom-muted",
  accent: "--ctp-custom-accent",
  hover: "--ctp-custom-hover",
  outline: "--ctp-custom-outline",
};

export function parseHexColor(value) {
  const raw = String(value || "").trim().toLowerCase();
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  if (/^[0-9a-f]{8}$/.test(hex)) return `#${hex.slice(0, 6)}`;
  return null;
}

export function mergeCustomTheme(incoming) {
  const source = incoming && typeof incoming === "object" ? incoming : {};
  const next = { ...DEFAULT_CUSTOM_THEME };
  for (const key of CUSTOM_THEME_KEYS) {
    const parsed = parseHexColor(source[key]);
    if (parsed) next[key] = parsed;
  }
  return next;
}

export function hexToRgb(hex) {
  const parsed = parseHexColor(hex);
  if (!parsed) return null;
  return {
    r: parseInt(parsed.slice(1, 3), 16),
    g: parseInt(parsed.slice(3, 5), 16),
    b: parseInt(parsed.slice(5, 7), 16),
  };
}

export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const linear = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function isDarkColor(hex) {
  return relativeLuminance(hex) < 0.45;
}

export function contrastRatio(foreground, background) {
  const top = relativeLuminance(foreground);
  const bottom = relativeLuminance(background);
  const [hi, lo] = top > bottom ? [top, bottom] : [bottom, top];
  return (hi + 0.05) / (lo + 0.05);
}

export function customThemeCssVars(palette) {
  const next = mergeCustomTheme(palette);
  const vars = {
    "--ctp-custom-scheme": isDarkColor(next.background) ? "dark" : "light",
    "--ctp-theme-bg": next.background,
    "--ctp-theme-surface": next.surface,
    "--ctp-theme-text": next.text,
    "--ctp-theme-muted": next.muted,
    "--ctp-theme-accent": next.accent,
    "--ctp-theme-hover": next.hover,
    "--ctp-theme-outline": next.outline,
    "--ctp-theme-chip": next.hover,
  };
  for (const key of CUSTOM_THEME_KEYS) {
    vars[CUSTOM_VAR_MAP[key]] = next[key];
  }
  return vars;
}

export function applyCustomThemeVars(element, palette) {
  if (!element?.style) return mergeCustomTheme(palette);
  const vars = customThemeCssVars(palette);
  for (const [name, value] of Object.entries(vars)) {
    element.style.setProperty(name, value);
  }
  return mergeCustomTheme(palette);
}

export function youtubeSpecVars(palette, { textAndAccent = false } = {}) {
  const next = mergeCustomTheme(palette);
  const vars = {
    "--yt-spec-base-background": next.background,
    "--yt-spec-raised-background": next.surface,
    "--yt-spec-menu-background": next.surface,
    "--yt-spec-brand-background-solid": next.background,
    "--yt-spec-brand-background-primary": next.background,
    "--yt-spec-general-background-a": next.background,
    "--yt-spec-general-background-b": next.background,
    "--yt-spec-general-background-c": next.background,
    "--yt-sys-color-baseline--base-background": next.background,
    "--yt-sys-color-baseline--raised-background": next.surface,
    "--yt-sys-color-baseline--menu-background": next.surface,
  };
  if (textAndAccent) {
    vars["--yt-spec-text-primary"] = next.text;
    vars["--yt-spec-text-secondary"] = next.muted;
    vars["--yt-spec-text-disabled"] = next.muted;
    vars["--yt-spec-text-primary-inverse"] = next.background;
    vars["--yt-spec-call-to-action"] = next.accent;
    vars["--yt-spec-brand-link-text"] = next.accent;
    vars["--yt-spec-static-brand-red"] = next.accent;
    vars["--yt-spec-themed-blue"] = next.accent;
    vars["--yt-spec-base-blue"] = next.accent;
    vars["--yt-endpoint-color"] = next.accent;
    vars["--yt-spec-icon-inactive"] = next.muted;
    vars["--yt-spec-icon-active-other"] = next.text;
  }
  return vars;
}
