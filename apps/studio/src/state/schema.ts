import type { ArtDocument } from "@gridloom/core";
import { defaultRegistry, getModule } from "@gridloom/core";
import { MAX_LAYERS, MAX_WEIGHT } from "./limits.ts";
import { z } from "zod";

const VariationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("range"),
    min: z.number().finite(),
    max: z.number().finite(),
    dist: z.enum(["uniform", "low", "high", "gaussian"]),
  }),
  z.object({
    kind: z.literal("weights"),
    weights: z.record(z.string().max(64), z.number().finite().min(0).max(MAX_WEIGHT)),
  }),
]);

const ParamSettingSchema = z.object({
  value: z.union([z.number().finite(), z.string().max(64), z.boolean()]),
  vary: VariationSchema.optional(),
  locked: z.boolean().optional(),
});

const LayerSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  module: z.string().refine((m) => getModule(defaultRegistry, m) !== undefined, "unknown module"),
  enabled: z.boolean(),
  params: z.record(z.string().max(64), ParamSettingSchema),
});

export const ArtDocumentSchema = z
  .object({
    version: z.literal(1),
    name: z.string().max(100),
    layers: z.array(LayerSchema).min(1).max(MAX_LAYERS),
  })
  .refine((d) => d.layers[0]?.module === "canvas", "first layer must be canvas")
  .refine((d) => new Set(d.layers.map((l) => l.id)).size === d.layers.length, "layer ids must be unique");

/** Validate untrusted input (URL fragment, imported file). Returns null when invalid. */
export function parseDocument(input: unknown): ArtDocument | null {
  const result = ArtDocumentSchema.safeParse(input);
  // Zod output differs only by explicit `undefined` on optional keys; JSON round-trip drops them.
  return result.success ? (JSON.parse(JSON.stringify(result.data)) as ArtDocument) : null;
}
