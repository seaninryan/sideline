// Shown in the footer at the bottom of the app — bump on every deployed change so a stale cached page is obvious.
export const APP_VERSION = "v59";

// Brand lockup — shared across the public page, the poster image, and the OG card.
export const BRAND_HOME = "/";                       // home link target (relative — portable across prod/preview/localhost)
export const BRAND_SITE = "herewego.ie";             // domain, shown as text
export const BRAND_SITE_URL = "https://herewego.ie"; // clickable href on HTML surfaces
export const BRAND_WORDMARK = "HERE WE GO";
export const BRAND_CHANT = "Here we go · Here we go";

// swatch palette for the colour picker (common kit colours)
export const PALETTE = ["#f5c518", "#1f7a4d", "#0c3b2a", "#7a1f1f", "#c0392b", "#2c5fa8", "#1b2a4a", "#7ec8e3",
  "#ffffff", "#111111", "#e67e22", "#5e3a87", "#d4af37", "#888888", "#16a085", "#e91e63"];

// live-entry event buttons ("gaa" ones hide in goals-only mode)
export const LIVE_EVENTS = [
  { key: "goal", label: "Goal" },
  { key: "point", label: "Point", gaa: true },
  { key: "goalfree", label: "Goal · free" },
  { key: "pointfree", label: "Point · free", gaa: true },
  { key: "point65", label: "Point · '65", gaa: true },
  { key: "point45", label: "Point · '45", gaa: true },
  { key: "og", label: "Own goal" },
  { key: "yellow", label: "Yellow card" },
  { key: "red", label: "Red card" },
  { key: "corner", label: "Corner" },
  { key: "half", label: "Start half" },
  { key: "ht", label: "HT" },
  { key: "ft", label: "FT" },
];

export const LIVE_PLAYER_EVENTS = ["goal", "point", "goalfree", "pointfree", "point65", "point45", "og", "yellow", "red"];

// Selectable sports: dropdown emoji, display label, and the scoring mode each implies.
export const SPORTS: Record<string, { label: string; emoji: string; mode: string }> = {
  hurling: { label: "Hurling", emoji: "🏑", mode: "gaa" },
  camogie: { label: "Camogie", emoji: "🏑", mode: "gaa" },
  gaelic: { label: "Gaelic Football", emoji: "⚪", mode: "gaa" },
  soccer: { label: "Soccer", emoji: "⚽", mode: "goals" },
};
