/** Messages between the studio and the script sandbox's worker. Each response arrives as one JSON string, and is untrusted. */
import type { ArtDocument, Drawing, ResolvedLayer } from "@tramaloom/core";

export type SandboxRequest =
  | { readonly id: number; readonly op: "compile"; readonly code: string }
  | { readonly id: number; readonly op: "draw"; readonly doc: ArtDocument; readonly hash: string };

export type SandboxResponse =
  | { readonly id: number; readonly ok: true; readonly op: "compile"; readonly label: string; readonly params: unknown }
  | { readonly id: number; readonly ok: true; readonly op: "draw"; readonly resolved: readonly ResolvedLayer[]; readonly drawing: Drawing }
  | { readonly id: number; readonly ok: false; readonly error: string; readonly line: number | null };
