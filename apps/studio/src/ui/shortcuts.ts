/** "Mod" renders as Ctrl, or as Cmd on Apple keyboards. */
export interface Shortcut {
  /** Alternatives; each one is a list of keys pressed together. */
  readonly combos: readonly (readonly string[])[];
  readonly does: string;
}

export interface ShortcutGroup {
  readonly title: string;
  readonly items: readonly Shortcut[];
}

/** Everything the studio answers to, in one place: the ? overlay reads it. Keep it in step with App.tsx. */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: "Seeds",
    items: [
      { combos: [["R"]], does: "New random seed" },
      { combos: [["Left"], ["Right"]], does: "Previous / next seed (the trail is remembered)" },
      { combos: [["C"]], does: "Copy the hash" },
    ],
  },
  {
    title: "Editing",
    items: [
      { combos: [["Mod", "Z"]], does: "Undo" },
      { combos: [["Mod", "Shift", "Z"], ["Mod", "Y"]], does: "Redo" },
      { combos: [["Alt", "Up"], ["Alt", "Down"]], does: "Move the focused layer up / down" },
      { combos: [["Arrows"], ["Page Up"], ["Page Down"]], does: "Nudge a focused slider" },
    ],
  },
  {
    title: "Export",
    items: [
      { combos: [["S"]], does: "PNG at 2000 px" },
      { combos: [["Shift", "S"]], does: "PNG at 4000 px" },
    ],
  },
  {
    title: "Panels",
    items: [
      { combos: [["M"]], does: "Mutation grid" },
      { combos: [["L"]], does: "Preset library" },
      { combos: [["E"]], does: "Edition: traits, census, contact sheet, mint" },
      { combos: [["G"]], does: "Debug panel" },
      { combos: [["F"]], does: "Fullscreen viewport" },
      { combos: [["?"]], does: "This list" },
      { combos: [["Esc"]], does: "Close the open panel" },
    ],
  },
  {
    title: "Mutation grid",
    items: [
      { combos: [["1-9"]], does: "Adopt that variant" },
      { combos: [["R"], ["Space"]], does: "Shuffle the variants" },
    ],
  },
];
