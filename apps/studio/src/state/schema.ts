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

export const MAX_TRAITS = 16;
export const MAX_BINS = 12;

const TraitSchema = z.object({
  name: z.string().trim().min(1).max(40),
  layerId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  param: z.string().regex(/^[A-Za-z0-9_]{1,64}$/),
  bins: z
    .array(z.object({ label: z.string().trim().min(1).max(40), upTo: z.number().finite().optional() }))
    .max(MAX_BINS)
    .superRefine((bins, ctx) => {
      // Ascending bounds, then exactly one catch-all, last: labels and expected shares then always agree.
      bins.forEach((b, i) => {
        const last = i === bins.length - 1;
        if (last !== (b.upTo === undefined)) ctx.addIssue({ code: "custom", message: "only the last bin is the catch-all" });
        const prev = bins[i - 1]?.upTo;
        if (b.upTo !== undefined && prev !== undefined && b.upTo <= prev) ctx.addIssue({ code: "custom", message: "bin bounds must ascend" });
      });
    })
    .optional(),
});

export const ArtDocumentSchema = z
  .object({
    version: z.literal(1),
    name: z.string().max(100),
    layers: z.array(LayerSchema).min(1).max(MAX_LAYERS),
    traits: z.array(TraitSchema).max(MAX_TRAITS).optional(),
  })
  .refine((d) => d.layers[0]?.module === "canvas", "first layer must be canvas")
  .refine((d) => new Set(d.layers.map((l) => l.id)).size === d.layers.length, "layer ids must be unique")
  .refine((d) => new Set((d.traits ?? []).map((t) => t.name)).size === (d.traits ?? []).length, "trait names must be unique");

/** Validate untrusted input (URL fragment, imported file). Returns null when invalid. */
export function parseDocument(input: unknown): ArtDocument | null {
  const result = ArtDocumentSchema.safeParse(input);
  // Zod output differs only by explicit `undefined` on optional keys; JSON round-trip drops them.
  return result.success ? (JSON.parse(JSON.stringify(result.data)) as ArtDocument) : null;
}
