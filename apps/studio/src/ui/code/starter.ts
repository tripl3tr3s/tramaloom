import type { LayerScript } from "@tramaloom/core";
import { SCRIPT_API } from "@tramaloom/core";

/**
 * The code a new Script layer starts with. It must run as it is, teach through its comments,
 * and draw lines a pen plotter can follow. `params` must match what the code declares
 * (test/script.test.ts compiles it to check).
 */
/** The Rings example, with its comments, name and settings in the studio's language. */
export function starterScript(lang: "en" | "es"): LayerScript {
  const c = (en: string, sp: string) => (lang === "es" ? sp : en);
  const label = c("Rings", "Anillos");
  const params = {
    rings: { kind: "int", label: c("Rings", "Anillos"), help: c("How many rings in each cell", "Cuántos anillos en cada celda"), min: 1, max: 12, default: 4 },
    wobble: { kind: "number", label: c("Wobble", "Temblor"), help: c("How far each ring strays from the centre", "Cuánto se aleja cada anillo del centro"), min: 0, max: 1, step: 0.01, default: 0.3 },
    ink: { kind: "color", label: c("Ink", "Tinta"), help: c("Color of the lines", "Color de las líneas"), default: "#1d3557" },
  } as const;
  const line = (name: keyof typeof params) => {
    const p = params[name];
    const range = p.kind === "color" ? "" : ` min: ${p.min}, max: ${p.max},${p.kind === "number" ? ` step: ${p.step},` : ""}`;
    return `    ${name}: { kind: "${p.kind}", label: "${p.label}", help: "${p.help}",${range} default: ${JSON.stringify(p.default)} },`;
  };
  const code = `// ${c("A script layer: your own drawing code. Edit anything and the picture redraws.", "Una capa de script: tu propio código de dibujo. Cambia lo que quieras y la imagen se redibuja.")}
// ${c("layer({ ... }) describes the layer: its name, its settings and how it draws.", "layer({ ... }) describe la capa: su nombre, sus controles y cómo dibuja.")}
layer({
  label: "${label}",

  // ${c("Each setting appears in the panel on the right, with vary and lock like any other.", "Cada control aparece en el panel de la derecha, con variar y fijar como cualquier otro.")}
  params: {
${line("rings")}
${line("wobble")}
${line("ink")}
  },

  // ${c("Runs once per picture. v holds this seed's value of each setting (v.rings, v.wobble, v.ink).", "Se ejecuta una vez por imagen. v tiene el valor de cada control para esta semilla (v.rings, v.wobble, v.ink).")}
  // ${c('ctx.rng("name") gives random numbers decided by the seed: same seed, same picture.', 'ctx.rng("nombre") da números al azar que decide la semilla: misma semilla, misma imagen.')}
  apply(scene, v, ctx) {
    const rng = ctx.rng("rings");
    const items = [];

    // ${c("The cells of the Grid layer above, or the whole frame when there is none.", "Las celdas de la capa Cuadrícula de arriba, o todo el marco si no hay ninguna.")}
    // ${c("Positions are measured so that the short side of the canvas is 1.", "Las posiciones se miden de modo que el lado corto del lienzo mide 1.")}
    const cells = scene.cells.length > 0 ? scene.cells : [scene.frame];

    for (const cell of cells) {
      const cx = cell.x + cell.w / 2;
      const cy = cell.y + cell.h / 2;
      const size = Math.min(cell.w, cell.h) / 2;
      for (let i = 1; i <= v.rings; i++) {
        const r = (size * i) / (v.rings + 1);
        const dx = (rng() - 0.5) * v.wobble * (size - r);
        const dy = (rng() - 0.5) * v.wobble * (size - r);
        // ${c("Shapes: rect, circle, polyline and dots. A stroke and no fill draws an outline.", "Figuras: rect, circle, polyline y dots. Con contorno y sin relleno se dibuja solo el borde.")}
        items.push({ type: "circle", cx: cx + dx, cy: cy + dy, r, stroke: v.ink, strokeWidth: 0.002 });
      }
    }

    // ${c("Hand the scene on with the new shapes added.", "Entrega la escena con las figuras nuevas.")}
    return addItems(scene, items);
  },
});
`;
  return { api: SCRIPT_API, label, code, params };
}

/** The English Rings example: what a new Script layer starts with when nothing else is chosen. */
export const STARTER_SCRIPT: LayerScript = starterScript("en");

/**
 * A blank script layer: the structure, with comments saying where settings and drawing go.
 * Comments follow the studio's language; it draws nothing until something is added.
 */
export function blankScript(lang: "en" | "es"): LayerScript {
  const es = lang === "es";
  const c = (en: string, sp: string) => (es ? sp : en);
  const label = c("My layer", "Mi capa");
  const code = `// ${c("Your own layer. Edit anything; the picture redraws as you type.", "Tu propia capa. Cambia lo que quieras; la imagen se redibuja mientras escribes.")}
layer({
  label: "${label}",

  // ${c("Settings shown in the panel on the right. For example:", "Controles que aparecen en el panel de la derecha. Por ejemplo:")}
  // size: { kind: "number", label: "Size", min: 0, max: 1, step: 0.01, default: 0.5 },
  params: {},

  // ${c("Runs once per picture: add shapes to items and return the scene.", "Se ejecuta una vez por imagen: agrega figuras a items y devuelve la escena.")}
  apply(scene, v, ctx) {
    const items = [];
    // ${c("For example, a circle in the middle of the canvas:", "Por ejemplo, un círculo en el centro del lienzo:")}
    // items.push({ type: "circle", cx: scene.width / 2, cy: scene.height / 2, r: 0.2, stroke: "#1d3557", strokeWidth: 0.004 });
    return addItems(scene, items);
  },
});
`;
  return { api: SCRIPT_API, label, code, params: {} };
}
