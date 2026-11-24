/**
 * Learn's reading material, in English and Spanish: a no-code guide to a first pen plot, and a
 * glossary of the words the studio uses. Interface names (buttons, tabs) match the studio's
 * labels in each language; module and preset names stay as they appear in the layer list.
 */
import type { Text } from "./lessons.ts";

const t = (en: string, es: string): Text => ({ en, es });

export interface GuideStep {
  readonly title: Text;
  /** Paragraphs separated by blank lines; `backticks` mark names to look for. */
  readonly body: Text;
}

export const PLOT_GUIDE: { readonly title: Text; readonly summary: Text; readonly steps: readonly GuideStep[] } = {
  title: t("Plot your first piece", "Dibuja tu primera pieza con plotter"),
  summary: t(
    "From a preset to a sheet of paper, without writing code.",
    "De un preset a una hoja de papel, sin escribir código.",
  ),
  steps: [
    {
      title: t("Start from lines", "Empieza con líneas"),
      body: t(
        "A pen plotter draws lines, so begin with a piece made of them. Open the Library (`L`) and pick `Currents`, `Topography`, `Knotwork`, `Specimens` or `Resonance`: they are all lines.\n\nAvoid `Chaos` for now: it is thousands of dots, and each dot is a pen tap. It would take hours.",
        "Un plotter dibuja líneas, así que empieza con una pieza hecha de líneas. Abre la Biblioteca (`L`) y elige `Currents`, `Topography`, `Knotwork`, `Specimens` o `Resonance`: todas son líneas.\n\nPor ahora evita `Chaos`: son miles de puntos, y cada punto es un toque de pluma. Tardaría horas.",
      ),
    },
    {
      title: t("Find a seed you like", "Encuentra una semilla que te guste"),
      body: t(
        "Press `R` for new seeds and the Left arrow to go back. Press `B` to star the ones you like; they collect in the strip under the picture.\n\nMove a few sliders on the right if you want. Fewer, longer lines plot faster than many short ones.",
        "Presiona `R` para ver otras semillas y la flecha izquierda para volver. Presiona `B` para marcar con estrella las que te gusten; se juntan en la tira bajo la imagen.\n\nSi quieres, mueve algunas barras de la derecha. Menos líneas y más largas se dibujan más rápido que muchas cortas.",
      ),
    },
    {
      title: t("Check what the pen will draw", "Revisa lo que dibujará la pluma"),
      body: t(
        "Open `Edition`, then `Plotter`. The preview shows the plot on paper: every shape becomes its outline, and each color becomes a separate pen.\n\nFilled areas come out as empty outlines. To shade them, add a `Hatching` layer; to leave them out, hide their layer with its eye.",
        "Abre `Edición` y luego `Plotter`. La vista previa muestra el trazo sobre el papel: cada figura se vuelve su contorno, y cada color es una pluma distinta.\n\nLas zonas rellenas salen como contornos vacíos. Para sombrearlas, agrega una capa `Hatching`; para quitarlas, oculta su capa con su ojo.",
      ),
    },
    {
      title: t("Set up the paper", "Prepara el papel"),
      body: t(
        "Choose the paper size and a margin. Orientation can follow the artwork. The pen list shows each color with its drawing distance, and below it an estimate of the time.\n\nIf the estimate is long, try fewer lines or a smaller grid before plotting.",
        "Elige el tamaño de papel y un margen. La orientación puede seguir a la obra. La lista de plumas muestra cada color con la distancia que dibuja, y debajo un tiempo estimado.\n\nSi el tiempo es largo, prueba con menos líneas o una cuadrícula más chica antes de dibujar.",
      ),
    },
    {
      title: t("Save the file", "Guarda el archivo"),
      body: t(
        "`Download SVG` saves one file with a layer per pen, sized in millimetres for the paper you chose. If your plotter takes one pen at a time, `One file per pen` gives a separate file for each.\n\nOpen it in your plotter's software (for example Inkscape with your plotter's extension). Each pen is its own layer there.",
        "`Descargar SVG` guarda un archivo con una capa por pluma, medido en milímetros para el papel que elegiste. Si tu plotter usa una pluma a la vez, `Un archivo por pluma` da un archivo para cada una.\n\nÁbrelo en el programa de tu plotter (por ejemplo Inkscape con la extensión de tu plotter). Ahí cada pluma es su propia capa.",
      ),
    },
    {
      title: t("Plot", "Dibuja"),
      body: t(
        "Try it first on cheap paper. Plot the first pen, change the pen, plot the next: they land in the same place.\n\nYour piece is a document plus a seed, so `Export` > `Copy share link` or `Save document` keeps it, and you can plot it again any time.",
        "Pruébalo primero en papel barato. Dibuja la primera pluma, cambia la pluma y dibuja la siguiente: caen en el mismo lugar.\n\nTu pieza es un documento más una semilla, así que `Exportar` > `Copiar enlace` o `Guardar documento` la conserva, y puedes volver a dibujarla cuando quieras.",
      ),
    },
  ],
};

export interface GlossaryEntry {
  readonly term: Text;
  readonly meaning: Text;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: t("Seed", "Semilla"),
    meaning: t(
      "The number that makes every random choice in a picture. The same settings with the same seed always draw the same picture; a new seed draws a new one.",
      "El número que toma todas las decisiones al azar de una imagen. Los mismos controles con la misma semilla siempre dibujan la misma imagen; otra semilla dibuja otra.",
    ),
  },
  {
    term: t("Hash", "Hash"),
    meaning: t(
      "How a seed is written: 64 letters and digits, shown in the toolbar. Paste one there to go straight to that seed.",
      "La forma en que se escribe una semilla: 64 letras y números, a la vista en la barra superior. Pega uno ahí para ir directo a esa semilla.",
    ),
  },
  {
    term: t("Layer", "Capa"),
    meaning: t(
      "One step of the picture, drawn on top of the ones above it in the list: a grid, a palette, shapes, lines, a finish.",
      "Un paso de la imagen, que se dibuja encima de los de arriba en la lista: una cuadrícula, una paleta, figuras, líneas, un acabado.",
    ),
  },
  {
    term: t("Setting", "Control"),
    meaning: t(
      "A value a layer reads: a slider, a choice, a color or a switch in the panel on the right. In code they are called params.",
      "Un valor que lee una capa: una barra, una opción, un color o un interruptor en el panel de la derecha. En el código se llaman params.",
    ),
  },
  {
    term: t("Vary", "Variar (vary)"),
    meaning: t(
      "Lets the seed choose a setting's value inside a range (or from weighted options), so one document becomes a family of pictures.",
      "Deja que la semilla elija el valor de un control dentro de un rango (o entre opciones con pesos), así un documento se vuelve una familia de imágenes.",
    ),
  },
  {
    term: t("Lock", "Fijar (lock)"),
    meaning: t("Keeps a setting as it is while mutating or breeding.", "Mantiene un control tal como está al mutar o cruzar."),
  },
  {
    term: t("Document", "Documento"),
    meaning: t(
      "The layers and their settings: everything about a piece except the seed. Saved as a .tramaloom.json file or inside a share link.",
      "Las capas y sus controles: todo de una pieza excepto la semilla. Se guarda como archivo .tramaloom.json o dentro de un enlace para compartir.",
    ),
  },
  {
    term: t("Share link", "Enlace para compartir"),
    meaning: t(
      "A web address holding the document and the seed. Opening it redraws the piece; nothing is stored on a server.",
      "Una dirección web que guarda el documento y la semilla. Al abrirla se vuelve a dibujar la pieza; nada se guarda en un servidor.",
    ),
  },
  {
    term: t("Palette", "Paleta"),
    meaning: t("The set of colors the drawing layers choose from.", "El conjunto de colores entre los que eligen las capas de dibujo."),
  },
  {
    term: t("Grid and cells", "Cuadrícula y celdas"),
    meaning: t(
      "The Grid layer splits the canvas into cells; most drawing layers draw something in each cell.",
      "La capa Cuadrícula divide el lienzo en celdas; la mayoría de las capas de dibujo dibujan algo en cada celda.",
    ),
  },
  {
    term: t("Noise", "Ruido"),
    meaning: t(
      "Randomness that changes smoothly across the canvas, so nearby places look alike: good for waves, flows and gradients.",
      "Azar que cambia suavemente por el lienzo, así que los lugares cercanos se parecen: bueno para ondas, flujos y degradados.",
    ),
  },
  {
    term: t("Mutate", "Mutar"),
    meaning: t(
      "Shows variations of your piece with nearby settings; pick one to make it the new centre.",
      "Muestra variaciones de tu pieza con controles cercanos; elige una para volverla el nuevo centro.",
    ),
  },
  {
    term: t("Breed", "Cruzar"),
    meaning: t(
      "Makes children of two pieces: each setting comes from one parent or the other.",
      "Crea hijos de dos piezas: cada control viene de uno de los dos padres.",
    ),
  },
  {
    term: t("Trait", "Rasgo"),
    meaning: t(
      "A named feature of a piece that collectors can read, such as its palette or how dense it is, worked out from the seed.",
      "Una característica con nombre que los coleccionistas pueden leer, como su paleta o qué tan densa es, calculada a partir de la semilla.",
    ),
  },
  {
    term: t("Rarity", "Rareza"),
    meaning: t("How often each value of a trait turns up across many seeds.", "Qué tan seguido aparece cada valor de un rasgo entre muchas semillas."),
  },
  {
    term: t("Census", "Censo"),
    meaning: t(
      "Counts the traits over many seeds, to check the rarities before releasing an edition.",
      "Cuenta los rasgos en muchas semillas, para revisar las rarezas antes de publicar una edición.",
    ),
  },
  {
    term: t("Edition", "Edición"),
    meaning: t(
      "A release of many pieces from one document, one per seed. The Edition panel holds the tools for it; you do not need them to make or export a picture.",
      "Una publicación de muchas piezas a partir de un documento, una por semilla. El panel Edición tiene las herramientas para ello; no las necesitas para crear o exportar una imagen.",
    ),
  },
  {
    term: t("Mint", "Acuñar (mint)"),
    meaning: t(
      "Publishing a generative piece so each collector gets their own seed. Mint export makes a self-contained web page that draws any seed.",
      "Publicar una pieza generativa para que cada coleccionista reciba su propia semilla. Exportar para mint crea una página web autónoma que dibuja cualquier semilla.",
    ),
  },
  {
    term: t("Plotter", "Plotter"),
    meaning: t(
      "A machine that moves a real pen over paper. It draws lines, so filled shapes come out as outlines.",
      "Una máquina que mueve una pluma de verdad sobre el papel. Dibuja líneas, así que las figuras rellenas salen como contornos.",
    ),
  },
  {
    term: t("Pen and pen lift", "Pluma y levantada"),
    meaning: t(
      "Each color is plotted with its own pen. Every separate line makes the pen lift and come down again, which takes most of a plot's time.",
      "Cada color se dibuja con su propia pluma. Cada línea separada obliga a la pluma a subir y volver a bajar, y eso se lleva la mayor parte del tiempo de un trazo.",
    ),
  },
  {
    term: t("Script layer", "Capa de script"),
    meaning: t(
      "A layer drawn by your own JavaScript. Learn's lessons show how to write one.",
      "Una capa dibujada por tu propio JavaScript. Las lecciones de Aprender enseñan a escribir una.",
    ),
  },
  {
    term: t("Sandbox", "Sandbox (zona aislada)"),
    meaning: t(
      "Where script code runs: walled off from your saved pieces and the internet, and stopped if it runs too long.",
      "Donde se ejecuta el código de los scripts: separado de tus piezas guardadas y de internet, y detenido si tarda demasiado.",
    ),
  },
];
