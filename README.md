# Gridloom

An open-source studio for grid and tile generative art. You compose a piece by stacking layers and moving sliders, not by writing code. Every output is reproducible from `document + hash`.

MIT licensed. Static web app, no backend.

## Status

- Phase 1 (core engine), done: PRNG and sub-streams, the param system (fixed or variable), the display list, the canvas, palette, grid and cell fill modules, and the SVG and Canvas2D renderers.
- Phase 2 (studio MVP), done: a layer stack, controls generated from each module's params (vary and lock per param), rendering in a Web Worker, document and hash in the URL, PNG/SVG/JSON export, JSON import, undo/redo, keyboard shortcuts, and an offline PWA.
- Phase 3 (modules), done: Insets, Tiles (Truchet), Circuits, Symmetry and Post, plus engine versioning for share links.
- More modules: Maze (walls or corridors on the base grid, with braiding), Halftone (dots sized by a field), Hatching (plotter-friendly line shading) and Flow (streamlines through a noise field), with the Labyrinth and Currents presets.
- Batch 1 of borrowed ideas (written fresh): Contour (marching-squares topography with faults), Celtic knot (alternating knotwork on the grid), Pipes (one-pass wave function collapse), Circle packing and Threads, with the Knotwork, Topography and Waterworks presets.
- Batch 2, on deterministic `dsin`/`dcos` (Taylor polynomials, + and * only, identical in every engine): Phyllotaxis, Spirograph (and harmonograph), Waves (Chladni plates and interference) and Attractor (Clifford and de Jong), with the Specimens, Resonance, Bloom and Chaos presets.
- Phase 4 (Apophysis features), done: mutation grid, preset library, six original built-in presets.
- Phase 5 (long-form), done: traits with bins, rarity editing, census against the settings' targets, contact sheet, batch export, and a cross-browser determinism check.
- Phase 6 (mint export), self-hosted done: one self-contained `index.html` per piece. Platform adapters come next, each written against that platform's current docs.

## Shortcuts

| Key | Does |
|---|---|
| `R` | new random seed |
| Left / Right | previous / next seed (the trail is remembered) |
| `C` | copy hash |
| `B` | star the seed; favourites show as a strip under the canvas, drawn with the current document |
| `S` / `Shift+S` | PNG at 2000 / 4000 px (re-rendered, never upscaled) |
| `G` | debug panel (hash, timing, resolved values) |
| `F` | fullscreen viewport |
| `T` | tile preview: the piece repeated 3x3 to check that edges join |
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo / redo |
| `M` | mutation grid (1-9 adopt, `R` shuffle, `Esc` close); its Breed mode crosses the piece with a preset |
| `L` | preset library |
| `E` | edition: traits and rarity, census, contact sheet, batch export, plotter SVG, mint export |
| `?` | every shortcut, in one list |

## The layer stack

Layers run top to bottom, in three parts:

- **Pinned at the top:** Canvas, Palette and Grid. Every drawing layer depends on them, so they cannot be moved, removed or hidden.
- **Free in the middle:** the drawing layers, in any order. A second Grid, Palette or Symmetry here becomes a **Re-grid** (the layers below draw on its cells), **Re-palette** (new colors below) or **Mirror** (mirrors only what is above it).
- **Pinned at the end:** Symmetry, then Post. Optional, but always last when present.

Saved pieces and share links keep their exact order. If an older piece has a drawing layer above its grid, the layer is marked and its panel offers the fix.

## Where your work lives

There is no server. A piece is saved in three ways, and only two of them last:

- **Share link** (Link button or the address bar): the document and seed are in the URL. Lasting.
- **Save** (JSON file): a file you keep. Lasting. Open it with Open.
- **Library "Yours"**: stored in this browser, for this one site address only. Presets saved on `localhost` do not appear on the deployed site, and moving the site to another domain leaves them behind. Clearing site data, private windows, or Safari's cleanup of sites you have not visited recently can delete them. Use **Export all** in the library for a backup, and **Import** to bring them into another browser or domain.

If you plan to invite other people, choose the final domain first, so their libraries do not get stranded on an old address.

## Long-form workflow

1. Build the piece and decide the traits (Edition, `E`): 4 to 8 axes, values as words.
2. **Settle the rarity table first.** Each seed picks a value by where its random number falls along the weights, so changing one weight moves the boundaries and many seeds switch value, not only rare ones. A seed you liked can change palette after a rarity tweak. (Share links and saved files carry their own weights, so they keep looking the same.)
3. Run a census at the edition size and fix anything flagged: values that never appear, one value at 80% or more, values expected less than once.
4. Look at many outputs on the contact sheet, then pick favourite seeds.
5. Freeze the document before any mint or public sharing, and export with Batch (PNGs, manifest with seeds and traits, and the document).

## Self-hosted release (Edition > Mint export)

Exports one file named `index.html` (about 40 KB) with the player, the document frozen as it is, and a header documenting the seed format, traits and weights, licences and the suggested capture size. It follows a minimal contract that most tools understand:

- **Seed in:** `?hash=` (exactly 64 hex, optional `0x`), or `#hash=`. Without one, a random seed is chosen and written into the address bar. Anything else is rejected, never padded: `window.gridloomError` is set and a `genart:error` event fires.
- **Size:** `?width=` or `?height=` fixes that side in pixels and the other follows the aspect; both together fit the piece inside that box. Without them it fits the window, and resizes redraw the same piece. Capped at 8192 px a side and 16.7 megapixels so every current browser can draw it.
- **Features out:** `window.$features`, computed from the hash before anything is drawn.
- **Done:** `window.rendered` (the canvas) and a `genart:done` event, once per seed, when its frame is complete.
- **Entry point:** `window.render(hash)`, and `window.gridloom.svg()` for the same piece as SVG.
- **Offline:** a Content-Security-Policy blocks every network request. The e2e test opens the file with the network disabled and checks that features and the display list match the studio byte for byte, plus an A-B-A render, the error signal, sizing, and non-ASCII names.

Host it somewhere permanent (IPFS with a pinning service you pay for, or Arweave); a personal domain is mortal. Freeze the rarity table before exporting.

## Share links and engine versions

A link stores the settings and the seed, not the drawing code. Links carry `e=<engine>`; if a module's output ever changes on purpose, `ENGINE_VERSION` in `packages/core/src/version.ts` is bumped and older links show a notice. `packages/core/test/golden.test.ts` fails whenever an existing module draws differently, so this cannot happen by accident.

## Deploy

Push to `main`. The GitHub Actions workflow typechecks, tests, builds `apps/studio` and publishes it to GitHub Pages. In the repo settings, set Pages to "GitHub Actions" once. There is no server, database or secret to maintain. Renovate (if installed on the repo) batches dependency updates monthly.

## Layout

```
packages/core     pure TS, zero runtime deps; ships inside mint exports
packages/runtime  the player for exported pieces (built to one IIFE) and the HTML assembler
apps/studio       Vite + React 19 + Tailwind 4 static app (PWA)
```

## Core concepts

- **Document:** an ordered stack of layers. Each layer names a module and holds its param settings.
- **Param setting:** a fixed `value`, plus an optional `vary` (range with a distribution, or weights), plus `locked`.
- **Hash:** 64 hex chars. Every layer, param and draw domain gets its own named sub-stream, so adding something never reshuffles the rest of an edition.
- **Display list:** modules emit primitives in normalised space (short side = 1), and renderers scale once.

## Determinism rules (enforced by tests)

- No `Math.random`, `Date.now`, `performance.now` or `crypto` in `packages/core/src`.
- One color draw per cell regardless of fill outcome, so changing a probability does not repaint the rest.
- Layer ids name random streams: never reuse or renumber them.

## Develop

```
pnpm install
pnpm -r test
pnpm -r typecheck
pnpm build && pnpm preview                   # production build served locally
pnpm e2e                                     # cross-browser determinism check (Playwright)
node packages/core/scripts/render.ts 9 out   # SVG previews of the starter document
```

## Credits

Techniques used (grid subdivision, Truchet tiling, orthogonal routing, value noise) are shared heritage. The PRNG is sfc32 (Chris Doty-Humphrey, PractRand), seeded per the genart determinism notes. Palettes are original and released as CC0.
