import { runScript } from "../script.ts";
import { defineModule } from "./types.ts";

/**
 * A layer drawn by the user's own code. Its params and label live on the layer (see script.ts);
 * this definition only hands the drawing to the script runner.
 */
export const scriptModule = defineModule({
  id: "script",
  label: "Script",
  description: "Your own code: draw with the same shapes and helpers as the built-in layers.",
  params: {},
  apply(scene, v, ctx) {
    // A script layer without code draws nothing.
    return ctx.script ? runScript(ctx.script, scene, v, ctx) : scene;
  },
});
