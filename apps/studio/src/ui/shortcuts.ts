import type { MessageKey } from "../i18n/messages.ts";

/** "Mod" renders as Ctrl, or as Cmd on Apple keyboards. */
export interface Shortcut {
  /** Alternatives; each one is a list of keys pressed together. */
  readonly combos: readonly (readonly string[])[];
  readonly does: MessageKey;
}

export interface ShortcutGroup {
  readonly title: MessageKey;
  readonly items: readonly Shortcut[];
}

/** Everything the studio answers to, in one place: the ? overlay reads it. Keep it in step with App.tsx. */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: "sc.seeds",
    items: [
      { combos: [["R"]], does: "sc.newSeed" },
      { combos: [["Left"], ["Right"]], does: "sc.prevNext" },
      { combos: [["C"]], does: "sc.copyHash" },
      { combos: [["B"]], does: "sc.star" },
    ],
  },
  {
    title: "sc.editing",
    items: [
      { combos: [["Mod", "Z"]], does: "sc.undo" },
      { combos: [["Mod", "Shift", "Z"], ["Mod", "Y"]], does: "sc.redo" },
      { combos: [["Alt", "Up"], ["Alt", "Down"]], does: "sc.moveLayer" },
      { combos: [["Arrows"], ["Page Up"], ["Page Down"]], does: "sc.nudge" },
    ],
  },
  {
    title: "sc.export",
    items: [
      { combos: [["S"]], does: "sc.png2000" },
      { combos: [["Shift", "S"]], does: "sc.png4000" },
    ],
  },
  {
    title: "sc.panels",
    items: [
      { combos: [["M"]], does: "sc.mutation" },
      { combos: [["L"]], does: "sc.library" },
      { combos: [["E"]], does: "sc.edition" },
      { combos: [["G"]], does: "sc.debug" },
      { combos: [["F"]], does: "sc.fullscreen" },
      { combos: [["T"]], does: "sc.tile" },
      { combos: [["?"]], does: "sc.thisList" },
      { combos: [["Esc"]], does: "sc.close" },
    ],
  },
  {
    title: "sc.mutation",
    items: [
      { combos: [["1-9"]], does: "sc.adopt" },
      { combos: [["R"], ["Space"]], does: "sc.shuffle" },
    ],
  },
];
