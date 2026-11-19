/** Original palettes shipped with Gridloom (CC0). Order matters: zones window into it. */
export const PALETTES = {
  harbor: ["#0d1b2a", "#1b4b8a", "#2f7fd8", "#6cc3f0", "#f4efe1"],
  ember: ["#1a1414", "#7a1f1f", "#d9472b", "#f2a541", "#f7ebd3"],
  moss: ["#18201a", "#3f5a3a", "#8aa66b", "#d9d3a0", "#f3f0e3"],
  bloom: ["#2b193d", "#6b2d5c", "#c8507a", "#f39c8b", "#fce9d4"],
  signal: ["#101820", "#ff5a1f", "#ffd23f", "#3bceac", "#f6f7f2"],
  orchard: ["#26300f", "#6a8d2f", "#e0a526", "#c2402a", "#f5ecd7"],
  ink: ["#111111", "#4a4a4a", "#9a9a9a", "#e6e6e6", "#fafafa"],
  lagoon: ["#03256c", "#2541b2", "#1768ac", "#06bee1", "#e8f7fb"],
} as const satisfies Record<string, readonly string[]>;

export type PaletteName = keyof typeof PALETTES;
export const PALETTE_NAMES = Object.keys(PALETTES) as readonly PaletteName[];
