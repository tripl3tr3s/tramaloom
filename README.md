# Gridloom

An open-source studio for grid and tile generative art. You compose a piece by stacking layers and moving sliders, not by writing code. Every output is reproducible from `document + hash`.

MIT licensed. Static web app, no backend.

## Status

- Phase 1 (core engine), done: PRNG and sub-streams, the param system (fixed or variable), the display list, the canvas, palette, grid and cell fill modules, and the SVG and Canvas2D renderers.
- Phase 2 (studio MVP), done: a layer stack, controls generated from each module's params (vary and lock per param), rendering in a Web Worker, document and hash in the URL, PNG/SVG/JSON export, JSON import, undo/redo, keyboard shortcuts, and an offline PWA.

## Shortcuts

| Key | Does |
|---|---|
| `R` | new random seed |
| Left / Right | previous / next seed (the trail is remembered) |
| `C` | copy hash |
| `S` / `Shift+S` | PNG at 2000 / 4000 px (re-rendered, never upscaled) |
| `G` | debug panel (hash, timing, resolved values) |
| `F` | fullscreen viewport |
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo / redo |

## Deploy

Push to `main`. The GitHub Actions workflow typechecks, tests, builds `apps/studio` and publishes it to GitHub Pages. In the repo settings, set Pages to "GitHub Actions" once. There is no server, database or secret to maintain. Renovate (if installed on the repo) batches dependency updates monthly.

## Layout

```
packages/core   pure TS, zero runtime deps; ships inside mint exports
apps/studio     Vite + React 19 + Tailwind 4 static app (PWA)
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
node packages/core/scripts/render.ts 9 out   # SVG previews of the starter document
```

## Credits

Techniques used (grid subdivision, Truchet tiling, orthogonal routing, value noise) are shared heritage. The PRNG is sfc32 (Chris Doty-Humphrey, PractRand), seeded per the genart determinism notes. Palettes are original and released as CC0.
