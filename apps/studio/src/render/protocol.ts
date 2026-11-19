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
