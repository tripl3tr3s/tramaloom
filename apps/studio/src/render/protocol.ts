import type { ArtDocument, ResolvedLayer } from "@gridloom/core";

export interface RenderRequest {
  readonly id: number;
  readonly doc: ArtDocument;
  readonly hash: string;
  /** Available box in device pixels; the scene is fitted inside it. */
  readonly boxWidth: number;
  readonly boxHeight: number;
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
