import type { Item, Scene } from "../scene.ts";

/** Structural subset of CanvasRenderingContext2D / OffscreenCanvasRenderingContext2D. */
export interface Ctx2D {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
}

function roundedRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (rr <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function paint(ctx: Ctx2D, it: Item): void {
  if (it.fill) {
    ctx.fillStyle = it.fill;
    ctx.fill();
  }
  if (it.stroke) {
    ctx.strokeStyle = it.stroke;
    ctx.lineWidth = it.strokeWidth ?? 0.002;
    ctx.stroke();
  }
}

/**
 * `bleed` is half a device pixel in scene units. Square, unstroked rects are
 * grown by it so flush neighbours do not show anti-aliasing seams.
 */
function drawItem(ctx: Ctx2D, it: Item, bleed: number): void {
  switch (it.type) {
    case "rect": {
      const e = !it.r && !it.stroke ? bleed : 0;
      roundedRect(ctx, it.x - e, it.y - e, it.w + 2 * e, it.h + 2 * e, it.r ?? 0);
      break;
    }
    case "circle":
      ctx.beginPath();
      ctx.arc(it.cx, it.cy, it.r, 0, Math.PI * 2);
      break;
    case "polyline": {
      ctx.beginPath();
      it.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      if (it.closed) ctx.closePath();
      break;
    }
  }
  paint(ctx, it);
}

/**
 * Draw a scene into a context whose buffer is pxWidth x pxHeight.
 * Re-render at a larger size for high-res export; never upscale.
 */
export function drawScene(ctx: Ctx2D, scene: Scene, pxWidth: number, pxHeight: number): void {
  const s = Math.min(pxWidth / scene.width, pxHeight / scene.height);
  ctx.save();
  ctx.clearRect(0, 0, pxWidth, pxHeight);
  ctx.scale(s, s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  roundedRect(ctx, 0, 0, scene.width, scene.height, scene.cornerRadius);
  ctx.fillStyle = scene.background;
  ctx.fill();
  ctx.clip();
  const bleed = 0.5 / s;
  scene.items.forEach((it) => drawItem(ctx, it, bleed));
  ctx.restore();
}

/** Pixel size for a scene given the long-side length. */
export function pixelSize(scene: Scene, longSide: number): { width: number; height: number } {
  const long = Math.max(scene.width, scene.height);
  return {
    width: Math.round((scene.width / long) * longSide),
    height: Math.round((scene.height / long) * longSide),
  };
}
