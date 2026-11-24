import type { ModuleTexts } from "./types.ts";

/** Lienzo, Paleta, Cuadrícula (pinned at the top), Simetría and Acabado (pinned at the end), Script. */
export const SETUP_ES: ModuleTexts = {
  canvas: {
    label: "Lienzo",
    description: "Formato, margen y fondo. Siempre es la primera capa.",
    params: {
      aspect: { label: "Proporción", help: "Ancho contra alto de la pieza" },
      margin: { label: "Margen", help: "Borde vacío alrededor de la obra, como parte del lado corto" },
      background: { label: "Fondo", help: "Color detrás de todo; el Fondo de la capa Paleta puede reemplazarlo" },
      cornerRadius: { label: "Radio de esquina", help: "Redondea las esquinas del lienzo; 0 las deja rectas, como necesita un mosaico sin uniones" },
    },
  },
  palette: {
    label: "Paleta",
    description: "Elige los colores y divide el lienzo en zonas de color.",
    params: {
      palette: {
        label: "Paleta",
        help: "El juego de colores del que dibujan todas las capas",
        options: { harbor: "puerto", ember: "brasa", moss: "musgo", bloom: "flor", signal: "señal", orchard: "huerto", ink: "tinta", lagoon: "laguna" },
      },
      shuffle: { label: "Revolver orden", help: "Revuelve el orden de los colores, así las escalas y las zonas empiezan con otro color" },
      zoneMode: {
        label: "Zonas",
        help: "Divide el lienzo en regiones que usan cada una algunos de los colores",
        options: {
          none: "ninguna",
          "split-x": "corte vertical",
          "split-y": "corte horizontal",
          quadrants: "cuadrantes",
          diagonal: "diagonal",
          radial: "radial",
          noise: "ruido",
        },
      },
      zoneCount: { label: "Número de zonas", help: "Cuántas regiones" },
      colorsPerZone: { label: "Colores por zona", help: "Cuántos colores usa cada región" },
      zoneShift: { label: "Desplazar zonas", help: "Cambia qué colores le tocan a cada región" },
      background: {
        label: "Fondo",
        help: "lienzo deja el color de la capa Lienzo; las demás toman un lugar de la paleta",
        options: { canvas: "lienzo", first: "primero", middle: "de en medio", last: "último" },
      },
      noiseScale: { label: "Escala del ruido", help: "Zonas de ruido: manchas por ancho del lienzo" },
    },
  },
  grid: {
    label: "Cuadrícula",
    description: "Acomoda celdas dentro del marco, con subdivisión recursiva y máscara opcionales.",
    params: {
      cols: { label: "Columnas", help: "Celdas a lo ancho" },
      rows: { label: "Filas", help: "Celdas a lo alto" },
      fit: {
        label: "Ajuste",
        help: "auto: celdas cuadradas, y las filas salen de las columnas para llenar el marco",
        options: { auto: "auto", square: "cuadrado", stretch: "estirar" },
      },
      subdivDepth: { label: "Profundidad de subdivisión", help: "Cuántas veces una celda puede partirse en cuatro más chicas" },
      splitChance: { label: "Probabilidad de partir", help: "Probabilidad de que una celda se parta, en cada nivel" },
      gap: { label: "Separación", help: "Espacio entre celdas, como parte del lado corto" },
      mask: {
        label: "Máscara",
        help: "Quita las celdas fuera de una forma; las capas de dibujo se saltan las celdas quitadas",
        options: { none: "ninguna", circle: "círculo", diamond: "rombo", noise: "ruido" },
      },
      maskAmount: { label: "Cantidad de máscara", help: "Tamaño de la forma de la máscara, o cuánto quita la máscara de ruido" },
    },
  },
  symmetry: {
    label: "Simetría",
    description: "Refleja o gira todo lo que dibujaron las capas de arriba, rehecho a partir de una mitad o un cuarto.",
    params: {
      mode: {
        label: "Modo",
        help: "espejo horizontal: izquierda/derecha; cuatro cuadrantes: ambos ejes; girar 4 necesita un lienzo 1:1, en otras proporciones las copias se estiran",
        options: {
          "mirror-x": "espejo horizontal",
          "mirror-y": "espejo vertical",
          quad: "cuatro cuadrantes",
          "rotate-2": "girar 2",
          "rotate-4": "girar 4",
        },
      },
      source: {
        label: "Origen",
        help: "Qué mitad (izquierda/arriba) o cuarto se conserva y se copia",
        options: { first: "primera", second: "segunda" },
      },
    },
  },
  post: {
    label: "Acabado",
    description: "Para terminar: un temblor hecho a mano sobre todo lo dibujado, un borde opcional y grano de película encima.",
    params: {
      jitter: {
        label: "Temblor",
        help: "Mueve cada figura por su cuenta (1 es cerca del 1% del lado corto); las vecinas se separan, así que déjalo bajo en cuadrículas al ras",
      },
      border: { label: "Borde", help: "Una línea de marco alrededor de la obra" },
      borderOffset: { label: "Distancia del borde", help: "Distancia por fuera del marco de la obra; limitada para que la línea quede en el lienzo" },
      borderWidth: { label: "Grosor del borde", help: "Grosor de la línea del marco" },
      borderColor: { label: "Color del borde", help: "Color de la línea del marco" },
      grain: { label: "Grano", help: "Cantidad de grano de película encima; 0 para nada" },
      grainSize: { label: "Tamaño del grano", help: "Tamaño de cada grano" },
      grainTone: {
        label: "Tono del grano",
        help: "Grano claro, grano oscuro, o ambos",
        options: { both: "ambos", light: "claro", dark: "oscuro" },
      },
    },
  },
  script: {
    label: "Script",
    description: "Tu propio código: dibuja con las mismas figuras y funciones que las capas integradas.",
    params: {},
  },
};
