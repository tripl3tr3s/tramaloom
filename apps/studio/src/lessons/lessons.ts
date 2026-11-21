/**
 * In-app lessons: short guided steps that change a script layer's code. Each step's code comes
 * from one function per lesson, given the language, so English and Spanish share every line of
 * logic and differ only in comments and labels (test/lessons.test.ts draws both to check).
 */
export type Lang = "en" | "es";
export type Text = Readonly<Record<Lang, string>>;

export interface LessonStep {
  readonly title: Text;
  /** Paragraphs separated by blank lines; `backticks` mark code. */
  readonly body: Text;
  /** The code once this step is done (Show me). Steps that only use the panel have none. */
  readonly code?: (lang: Lang) => string;
}

export interface Lesson {
  readonly id: string;
  readonly title: Text;
  readonly summary: Text;
  /** The code the lesson starts from. */
  readonly start: (lang: Lang) => string;
  readonly steps: readonly LessonStep[];
}

const t = (en: string, es: string): Text => ({ en, es });

// ---------------------------------------------------------------------------
// Lesson 1: your first grid

interface GridStage {
  readonly r: "quarter" | "half";
  readonly shape: "circle" | "square";
  readonly palette: boolean;
  readonly setting: boolean;
}

function gridCode(lang: Lang, stage: GridStage): string {
  const es = lang === "es";
  const c = (en: string, sp: string) => (es ? sp : en);
  const params = stage.setting
    ? `{
    size: { kind: "number", label: "${c("Size", "Tamaño")}", help: "${c("How much of each cell the shape covers", "Cuánto de cada celda cubre la figura")}", min: 0.1, max: 1, step: 0.05, default: 0.8 },
  }`
    : "{}";
  const color = stage.palette ? "colors[cell.col % colors.length]" : `"#e76f51"`;
  const paletteLines = stage.palette
    ? `    // ${c("The colors of the Palette layer, or one color when there is none.", "Los colores de la capa Paleta, o uno solo si no hay.")}
    const colors = scene.palette ? scene.palette.colors : ["#e76f51"];
`
    : "";
  const size = stage.setting ? "Math.min(cell.w, cell.h) * v.size" : "Math.min(cell.w, cell.h) * 0.8";
  const shape =
    stage.shape === "circle"
      ? `      items.push({ type: "circle", cx, cy, r: cell.w / ${stage.r === "quarter" ? 4 : 2}, fill: ${color} });`
      : `      const s = ${size};
      items.push({ type: "rect", x: cx - s / 2, y: cy - s / 2, w: s, h: s, fill: ${color} });`;
  return `// ${c("Lesson: your first grid. Every change redraws the picture.", "Lección: tu primera cuadrícula. Cada cambio vuelve a dibujar.")}
layer({
  label: "${c("My grid", "Mi cuadrícula")}",
  params: ${params},
  apply(scene, v, ctx) {
    const items = [];
${paletteLines}    // ${c("One pass for every cell of the Grid layer above.", "Una vuelta por cada celda de la capa Cuadrícula de arriba.")}
    for (const cell of scene.cells) {
      // ${c("The centre of the cell.", "El centro de la celda.")}
      const cx = cell.x + cell.w / 2;
      const cy = cell.y + cell.h / 2;
${shape}
    }
    return addItems(scene, items);
  },
});
`;
}

const GRID_START: GridStage = { r: "quarter", shape: "circle", palette: false, setting: false };
const GRID_1: GridStage = { ...GRID_START, r: "half" };
const GRID_2: GridStage = { ...GRID_1, shape: "square" };
const GRID_3: GridStage = { ...GRID_2, palette: true };
const GRID_4: GridStage = { ...GRID_3, setting: true };

const firstGrid: Lesson = {
  id: "first-grid",
  title: t("Your first grid", "Tu primera cuadrícula"),
  summary: t(
    "Draw a shape in every cell, give it the palette's colors and add your own setting.",
    "Dibuja una figura en cada celda, dale los colores de la paleta y agrega tu propio control.",
  ),
  start: (lang) => gridCode(lang, GRID_START),
  steps: [
    {
      title: t("One circle per cell", "Un círculo por celda"),
      body: t(
        "The Grid layer above splits the canvas into cells. `scene.cells` lists them, each with a position (`x`, `y`) and a size (`w`, `h`). The `for` loop runs once per cell and adds a circle at its centre.\n\nPositions are measured so that the short side of the canvas is 1, so a cell might be 0.1 wide.\n\nTry it: change `cell.w / 4` to `cell.w / 2`. The circles grow until they touch.",
        "La capa Cuadrícula de arriba divide el lienzo en celdas. `scene.cells` las enumera, cada una con una posición (`x`, `y`) y un tamaño (`w`, `h`). El ciclo `for` da una vuelta por celda y agrega un círculo en su centro.\n\nLas posiciones se miden de modo que el lado corto del lienzo vale 1, así que una celda puede medir 0.1 de ancho.\n\nPruébalo: cambia `cell.w / 4` por `cell.w / 2`. Los círculos crecen hasta tocarse.",
      ),
      code: (lang) => gridCode(lang, GRID_1),
    },
    {
      title: t("Squares instead", "Ahora cuadrados"),
      body: t(
        "A shape is an object with a `type`. Besides `circle` there are `rect`, `polyline` (lines) and `dots`.\n\nA `rect` is placed by its top-left corner (`x`, `y`) and its size (`w`, `h`). To centre a square of side `s`, start it at `cx - s / 2`.\n\nPress Show me to see it written out.",
        "Una figura es un objeto con un `type`. Además de `circle` existen `rect`, `polyline` (líneas) y `dots`.\n\nUn `rect` se coloca por su esquina superior izquierda (`x`, `y`) y su tamaño (`w`, `h`). Para centrar un cuadrado de lado `s`, empiézalo en `cx - s / 2`.\n\nPresiona Muéstrame para verlo escrito.",
      ),
      code: (lang) => gridCode(lang, GRID_2),
    },
    {
      title: t("The palette's colors", "Los colores de la paleta"),
      body: t(
        "`scene.palette.colors` is the list of colors of the Palette layer. `cell.col` is the cell's column number, and `%` (remainder) wraps it around the list, so each column takes the next color.\n\nTry `cell.row` instead of `cell.col`, then `cell.col + cell.row` for diagonals. Change the palette in the Palette layer and your layer follows.",
        "`scene.palette.colors` es la lista de colores de la capa Paleta. `cell.col` es el número de columna de la celda, y `%` (residuo) lo hace dar la vuelta a la lista, así que cada columna toma el siguiente color.\n\nPrueba `cell.row` en vez de `cell.col`, y luego `cell.col + cell.row` para diagonales. Cambia la paleta en la capa Paleta y tu capa la sigue.",
      ),
      code: (lang) => gridCode(lang, GRID_3),
    },
    {
      title: t("Your own setting", "Tu propio control"),
      body: t(
        "`params` declares settings. Each one appears in the panel on the right, with a slider, help text, vary and lock, like the built-in layers.\n\nInside `apply`, `v.size` holds the setting's value for this seed. Show me adds a Size setting; move its slider and watch the squares change.",
        "`params` declara controles. Cada uno aparece en el panel de la derecha, con su barra, su ayuda, vary y lock, igual que las capas incluidas.\n\nDentro de `apply`, `v.size` tiene el valor del control para esta semilla. Muéstrame agrega un control Tamaño; mueve su barra y mira cómo cambian los cuadrados.",
      ),
      code: (lang) => gridCode(lang, GRID_4),
    },
  ],
};

// ---------------------------------------------------------------------------
// Lesson 2: seeds and randomness

interface SeedStage {
  readonly random: boolean;
  readonly gaps: boolean;
  readonly streams: boolean;
}

function seedCode(lang: Lang, stage: SeedStage): string {
  const es = lang === "es";
  const c = (en: string, sp: string) => (es ? sp : en);
  const fillParam = stage.gaps
    ? `
    fill: { kind: "number", label: "${c("Fill", "Relleno")}", help: "${c("Chance that a cell gets a square", "Probabilidad de que una celda tenga cuadrado")}", min: 0, max: 1, step: 0.05, default: 0.7 },`
    : "";
  const streams = stage.streams
    ? `    // ${c("One random stream per decision: changing one leaves the others alone.", "Una fuente de azar por decisión: cambiar una no altera las demás.")}
    const sizes = ctx.rng("size");
    const picks = ctx.rng("pick");
    const tints = ctx.rng("color");
`
    : stage.random
      ? `    // ${c("Random numbers from 0 to 1, decided by the seed.", "Números al azar de 0 a 1, decididos por la semilla.")}
    const rng = ctx.rng("size");
`
      : "";
  const sizeRng = stage.streams ? "sizes" : "rng";
  const sizeExpr = stage.random ? `Math.min(cell.w, cell.h) * v.size * ${sizeRng}()` : "Math.min(cell.w, cell.h) * v.size";
  const colorExpr = stage.streams ? "colors[int(tints, 0, colors.length - 1)]" : "colors[cell.col % colors.length]";
  // With one stream per decision, every cell draws its size and color before the skip, so Fill
  // never shifts them. Before that step the skip comes first, which is what the lesson shows.
  const body = stage.streams
    ? `      // ${c("Every cell draws its size and color, kept or not: Fill never shifts them.", "Cada celda sortea su tamaño y color, se quede o no: Relleno nunca los recorre.")}
      const s = ${sizeExpr};
      const color = ${colorExpr};
      if (!chance(picks, v.fill)) continue;
      const cx = cell.x + cell.w / 2;
      const cy = cell.y + cell.h / 2;
      items.push({ type: "rect", x: cx - s / 2, y: cy - s / 2, w: s, h: s, fill: color });`
    : `${stage.gaps ? "      if (!chance(rng, v.fill)) continue;\n" : ""}      const cx = cell.x + cell.w / 2;
      const cy = cell.y + cell.h / 2;
      const s = ${sizeExpr};
      items.push({ type: "rect", x: cx - s / 2, y: cy - s / 2, w: s, h: s, fill: ${colorExpr} });`;
  return `// ${c("Lesson: seeds and randomness. Press R for a new seed, Left to go back.", "Lección: semillas y azar. Presiona R para otra semilla y la flecha izquierda para volver.")}
layer({
  label: "${c("Seeds", "Semillas")}",
  params: {
    size: { kind: "number", label: "${c("Size", "Tamaño")}", help: "${c("How much of each cell the shape covers", "Cuánto de cada celda cubre la figura")}", min: 0.1, max: 1, step: 0.05, default: 0.8 },${fillParam}
  },
  apply(scene, v, ctx) {
    const items = [];
    const colors = scene.palette ? scene.palette.colors : ["#e76f51"];
${streams}    for (const cell of scene.cells) {
${body}
    }
    return addItems(scene, items);
  },
});
`;
}

const SEED_START: SeedStage = { random: false, gaps: false, streams: false };
const SEED_1: SeedStage = { ...SEED_START, random: true };
const SEED_2: SeedStage = { ...SEED_1, gaps: true };
const SEED_3: SeedStage = { ...SEED_2, streams: true };

const seeds: Lesson = {
  id: "seeds",
  title: t("Seeds and randomness", "Semillas y azar"),
  summary: t(
    "Let the seed decide sizes and colors, so every seed is a new picture you can always get back.",
    "Deja que la semilla decida tamaños y colores, para que cada semilla sea una imagen nueva que siempre puedes recuperar.",
  ),
  start: (lang) => seedCode(lang, SEED_START),
  steps: [
    {
      title: t("Random sizes", "Tamaños al azar"),
      body: t(
        "`ctx.rng(\"size\")` gives a function: each call returns a number from 0 to 1. Show me multiplies each square's size by one of them.\n\nNow press R a few times: a new seed, a new picture. Press the Left arrow to go back: the same seed always draws the same picture. That is what makes a piece repeatable, and shareable.",
        "`ctx.rng(\"size\")` da una función: cada llamada devuelve un número de 0 a 1. Muéstrame multiplica el tamaño de cada cuadrado por uno de ellos.\n\nAhora presiona R varias veces: otra semilla, otra imagen. Presiona la flecha izquierda para volver: la misma semilla siempre dibuja la misma imagen. Eso hace que una pieza se pueda repetir y compartir.",
      ),
      code: (lang) => seedCode(lang, SEED_1),
    },
    {
      title: t("Some cells empty", "Algunas celdas vacías"),
      body: t(
        "`chance(rng, p)` is true with probability `p`. Show me adds a Fill setting and skips a cell (`continue`) when the chance says no.\n\nMove the Fill slider. Notice that the sizes of the squares that stay also change: the skipped draws shift every number after them.",
        "`chance(rng, p)` es verdadero con probabilidad `p`. Muéstrame agrega un control Relleno y salta una celda (`continue`) cuando el azar dice que no.\n\nMueve la barra de Relleno. Fíjate que también cambian los tamaños de los cuadrados que quedan: los sorteos que se saltan recorren todos los números que siguen.",
      ),
      code: (lang) => seedCode(lang, SEED_2),
    },
    {
      title: t("One stream per decision", "Una fuente por decisión"),
      body: t(
        "Give each decision its own stream: `ctx.rng(\"size\")`, `ctx.rng(\"pick\")`, `ctx.rng(\"color\")`. The name picks the stream, and streams never disturb each other.\n\nEach cell also draws its size and color before deciding whether to skip, so every cell uses the same number of draws. Now Fill only decides which cells are empty; sizes and colors stay put. Colors are picked at random too, with `int(rng, 0, n - 1)`.",
        "Dale a cada decisión su propia fuente: `ctx.rng(\"size\")`, `ctx.rng(\"pick\")`, `ctx.rng(\"color\")`. El nombre elige la fuente, y las fuentes nunca se estorban.\n\nAdemás, cada celda sortea su tamaño y su color antes de decidir si se salta, así que todas usan la misma cantidad de sorteos. Ahora Relleno solo decide qué celdas quedan vacías; tamaños y colores se quedan quietos. Los colores también se eligen al azar, con `int(rng, 0, n - 1)`.",
      ),
      code: (lang) => seedCode(lang, SEED_3),
    },
    {
      title: t("Let the seed choose a setting", "Que la semilla elija un control"),
      body: t(
        "No code this time. In the panel on the right, click vary on Size and drag the two ends of its range. Each seed now picks its own size inside that range.\n\nPress R a few times. With vary, one piece of code becomes a family of pictures: that is the heart of generative art.",
        "Esta vez no hay código. En el panel de la derecha, haz clic en vary en Tamaño y arrastra los dos extremos de su rango. Ahora cada semilla elige su propio tamaño dentro de ese rango.\n\nPresiona R varias veces. Con vary, un mismo código se vuelve una familia de imágenes: ese es el corazón del arte generativo.",
      ),
    },
  ],
};

// ---------------------------------------------------------------------------
// Lesson 3: smooth noise

interface NoiseStage {
  readonly smooth: boolean;
  readonly scale: boolean;
  readonly colors: boolean;
  readonly lines: boolean;
}

function noiseCode(lang: Lang, stage: NoiseStage): string {
  const es = lang === "es";
  const c = (en: string, sp: string) => (es ? sp : en);
  const scaleParam = stage.scale
    ? `
    scale: { kind: "number", label: "${c("Scale", "Escala")}", help: "${c("Low: wide, gentle waves. High: busy, small ones", "Baja: ondas amplias y suaves. Alta: pequeñas y agitadas")}", min: 0.5, max: 12, step: 0.5, default: 4 },
  `
    : "";
  const zoom = stage.scale ? "v.scale" : "4";
  const source = stage.smooth
    ? `    // ${c("Smooth noise: nearby points get nearby values, from 0 to 1.", "Ruido suave: puntos cercanos dan valores cercanos, de 0 a 1.")}
    const noise = makeNoise2D(ctx.rng("noise"));
`
    : `    const rng = ctx.rng("size");
`;
  const value = stage.smooth
    ? `      const n = noise(cx * ${zoom}, cy * ${zoom});`
    : `      // ${c("A random number per cell: neighbours have nothing in common.", "Un número al azar por celda: las vecinas no tienen nada en común.")}
      const n = rng();`;
  const pick = stage.colors
    ? `      // ${c("Noise mostly stays between 0.2 and 0.8: stretch that part to the whole palette.", "El ruido casi siempre queda entre 0.2 y 0.8: estira esa parte a toda la paleta.")}
      const t = Math.min(0.999, Math.max(0, (n - 0.2) / 0.6));
      const color = colors[Math.floor(t * colors.length)];
`
    : "";
  const ink = stage.colors ? "color" : `"#264653"`;
  const draw = stage.lines
    ? `      // ${c("A short line through the centre, turned by the noise: a flow field.", "Una línea corta por el centro, girada por el ruido: un campo de flujo.")}
      const a = n * TAU;
      const h = Math.min(cell.w, cell.h) * 0.45;
      items.push({ type: "polyline", points: [[cx - dcos(a) * h, cy - dsin(a) * h], [cx + dcos(a) * h, cy + dsin(a) * h]], stroke: ${ink}, strokeWidth: 0.003 });`
    : `      const s = Math.min(cell.w, cell.h) * n;
      items.push({ type: "rect", x: cx - s / 2, y: cy - s / 2, w: s, h: s, fill: ${ink} });`;
  return `// ${c("Lesson: smooth noise. Press R to see other seeds.", "Lección: ruido suave. Presiona R para ver otras semillas.")}
layer({
  label: "${c("Noise", "Ruido")}",
  params: {${scaleParam}},
  apply(scene, v, ctx) {
    const items = [];
    const colors = scene.palette ? scene.palette.colors : ["#264653"];
${source}    for (const cell of scene.cells) {
      const cx = cell.x + cell.w / 2;
      const cy = cell.y + cell.h / 2;
${value}
${pick}${draw}
    }
    return addItems(scene, items);
  },
});
`;
}

const NOISE_START: NoiseStage = { smooth: false, scale: false, colors: false, lines: false };
const NOISE_1: NoiseStage = { ...NOISE_START, smooth: true };
const NOISE_2: NoiseStage = { ...NOISE_1, scale: true };
const NOISE_3: NoiseStage = { ...NOISE_2, colors: true };
const NOISE_4: NoiseStage = { ...NOISE_3, lines: true };

const noise: Lesson = {
  id: "noise",
  title: t("Smooth noise", "Ruido suave"),
  summary: t(
    "Replace scattered randomness with noise that flows across the canvas, then let it pick colors and turn lines.",
    "Cambia el azar disperso por un ruido que fluye por el lienzo, y deja que elija colores y gire líneas.",
  ),
  start: (lang) => noiseCode(lang, NOISE_START),
  steps: [
    {
      title: t("Smooth instead of random", "Suave en vez de al azar"),
      body: t(
        "Right now every cell asks `rng()` for its size, so neighbours have nothing in common: it looks like static.\n\n`makeNoise2D(rng)` gives a function `noise(x, y)` that returns 0 to 1 too, but nearby points get nearby values. Show me sizes each square by the noise at its centre, and the sizes start to flow.",
        "Ahora cada celda le pide su tamaño a `rng()`, así que las vecinas no tienen nada en común: parece estática de televisión.\n\n`makeNoise2D(rng)` da una función `noise(x, y)` que también devuelve de 0 a 1, pero puntos cercanos dan valores cercanos. Muéstrame da a cada cuadrado el tamaño del ruido en su centro, y los tamaños empiezan a fluir.",
      ),
      code: (lang) => noiseCode(lang, NOISE_1),
    },
    {
      title: t("Zoom in and out", "Acercar y alejar"),
      body: t(
        "Multiplying the position before asking the noise (`cx * 4`) zooms it. A small number spreads one gentle wave across the canvas; a large one packs many small waves in.\n\nShow me turns the 4 into a Scale setting. Slide it from one end to the other.",
        "Multiplicar la posición antes de preguntarle al ruido (`cx * 4`) es como hacer zoom. Un número pequeño reparte una onda suave por todo el lienzo; uno grande mete muchas ondas pequeñas.\n\nMuéstrame convierte el 4 en un control Escala. Deslízalo de un extremo al otro.",
      ),
      code: (lang) => noiseCode(lang, NOISE_2),
    },
    {
      title: t("Noise picks the colors", "El ruido elige los colores"),
      body: t(
        "Noise spends most of its time between about 0.2 and 0.8 and seldom reaches 0 or 1. Show me stretches that middle part to cover 0 to 1, then uses it to pick a palette color, so colors form smooth regions too.\n\n`Math.max` and `Math.min` keep the stretched number inside 0 to 1.",
        "El ruido pasa la mayor parte del tiempo entre 0.2 y 0.8 más o menos, y casi nunca llega a 0 o a 1. Muéstrame estira esa parte central para que cubra de 0 a 1 y la usa para elegir un color de la paleta, así que los colores también forman regiones suaves.\n\n`Math.max` y `Math.min` mantienen el número estirado entre 0 y 1.",
      ),
      code: (lang) => noiseCode(lang, NOISE_3),
    },
    {
      title: t("Noise turns lines", "El ruido gira líneas"),
      body: t(
        "Noise can drive anything, not only size. Show me draws a short line through each cell, turned by the noise: `a = n * TAU` is an angle (TAU is a full turn), and `dcos(a)` and `dsin(a)` give its direction.\n\nThe result is a flow field, and lines are what a pen plotter draws. Use `dsin` and `dcos` rather than `Math.sin` and `Math.cos`: they give the same picture in every browser.\n\nTip: hide the Cell fill layer (its eye, in the layer list) to see your lines on their own.",
        "El ruido puede mover cualquier cosa, no solo el tamaño. Muéstrame dibuja una línea corta en cada celda, girada por el ruido: `a = n * TAU` es un ángulo (TAU es una vuelta completa), y `dcos(a)` y `dsin(a)` dan su dirección.\n\nEl resultado es un campo de flujo, y las líneas son lo que dibuja un plotter. Usa `dsin` y `dcos` en vez de `Math.sin` y `Math.cos`: dan la misma imagen en todos los navegadores.\n\nConsejo: oculta la capa Cell fill (su ojo, en la lista de capas) para ver tus líneas solas.",
      ),
      code: (lang) => noiseCode(lang, NOISE_4),
    },
  ],
};

export const LESSONS: readonly Lesson[] = [firstGrid, seeds, noise];

export const lessonById = (id: string): Lesson | undefined => LESSONS.find((l) => l.id === id);
