import type { ArtDocument, CensusResult, Drawing, ResolvedLayer } from "@gridloom/core";

export interface RenderRequest {
  readonly id: number;
  readonly doc: ArtDocument;
  readonly hash: string;
  /** Available box in device pixels; the scene is fitted inside it. */
  readonly boxWidth: number;
  readonly boxHeight: number;
  /** Already drawn by the script sandbox (documents with script layers): draw this, do not generate. */
  readonly drawing?: Drawing;
}

export type RenderResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly bitmap: ImageBitmap;
      readonly width: number;
      readonly height: number;
      readonly resolved: readonly ResolvedLayer[];
      readonly ms: number;
      readonly cells: number;
      readonly items: number;
    }
  | { readonly id: number; readonly ok: false; readonly error: string };

export interface ThumbJob {
  readonly doc: ArtDocument;
  readonly hash: string;
  /** Already drawn by the script sandbox: draw this, do not generate. */
  readonly drawing?: Drawing;
}

export interface ThumbRequest {
  readonly id: number;
  readonly jobs: readonly ThumbJob[];
  /** Long side in device pixels. */
  readonly size: number;
}

/** One PNG per job, or null where that job failed to render. */
export interface ThumbResponse {
  readonly id: number;
  readonly images: readonly (Blob | null)[];
}

export type ToolRequest =
  | { readonly kind: "census"; readonly doc: ArtDocument; readonly root: string; readonly count: number }
  | { readonly kind: "batch"; readonly doc: ArtDocument; readonly root: string; readonly count: number; readonly size: number; readonly base: string };

export type ToolResponse =
  | { readonly kind: "progress"; readonly done: number; readonly total: number }
  | { readonly kind: "census"; readonly result: CensusResult }
  | { readonly kind: "batch"; readonly zip: Blob }
  | { readonly kind: "error"; readonly error: string };
