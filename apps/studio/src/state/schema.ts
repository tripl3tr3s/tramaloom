import type { ArtDocument, ParamSpecs } from "@gridloom/core";
import { defaultRegistry, getModule } from "@gridloom/core";
import { MAX_LAYERS, MAX_SCRIPT_CHARS, MAX_SCRIPT_PARAMS, MAX_WEIGHT } from "./limits.ts";
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

// Param specs declared by a script layer's code. They drive the settings panel and generation,
// and arrive in untrusted links, so every bound is checked here.
const ParamName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/);
const ParamValueSchema = z.union([z.number().finite(), z.string().max(64), z.boolean()]);
const SpecBase = {
  label: z.string().trim().min(1).max(40),
  help: z.string().max(300).optional(),
  group: z.string().trim().min(1).max(40).optional(),
  showIf: z
    .object({ param: ParamName, is: z.array(ParamValueSchema).max(32).optional(), not: z.array(ParamValueSchema).max(32).optional() })
    .optional(),
};
const HEX6 = /^#[0-9a-fA-F]{6}$/;
const ParamSpecSchema = z
  .discriminatedUnion("kind", [
    z.object({ ...SpecBase, kind: z.literal("number"), min: z.number().finite(), max: z.number().finite(), step: z.number().finite().positive(), default: z.number().finite() }),
    z.object({ ...SpecBase, kind: z.literal("int"), min: z.number().int(), max: z.number().int(), default: z.number().int() }),
    z.object({ ...SpecBase, kind: z.literal("enum"), options: z.array(z.string().min(1).max(40)).min(1).max(32), default: z.string().max(40) }),
    z.object({ ...SpecBase, kind: z.literal("bool"), default: z.boolean() }),
    z.object({ ...SpecBase, kind: z.literal("color"), default: z.string().regex(HEX6, "a color default must look like #12ab9f") }),
  ])
  .superRefine((p, ctx) => {
    if (p.kind === "number" || p.kind === "int") {
      if (!(p.min < p.max)) ctx.addIssue({ code: "custom", message: "min must be below max" });
      if (p.default < p.min || p.default > p.max) ctx.addIssue({ code: "custom", message: "default must be between min and max" });
      if (p.kind === "number" && (p.max - p.min) / p.step > 1_000_000) ctx.addIssue({ code: "custom", message: "step is too small for the range" });
    }
    if (p.kind === "enum") {
      if (new Set(p.options).size !== p.options.length) ctx.addIssue({ code: "custom", message: "options must be unique" });
      if (!p.options.includes(p.default)) ctx.addIssue({ code: "custom", message: "default must be one of the options" });
    }
  });

export const ScriptParamsSchema = z
  .record(ParamName, ParamSpecSchema)
  .refine((ps) => Object.keys(ps).length <= MAX_SCRIPT_PARAMS, `at most ${MAX_SCRIPT_PARAMS} settings`);

const ScriptSchema = z.object({
  api: z.literal(1),
  label: z.string().trim().min(1).max(40),
  code: z.string().max(MAX_SCRIPT_CHARS),
  params: ScriptParamsSchema,
});

const LayerSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    module: z.string().refine((m) => getModule(defaultRegistry, m) !== undefined, "unknown module"),
    enabled: z.boolean(),
    params: z.record(z.string().max(64), ParamSettingSchema),
    script: ScriptSchema.optional(),
  })
  .refine((l) => (l.module === "script") === (l.script !== undefined), "a script layer, and only a script layer, carries a script");

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

/** Validate the params a script declares (as the sandbox reports them). Errors read like "params.rings.default: ...". */
export function parseScriptParams(input: unknown): { readonly ok: true; readonly params: ParamSpecs } | { readonly ok: false; readonly error: string } {
  const result = ScriptParamsSchema.safeParse(input);
  if (result.success) return { ok: true, params: JSON.parse(JSON.stringify(result.data)) as ParamSpecs };
  const issue = result.error.issues[0];
  const where = ["params", ...(issue?.path ?? []).map(String)].join(".");
  return { ok: false, error: `${where}: ${issue?.message ?? "invalid"}` };
}
