import type { ParamText } from "./types.ts";

const RULES =
  "contraste: colores de la paleta que resaltan sobre lo de abajo; zona: los colores de la zona de la paleta en ese punto; paleta: cualquier color de la paleta; único: el color que pongas abajo";
const RAMP = "; escala: recorre la paleta en orden";

/**
 * The Color setting most drawing modules share (README: Color rules). `ramp` for the
 * modules that also step through the palette; `after` is a sentence that follows the rules.
 */
export const colorRule = ({ ramp = false, after = "" }: { readonly ramp?: boolean; readonly after?: string } = {}): ParamText => ({
  label: "Color",
  help: `${RULES}${ramp ? RAMP : ""}${after ? `. ${after}` : ""}`,
  options: { contrast: "contraste", zone: "zona", palette: "paleta", single: "único", ...(ramp ? { ramp: "escala" } : {}) },
});

export const singleColor: ParamText = { label: "Color único", help: "Se usa cuando Color está en único" };

export const NOISE_SCALE: ParamText = { label: "Escala del ruido", help: "Rasgos por ancho del lienzo" };

export const SHARE_OF_CELL = "Parte del tamaño de la celda";

export const LINE_WIDTH: ParamText = { label: "Grosor de línea", help: "Grosor de la línea, como parte del lado corto" };

export const STAY_IN_MASK: ParamText = { label: "Quedarse en la máscara", help: "Solo dibuja sobre las celdas que la máscara de la cuadrícula dejó" };

/** One large figure in the frame, or a small one in every cell. */
export const placement = (what: string): ParamText => ({
  label: "Colocación",
  help: `celdas: ${what} en cada celda de la cuadrícula`,
  options: { frame: "marco", cells: "celdas" },
});
