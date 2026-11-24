import { FREEFORM_ES } from "./freeform.es.ts";
import { GRID_ES } from "./grid.es.ts";
import { SETUP_ES } from "./setup.es.ts";
import type { ModuleTexts } from "./types.ts";

export const MODULES_ES: ModuleTexts = { ...SETUP_ES, ...GRID_ES, ...FREEFORM_ES };

/** Section headings in the settings panel, keyed by the English group name. */
export const GROUPS_ES: Readonly<Record<string, string>> = {
  Border: "Borde",
  Chladni: "Chladni",
  Color: "Color",
  Colors: "Colores",
  Dots: "Puntos",
  Field: "Campo",
  Figure: "Figura",
  Fill: "Relleno",
  Grain: "Grano",
  Harmonograph: "Armonógrafo",
  Interference: "Interferencia",
  Jitter: "Temblor",
  Knot: "Nudo",
  Landscape: "Paisaje",
  Layout: "Disposición",
  Line: "Línea",
  Lines: "Líneas",
  Look: "Aspecto",
  Mask: "Máscara",
  Maze: "Laberinto",
  Noise: "Ruido",
  Outline: "Contorno",
  Packing: "Empaque",
  Pattern: "Patrón",
  Placement: "Colocación",
  Routing: "Trazado",
  Rule: "Regla",
  Seeds: "Semillas",
  Shape: "Forma",
  Spiral: "Espiral",
  Spirograph: "Espirógrafo",
  Subdivision: "Subdivisión",
  Terminals: "Terminales",
  Threads: "Hilos",
  Waves: "Ondas",
  "Wire shape": "Forma del cable",
  Zones: "Zonas",
};

/** Built-in preset names, keyed by preset id. */
export const PRESETS_ES: Readonly<Record<string, string>> = {
  starter: "Inicio",
  breadboard: "Protoboard",
  weave: "Tejido",
  quilt: "Colcha",
  nest: "Nido",
  totem: "Tótem",
  labyrinth: "Dédalo",
  currents: "Corrientes",
  knotwork: "Entrelazado",
  topography: "Topografía",
  waterworks: "Cañerías",
  specimens: "Especímenes",
  resonance: "Resonancia",
  bloom: "Floración",
  chaos: "Caos",
};
