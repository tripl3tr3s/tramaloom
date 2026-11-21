import { defaultRegistry } from "@gridloom/core";
import { describe, expect, it } from "vitest";
import { loadModuleSource } from "../src/ui/code/moduleSource.ts";

describe("module source for View code", () => {
  it("every built-in module has its own source file, named after its id", async () => {
    for (const id of Object.keys(defaultRegistry)) {
      const src = await loadModuleSource(id);
      expect(src, id).toContain(`id: "${id}"`);
      expect(src, id).toContain("apply(");
    }
  });

  it("an unknown id has no source", async () => {
    expect(await loadModuleSource("nope")).toBeNull();
  });
});
